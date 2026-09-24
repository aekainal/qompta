/**
 * Opening of the SQLite database (better-sqlite3) + Drizzle binding.
 * Used only in the MAIN process.
 *
 * Since v1.20.0, the application database is no longer a plaintext SQLite
 * file: it lives **in memory**, rebuilt from the encrypted `.qdb` file
 * (see `src/main/storage.ts`). No accounting data in clear ever touches the disk.
 */

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { loadDatabase } from "./dump.js";

export type DB = BetterSQLite3Database<typeof schema>;

let _db: DB | null = null;
let _sqlite: Database.Database | null = null;

/**
 * Opens the in-memory database from a logical copy (`dump.ts`), or empty if
 * `dump` is null (first installation).
 */
export function openDatabaseFromDump(dump: Buffer | null): DB {
  if (_db) return _db;
  _sqlite = dump ? loadDatabase(dump) : new Database(":memory:");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getDb(): DB {
  if (!_db) throw new Error("La base n'est pas ouverte. Appelez openDatabaseFromDump() d'abord.");
  return _db;
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) throw new Error("La base n'est pas ouverte.");
  return _sqlite;
}

export function closeDatabase(): void {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}

export { schema };
