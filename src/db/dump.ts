/**
 * Full copy of a SQLite database in logical form (schema + rows), and
 * rebuilding in memory.
 *
 * Why not `db.serialize()` / `new Database(buffer)`: in Electron 34, V8's
 * memory «sandbox» forbids buffers allocated outside its space, and
 * better-sqlite3's `serialize()` creates one → **immediate crash of the main
 * process** («ArrayBuffer backing stores must be allocated inside the sandbox»).
 * Invisible in the tests, which run under Node. Hard-won lesson from setting up
 * encryption (v1.20.0). Ordinary queries are used instead, whose values are
 * copied into V8 memory like any other result.
 *
 * Electron-free module: tested (`tests/storage.test.ts`).
 */

import Database from "better-sqlite3";

const FORMAT = "qompta-db";
const VERSION = 1;

type Cell = string | number | null | { $b: string };

interface Dump {
  format: typeof FORMAT;
  version: number;
  /** CREATE statements, in creation order (tables, then indexes, views, triggers). */
  schema: string[];
  tables: Record<string, { columns: string[]; rows: Cell[][] }>;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

function encode(v: unknown): Cell {
  if (v === null || typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (Buffer.isBuffer(v)) return { $b: v.toString("base64") };
  return String(v);
}

function decode(v: Cell): unknown {
  return v !== null && typeof v === "object" ? Buffer.from(v.$b, "base64") : v;
}

/** Full content of the database, as JSON (UTF-8). */
export function dumpDatabase(sqlite: Database.Database): Buffer {
  const objects = sqlite
    .prepare(
      "SELECT type, name, sql FROM main.sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' " +
        "ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid",
    )
    .all() as { type: string; name: string; sql: string }[];

  const dump: Dump = { format: FORMAT, version: VERSION, schema: objects.map((o) => o.sql), tables: {} };
  const tableNames = objects.filter((o) => o.type === "table").map((o) => o.name);
  const hasSequence = !!sqlite
    .prepare("SELECT 1 FROM main.sqlite_master WHERE name = 'sqlite_sequence'")
    .get();
  if (hasSequence) tableNames.push("sqlite_sequence");

  for (const name of tableNames) {
    const stmt = sqlite.prepare(`SELECT * FROM main.${q(name)}`).raw();
    const columns = stmt.columns().map((c) => c.name);
    const rows = (stmt.all() as unknown[][]).map((r) => r.map(encode));
    dump.tables[name] = { columns, rows };
  }
  return Buffer.from(JSON.stringify(dump), "utf8");
}

export function isDump(payload: Buffer): boolean {
  return payload.subarray(0, 40).toString("utf8").includes(`"format":"${FORMAT}"`);
}

/** Rebuilds the database in memory. Throws if the content is not a Qompta copy. */
export function loadDatabase(payload: Buffer): Database.Database {
  const dump = JSON.parse(payload.toString("utf8")) as Dump;
  if (dump.format !== FORMAT) throw new Error("Contenu de base Qompta illisible.");
  if (dump.version > VERSION) {
    throw new Error("Données écrites par une version plus récente de Qompta : mettez l'application à jour.");
  }
  const db = new Database(":memory:");
  // The table insertion order does not follow the foreign keys: the check is off
  // during loading, restored afterwards by the caller.
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    for (const sql of dump.schema) db.exec(sql);
    for (const [name, { columns, rows }] of Object.entries(dump.tables)) {
      if (rows.length === 0) continue;
      const insert = db.prepare(
        `INSERT INTO ${q(name)} (${columns.map(q).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      );
      for (const row of rows) insert.run(...row.map(decode));
    }
  })();
  return db;
}

/** Reads a plaintext SQLite file (older versions) without going through `serialize()`. */
export function dumpSqliteFile(path: string): Buffer {
  const file = new Database(path);
  try {
    // Changes still in the WAL are folded into the file before reading.
    file.pragma("wal_checkpoint(TRUNCATE)");
    return dumpDatabase(file);
  } finally {
    file.close();
  }
}
