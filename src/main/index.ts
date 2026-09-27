/**
 * Electron main process: creates the window, opens the encrypted database,
 * applies the migrations and registers the IPC handlers.
 *
 * Startup (v1.21.0):
 *  1. the window controls and the `security:*` channel are available right away;
 *  2. nothing opens without a login: the keyring of the machine (`qompta.keyring`)
 *     gives the key only to the login password or to Windows Hello
 *     (`security:unlock`, `security:unlockHello`), which then open the data
 *     (in-memory decryption, migrations, undo journal, handlers);
 *  3. without a keyring, the setup screen has the key chosen or typed in along with
 *     a password (`security:activate`); the bare key of v1.20.x asks for a password
 *     once (`security:setPassword`);
 *  4. an automatic encrypted backup starts a few seconds after opening.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import { runMigrations } from "../db/migrate.js";
import { createSettingsRepo } from "../db/repositories/settings.repo.js";
import { registerHandlers } from "./ipc/registerHandlers.js";
import { registerWindowHandlers } from "./ipc/windowHandlers.js";
import { DATA_FILE, hasEncryptedData, hasLegacyData, openDataStore, type DataStore } from "./storage.js";
import { installUndoJournal } from "./undo.js";
import { createBackupService } from "./backups.js";
import { helloDelete, helloSign, isHelloSupported } from "./security/hello.js";
import {
  createKeyring,
  helloChallenge,
  helloEnrolled,
  keyMatches,
  openWithHello,
  openWithPassword,
  withHello,
  withoutHello,
  type Keyring,
} from "./security/keyring.js";
import {
  hasKeyring,
  hasLegacyKey,
  keyIsProtected,
  loadKeyring,
  loadLegacyKey,
  removeLegacyKey,
  setAsideKeyFiles,
  storeKeyring,
} from "./security/keystore.js";
import {
  VaultError,
  formatRecoveryKey,
  generateKey,
  parseRecoveryKey,
} from "./security/vault.js";
import type { IpcInput, IpcOutput, SecurityResult, SecurityStatus } from "../shared/ipc.js";

function userDir(): string {
  return app.getPath("userData");
}

function defaultBackupDir(): string {
  return join(app.getPath("documents"), "Qompta", "Sauvegardes");
}

/**
 * Drizzle migrations folder, depending on the execution context.
 * - dev (electron-vite): source tree `src/db/migrations`.
 * - packaged: copied into the app resources (see electron-builder.yml).
 */
function migrationsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "migrations")
    : join(app.getAppPath(), "src", "db", "migrations");
}

/**
 * App icon for the window and the taskbar.
 * - dev (electron-vite): source tree (`build/icon.ico` on Windows, `resources/icon.png`
 *   elsewhere).
 * - packaged: copied into the app resources (see electron-builder.yml).
 *
 * On Windows the window icon is what the taskbar shows. Given the 512 px PNG, Electron
 * shrinks it itself to the 32 px window icon and the taskbar comes out pixelated; the
 * hand-made `build/icon.ico` (provided by Thomas, never delete or regenerate it) is
 * drawn at that size. Linux and macOS keep the PNG.
 */
function appIconPath(): string {
  const file = process.platform === "win32" ? "icon.ico" : "icon.png";
  if (app.isPackaged) return join(process.resourcesPath, file);
  return join(app.getAppPath(), file === "icon.ico" ? "build" : "resources", file);
}

/** Detects a run under WSL (WSLg) in order to adapt the rendering. */
function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

// Under WSLg the GPU process often fails to initialize: switch to software
// rendering to guarantee the window shows. No effect on Windows/macOS.
if (isWsl()) {
  app.disableHardwareAcceleration();
}

/**
 * QomptAI was removed in v1.20.0: its local model (~5 GB in `userData/models`)
 * and its settings must not survive the update.
 */
function purgeAiLeftovers(settings: ReturnType<typeof createSettingsRepo>, store: DataStore): void {
  const models = join(userDir(), "models");
  if (existsSync(models)) {
    try {
      rmSync(models, { recursive: true, force: true });
    } catch (err) {
      console.error("[qompta] suppression du modèle IA impossible :", err);
    }
  }
  const aiKeys = store.sqlite
    .prepare("SELECT key FROM app_settings WHERE key LIKE 'ai:%'")
    .all() as { key: string }[];
  for (const { key } of aiKeys) settings.delete(key);
}

// ─────────────────────────────── Data ──────────────────────────────

let data: { store: DataStore; key: Buffer } | null = null;
let startupError: string | null = null;

