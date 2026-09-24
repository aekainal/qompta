/**
 * Creates an in-memory SQLite database with the schema applied, for integration tests.
 * Each call returns an independent database (isolation between tests).
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../src/db/schema.js";
import { sourceMigrationsFolder } from "../../src/db/migrate.js";
import type { DB } from "../../src/db/client.js";

export function createTestDb(): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: sourceMigrationsFolder() });
  return db;
}

/** Variant that also exposes the better-sqlite3 connection (undo log, raw SQL). */
export function createTestDbWithSqlite(): { db: DB; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: sourceMigrationsFolder() });
  return { db, sqlite };
}
