/**
 * Electron main process: creates the window, opens the encrypted database,
 * applies the migrations and registers the IPC handlers.
 *
 * Startup (v1.20.0):
 *  1. the window controls and the `security:*` channel are available right away;
 *  2. if a key is stored on the machine, the data opens immediately
 *     (in-memory decryption, migrations, undo journal, handlers);
 *  3. otherwise the setup screen has the key chosen or typed in, then
 *     `security:activate` opens the data the same way;
 *  4. an automatic encrypted backup starts a few seconds after opening.
 */

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
import { hasStoredKey, keyIsProtected, loadKey, storeKey } from "./security/keystore.js";
import {
  VaultError,
  formatRecoveryKey,
  generateKey,
  parseRecoveryKey,
} from "./security/vault.js";
import type { IpcInput, IpcOutput, SecurityStatus } from "../shared/ipc.js";

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
 * - dev (electron-vite): source tree `resources/icon.png`.
 * - packaged: copied into the app resources (see electron-builder.yml).
 *
 * Windows takes the taskbar icon of a packaged app from the executable, which the
 * installer stamps. Passing it here is what gives the right icon in dev, and on
 * Linux, where the window carries its own.
 */
function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "resources", "icon.png");
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

function securityStatus(): SecurityStatus {
  return {
    // A key or an encrypted database exists but nothing is open: the original key is needed.
    state: data ? "ready" : hasStoredKey() || hasEncryptedData(userDir()) ? "locked" : "setup",
    hasEncryptedData: hasEncryptedData(userDir()),
    hasLegacyData: hasLegacyData(userDir()),
    keyProtected: keyIsProtected(),
    defaultBackupDir: defaultBackupDir(),
    error: startupError,
  };
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
        "QOMPTA — CLÉ DE RÉCUPÉRATION",
        "",
        recoveryKey,
        "",
        "Cette clé chiffre vos données comptables et vos sauvegardes.",
        "Sans elle, une sauvegarde ne peut pas être restaurée sur un autre poste.",
        "Conservez ce fichier HORS de l'ordinateur (clé USB, gestionnaire de mots de passe),",
        "et ne le partagez avec personne.",
        "",
        `Créé le ${new Date().toLocaleString("fr-CH")}`,
      ].join("\r\n"),
      "utf8",
    );
    return { saved: true, path: filePath };
  });

  handleSecurity("security:activate", ({ recoveryKey }) => {
    if (data) return { ok: true } as const;
    const key = parseRecoveryKey(recoveryKey);
    if (!key) return { ok: false, error: "Clé illisible : vérifiez la saisie (52 caractères après QK1-)." } as const;
    try {
      startData(key);
    } catch (err) {
      const message =
        err instanceof VaultError && err.code === "wrong-key"
          ? "Cette clé n'ouvre pas les données de ce poste. Saisissez la clé de récupération d'origine."
          : err instanceof Error
            ? err.message
            : String(err);
      return { ok: false, error: message } as const;
    }
    storeKey(key);
    return { ok: true } as const;
  });

  handleSecurity("security:resetData", () => {
    if (data) throw new Error("Les données sont ouvertes : rien à mettre de côté.");
    const path = join(userDir(), DATA_FILE);
    let movedTo: string | null = null;
    if (existsSync(path)) {
      movedTo = `${path}.illisible-${new Date().toISOString().slice(0, 10)}`;
      renameSync(path, movedTo);
    }
    // The machine key opened nothing: it is forgotten along with the set-aside database.
    const keyFile = join(userDir(), "qompta.key");
    if (existsSync(keyFile)) renameSync(keyFile, `${keyFile}.illisible-${new Date().toISOString().slice(0, 10)}`);
    startupError = null;
    return { ok: true, movedTo } as const;
  });

  handleSecurity("security:revealKey", () => {
    if (!data) throw new Error("Les données ne sont pas ouvertes.");
    return { recoveryKey: formatRecoveryKey(data.key) };
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

  const key = hasStoredKey() ? safeLoadKey() : null;
  if (key) {
    try {
      startData(key);
    } catch (err) {
      startupError =
        err instanceof VaultError && err.code === "wrong-key"
          ? "La clé enregistrée sur ce poste n'ouvre pas les données. Saisissez votre clé de récupération."
          : `Impossible d'ouvrir les données : ${err instanceof Error ? err.message : String(err)}`;
      console.error("[qompta] ouverture des données :", err);
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function safeLoadKey(): Buffer | null {
  try {
    return loadKey();
  } catch (err) {
    startupError = "La clé enregistrée sur ce poste est illisible. Saisissez votre clé de récupération.";
    console.error("[qompta] lecture de la clé :", err);
    return null;
  }
}

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