/** Opens the data with `key` and registers every business handler. */
function startData(key: Buffer): void {
  const store = openDataStore(userDir(), key);
  runMigrations(store.db, migrationsDir());
  const settings = createSettingsRepo(store.db);
  purgeAiLeftovers(settings, store);
  const undo = installUndoJournal(store.sqlite);
  store.flushNow();

  const backups = createBackupService({ store, key, settings, defaultDir: defaultBackupDir() });
  try {
    backups.ensureDefaultDir();
  } catch (err) {
    console.error("[qompta] dossier des sauvegardes :", err);
  }
  registerHandlers(store.db, { store, backups, undo, key });
  data = { store, key };
  startupError = null;

  // Automatic backup on every launch, without slowing down the opening.
  setTimeout(() => {
    try {
      backups.run();
    } catch (err) {
      console.error("[qompta] sauvegarde automatique :", err);
    }
  }, 4000);
}

/** Keyring of this machine (login password, Windows Hello), once read. */
let keyring: Keyring | null = null;
/** Bare key left by v1.20.x, waiting for a login password. */
let legacyKey: Buffer | null = null;

/** Reads the key files at startup. Nothing opens without a login. */
function loadKeys(): void {
  if (hasKeyring()) {
    try {
      keyring = loadKeyring();
      // Written again by an older Qompta launched meanwhile: the bare key must not stay.
      removeLegacyKey();
      return;
    } catch (err) {
      console.error("[qompta] lecture du trousseau :", err);
      startupError =
        "Le trousseau de connexion de ce poste est illisible. Saisissez votre clé de récupération et choisissez un nouveau mot de passe.";
    }
  }
  if (hasLegacyKey()) {
    try {
      legacyKey = loadLegacyKey();
      startupError = null;
    } catch (err) {
      console.error("[qompta] lecture de la clé :", err);
      startupError = "La clé enregistrée sur ce poste est illisible. Saisissez votre clé de récupération.";
    }
  }
}

