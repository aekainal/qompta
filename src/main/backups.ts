/**
 * Encrypted backups: automatic (on every launch), manual, and reading a backup
 * in order to restore it.
 *
 * Every backup is sealed with the machine key (`security/vault.ts`). A backup
 * coming from another machine — hence from another key — is opened with the
 * recovery key of that machine, entered on screen.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { dumpSqliteFile, loadDatabase } from "../db/dump.js";
import type { SettingsRepo } from "../db/repositories/settings.repo.js";
import {
  BACKUP_EXT,
  DEFAULT_RETENTION_DAYS,
  backupDate,
  backupFileName,
  backupsToPrune,
  clampRetentionDays,
  type BackupConfig,
  type BackupEntry,
} from "../shared/backups.js";
import type { DataStore } from "./storage.js";
import { writeAtomic } from "./storage.js";
import {
  VaultError,
  isPlainSqlite,
  isSealedWith,
  isVault,
  parseRecoveryKey,
  seal,
  unseal,
  type VaultKind,
} from "./security/vault.js";

const KEY_DIR = "backup:dir";
const KEY_RETENTION = "backup:retentionDays";
const KEY_LAST = "backup:last";
const KEY_ERROR = "backup:lastError";

/**
 * The file was encrypted with another key and no (or a wrong) recovery key was
 * supplied: the screen must ask for it.
 */
export class NeedsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeedsKeyError";
  }
}

/**
 * Decrypts a Qompta file with the machine key, or failing that with the recovery
 * key entered. Throws `NeedsKeyError` when the key must be asked for (again).
 */
export function unsealWithFallback(
  file: Buffer,
  key: Buffer,
  recoveryKey?: string | null,
): { kind: VaultKind; payload: Buffer } {
  if (isSealedWith(file, key)) return unseal(file, key);
  if (!recoveryKey?.trim()) {
    throw new NeedsKeyError(
      "Ce fichier a été chiffré sur un autre poste (ou avec une ancienne clé). " +
        "Saisissez la clé de récupération qui l'a chiffré.",
    );
  }
  const other = parseRecoveryKey(recoveryKey);
  if (!other) throw new NeedsKeyError("Cette clé de récupération est illisible : vérifiez la saisie.");
  if (!isSealedWith(file, other)) {
    throw new NeedsKeyError("Cette clé n'est pas celle qui a chiffré ce fichier.");
  }
  return unseal(file, other);
}

/** Checks that a copy really is a Qompta database (and not just any SQLite). */
export function assertQomptaImage(image: Buffer): void {
  let probe: ReturnType<typeof loadDatabase> | null = null;
  try {
    probe = loadDatabase(image);
    probe.prepare("SELECT count(*) FROM companies").get();
  } catch {
    throw new Error("Ce fichier ne contient pas une base Qompta valide.");
  } finally {
    probe?.close();
  }
}

export function createBackupService(deps: {
  store: DataStore;
  key: Buffer;
  settings: SettingsRepo;
  /** Documents\Qompta\Sauvegardes. */
  defaultDir: string;
}) {
  const { store, key, settings, defaultDir } = deps;

  function config(): BackupConfig {
    return {
      dir: settings.get<string>(KEY_DIR) || defaultDir,
      defaultDir,
      retentionDays: clampRetentionDays(settings.get<number>(KEY_RETENTION) ?? DEFAULT_RETENTION_DAYS),
      last: settings.get<BackupConfig["last"]>(KEY_LAST),
      lastError: settings.get<string>(KEY_ERROR),
    };
  }

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** Removes the automatic backups that fell out of the retention window. */
  function prune(): string[] {
    const { dir, retentionDays } = config();
    if (!existsSync(dir)) return [];
    const removed = backupsToPrune(readdirSync(dir), new Date(), retentionDays);
    for (const name of removed) rmSync(join(dir, name), { force: true });
    return removed;
  }

  return {
    config,

    setConfig(patch: { dir?: string | null; retentionDays?: number }): BackupConfig {
      if (patch.dir !== undefined) {
        const dir = patch.dir?.trim() || null;
        if (dir) ensureDir(dir);
        settings.set(KEY_DIR, dir);
      }
      if (patch.retentionDays !== undefined) {
        settings.set(KEY_RETENTION, clampRetentionDays(patch.retentionDays));
      }
      return config();
    },

    /** Creates the default folder on first launch. */
    ensureDefaultDir(): void {
      ensureDir(config().dir);
    },

    /** Full backup into the backups folder, then retention. */
    run(tag?: string): { file: string; path: string; size: number } {
      const { dir } = config();
      try {
        ensureDir(dir);
        store.flushNow();
        const file = backupFileName(new Date(), tag);
        const path = join(dir, file);
        const data = seal(store.image(), key, "database");
        writeAtomic(path, data);
        const last = { at: new Date().toISOString(), file, size: data.length };
        settings.set(KEY_LAST, last);
        settings.set(KEY_ERROR, null);
        prune();
        return { file, path, size: data.length };
      } catch (err) {
        settings.set(KEY_ERROR, err instanceof Error ? err.message : String(err));
        throw err;
      }
    },

    /** Full backup to a chosen path (manual backup). */
    writeTo(path: string): number {
      store.flushNow();
      const data = seal(store.image(), key, "database");
      writeAtomic(path, data);
      return data.length;
    },

    list(): BackupEntry[] {
      const { dir } = config();
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith(BACKUP_EXT) && backupDate(f))
        .map((file) => {
          const path = join(dir, file);
          return { file, path, at: backupDate(file)!.toISOString(), size: statSync(path).size };
        })
        .sort((a, b) => b.at.localeCompare(a.at));
    },

    /**
     * SQLite image of a backup: encrypted `.qbak`, or legacy plaintext
     * `.sqlite` backup (versions <= 1.19), accepted so nothing is lost.
     */
    readImage(path: string, recoveryKey?: string | null): Buffer {
      const file = readFileSync(path);
      let image: Buffer;
      if (isVault(file)) {
        const opened = unsealWithFallback(file, key, recoveryKey);
        if (opened.kind !== "database") {
          throw new VaultError("corrupt", "Ce fichier est un export de sociétés : utilisez « Importer un export ».");
        }
        image = opened.payload;
      } else if (isPlainSqlite(file)) {
        image = dumpSqliteFile(path);
      } else {
        throw new Error("Ce fichier n'est pas une sauvegarde Qompta.");
      }
      assertQomptaImage(image);
      return image;
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
