/**
 * Encrypted storage of the application database.
 *
 * The SQLite database runs **in memory**; on disk there is only
 * `qompta.qdb`, sealed with the machine key (see `security/vault.ts`). After every
 * IPC call that changed data, the copy of the database (`db/dump.ts` — absolutely not
 * `serialize()`, which makes Electron crash) is re-encrypted and written
 * (batched over a few hundred milliseconds), then one last time on
 * shutdown. Atomic write: temporary file then rename — a power
 * cut leaves the previous version intact, never a half-written file.
 *
 * Migration: on the first launch of v1.20.0, the old plaintext database
 * (`qompta.sqlite`) is read, sealed, **verified** (read back and decrypted
 * identically), and only then deleted along with its WAL files.
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type BetterSqlite from "better-sqlite3";
import { openDatabaseFromDump, getRawSqlite, type DB } from "../db/client.js";
import { dumpDatabase, dumpSqliteFile } from "../db/dump.js";
import { seal, unseal } from "./security/vault.js";

export const DATA_FILE = "qompta.qdb";
export const LEGACY_FILE = "qompta.sqlite";

/** Batching delay for the writes. */
const FLUSH_DELAY_MS = 400;

export interface DataStore {
  db: DB;
  sqlite: BetterSqlite.Database;
  /** To call after an operation: schedules the write if data has changed. */
  touch(): void;
  /** Writes right away (shutdown, before a backup). */
  flushNow(): void;
  /** Current copy of the database, in clear, in memory (for the backups). */
  image(): Buffer;
  /** Cuts off every write: the database is about to be replaced (restore). */
  freeze(): void;
  /** True if the old plaintext database has just been migrated. */
  migratedLegacy: boolean;
}

export function dataFilePath(dir: string): string {
  return join(dir, DATA_FILE);
}

export function hasEncryptedData(dir: string): boolean {
  return existsSync(dataFilePath(dir));
}

export function hasLegacyData(dir: string): boolean {
  return existsSync(join(dir, LEGACY_FILE));
}

/** Writes a file atomically. */
export function writeAtomic(path: string, data: Buffer): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Checks that a sealed file reads back identically; throws otherwise. */
function verifySealed(path: string, key: Buffer, expected: Buffer): void {
  const back = unseal(readFileSync(path), key).payload;
  if (!back.equals(expected)) {
    throw new Error("Vérification du fichier chiffré échouée : l'ancienne base est conservée.");
  }
}

/**
 * Opens (or creates) the encrypted database of folder `dir` with the key `key`.
 * Throws a `VaultError` if the file exists but does not open with that key.
 */
export function openDataStore(dir: string, key: Buffer): DataStore {
  const path = dataFilePath(dir);
  let dump: Buffer | null = null;
  let migratedLegacy = false;

  if (existsSync(path)) {
    dump = unseal(readFileSync(path), key).payload;
  } else if (hasLegacyData(dir)) {
    dump = dumpSqliteFile(join(dir, LEGACY_FILE));
    writeAtomic(path, seal(dump, key, "database"));
    verifySealed(path, key, dump);
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = join(dir, LEGACY_FILE + suffix);
      if (existsSync(p)) rmSync(p);
    }
    migratedLegacy = true;
  }

  const db = openDatabaseFromDump(dump);
  const sqlite = getRawSqlite();

  let frozen = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const totalChanges = (): number =>
    (sqlite.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  let flushedAt = totalChanges();

  function flushNow(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (frozen) return;
    const changes = totalChanges();
    writeAtomic(path, seal(dumpDatabase(sqlite), key, "database"));
    flushedAt = changes;
  }

  return {
    db,
    sqlite,
    migratedLegacy,
    touch() {
      if (frozen || timer) return;
      if (totalChanges() === flushedAt && existsSync(path)) return;
      timer = setTimeout(() => {
        try {
          flushNow();
        } catch (err) {
          console.error("[qompta] écriture de la base chiffrée impossible :", err);
        }
      }, FLUSH_DELAY_MS);
    },
    flushNow,
    image: () => dumpDatabase(sqlite),
    freeze() {
      if (timer) clearTimeout(timer);
      timer = null;
      frozen = true;
    },
  };
}