function securityStatus(): SecurityStatus {
  const encrypted = hasEncryptedData(userDir());
  return {
    state: data
      ? "ready"
      : keyring
        ? "locked"
        : legacyKey
          ? "set-password"
          : encrypted || hasKeyring() || hasLegacyKey()
            ? "recover"
            : "setup",
    hasEncryptedData: encrypted,
    hasLegacyData: hasLegacyData(userDir()),
    keyProtected: keyIsProtected(),
    helloEnrolled: helloEnrolled(keyring),
    defaultBackupDir: defaultBackupDir(),
    error: startupError,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof VaultError && err.code === "wrong-key") {
    return "Cette clé n'ouvre pas les données de ce poste. Saisissez la clé de récupération d'origine.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** Runs a security action; a failure becomes a message for the screen. */
async function attempt(fn: () => void | Promise<void>): Promise<SecurityResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** The data is open and the keyring known: settings actions. */
function unlocked(): { key: Buffer; ring: Keyring } {
  if (!data || !keyring) throw new Error("Les données ne sont pas ouvertes.");
  return { key: data.key, ring: keyring };
}

/** Saves the keyring; the bare key of an older version goes. */
function adoptKeyring(ring: Keyring): void {
  storeKeyring(ring);
  keyring = ring;
  removeLegacyKey();
  legacyKey = null;
  startupError = null;
}

function handleSecurity<C extends `security:${string}` & keyof import("../shared/ipc.js").IpcContract>(
  channel: C,
  fn: (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>,
): void {
  ipcMain.handle(channel, async (_evt, input) => fn(input as IpcInput<C>));
}

function registerSecurityHandlers(): void {
  handleSecurity("security:status", () => securityStatus());

  handleSecurity("security:newKey", () => {
    if (data) throw new Error("Les données sont déjà ouvertes avec une clé.");
    return { recoveryKey: formatRecoveryKey(generateKey()) };
  });

  handleSecurity("security:saveKeyFile", async ({ recoveryKey }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Enregistrer la clé de récupération (idéalement sur une clé USB)",
      defaultPath: join(app.getPath("documents"), "Qompta - cle de recuperation.txt"),
      filters: [{ name: "Texte", extensions: ["txt"] }],
    });
    if (canceled || !filePath) return { saved: false };
    writeFileSync(
      filePath,
      [
        "QOMPTA : CLÉ DE RÉCUPÉRATION",
        "",
        recoveryKey,
        "",
        "Cette clé chiffre vos données comptables et vos sauvegardes.",
        "Sans elle, une sauvegarde ne peut pas être restaurée sur un autre poste,",
        "et un mot de passe de connexion oublié ne peut pas être remplacé.",
        "Conservez ce fichier HORS de l'ordinateur (clé USB, gestionnaire de mots de passe),",
        "et ne le partagez avec personne.",
        "",
        `Créé le ${new Date().toLocaleString("fr-CH")}`,
      ].join("\r\n"),
      "utf8",
    );
    return { saved: true, path: filePath };
  });

  // New key, key of another machine, or forgotten password: the recovery key is the
  // data key itself, so it may always choose a new login password.
  handleSecurity("security:activate", ({ recoveryKey, password }) =>
    attempt(async () => {
      if (data) return;
      const key = parseRecoveryKey(recoveryKey);
      if (!key) throw new Error("Clé illisible : vérifiez la saisie (52 caractères après QK1-).");
      if (keyring && !keyMatches(keyring, key)) {
        throw new Error("Cette clé n'est pas celle de ce poste. Saisissez la clé de récupération d'origine.");
      }
      // Wrapped BEFORE opening: a weak password refuses everything, nothing opens without login.
      const ring = await createKeyring(key, password, { keep: keyring });
      startData(key);
      adoptKeyring(ring);
    }),
  );

  handleSecurity("security:setPassword", ({ password }) =>
    attempt(async () => {
      if (data) return;
      if (!legacyKey) throw new Error("Aucune clé à protéger sur ce poste.");
      const ring = await createKeyring(legacyKey, password);
      try {
        startData(legacyKey);
      } catch (err) {
        legacyKey = null;
        startupError = "La clé enregistrée sur ce poste n'ouvre pas les données. Saisissez votre clé de récupération.";
        throw err;
      }
      adoptKeyring(ring);
    }),
  );

  handleSecurity("security:unlock", ({ password }) =>
    attempt(async () => {
      if (data) return;
      if (!keyring) throw new Error("Aucun mot de passe n'est défini sur ce poste.");
      const key = await openWithPassword(keyring, password);
      // Windows Hello may have won while the password was being checked.
      if (!data) startData(key);
    }),
  );

  handleSecurity("security:unlockHello", () =>
    attempt(async () => {
      if (data) return;
      const challenge = keyring ? helloChallenge(keyring) : null;
      if (!keyring || !challenge) throw new Error("Windows Hello n'est pas activé pour Qompta.");
      const signature = await helloSign(challenge, false);
      const key = openWithHello(keyring, signature);
      signature.fill(0);
      if (!data) startData(key);
    }),
  );

  handleSecurity("security:helloAvailable", () => isHelloSupported());

  handleSecurity("security:enableHello", () =>
    attempt(async () => {
      const { key } = unlocked();
      const challenge = randomBytes(32);
      const signature = await helloSign(challenge, true);
      // The keyring may have changed while Windows Hello was waiting for the user.
      adoptKeyring(withHello(unlocked().ring, key, challenge, signature));
      signature.fill(0);
    }),
  );

  handleSecurity("security:disableHello", () =>
    attempt(async () => {
      adoptKeyring(withoutHello(unlocked().ring));
      await helloDelete();
    }),
  );

  handleSecurity("security:changePassword", ({ current, next }) =>
    attempt(async () => {
      const { key, ring } = unlocked();
      (await openWithPassword(ring, current)).fill(0);
      adoptKeyring(await createKeyring(key, next, { keep: ring }));
    }),
  );

  handleSecurity("security:resetData", () => {
    if (data) throw new Error("Les données sont ouvertes : rien à mettre de côté.");
    const suffix = `illisible-${new Date().toISOString().slice(0, 10)}`;
    const path = join(userDir(), DATA_FILE);
    let movedTo: string | null = null;
    if (existsSync(path)) {
      movedTo = `${path}.${suffix}`;
      renameSync(path, movedTo);
    }
    // The key of this machine opened nothing: it is set aside with the database.
    setAsideKeyFiles(suffix);
    keyring = null;
    legacyKey = null;
    startupError = null;
    return { ok: true, movedTo } as const;
  });

  handleSecurity("security:revealKey", async ({ password }) => {
    try {
      const { key, ring } = unlocked();
      (await openWithPassword(ring, password)).fill(0);
      return { ok: true, recoveryKey: formatRecoveryKey(key) } as const;
    } catch (err) {
      return { ok: false, error: errorMessage(err) } as const;
    }
  });
}

// ────────────────────────────── Window ─────────────────────────────

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    title: "Qompta",
    icon: appIconPath(),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  // Frameless window: if the OS maximizes (snap, shortcut), Windows overflows the
  // screen and clips the top/left. Replaced by an exact fit to the work area.
  win.on("maximize", () => {
    const wa = screen.getDisplayMatching(win.getBounds()).workArea;
    win.unmaximize();
    win.setBounds(wa);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerWindowHandlers();
  registerSecurityHandlers();

  loadKeys();
  // The first Windows Hello check takes a second or two: done ahead of the screens.
  void isHelloSupported();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Last encrypted write before quitting: nothing must stay pending.
app.on("will-quit", () => {
  try {
    data?.store.flushNow();
  } catch (err) {
    console.error("[qompta] écriture finale :", err);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
