/**
 * Generic undo journal: what lets the action bar offer « Annuler » after a
 * change, whatever entity was touched.
 *
 * Classic SQLite technique ("Automatic Undo/Redo Using SQLite Triggers"):
 * TEMPORARY triggers, set on every business table, write for each inserted,
 * updated or deleted row the SQL statement that puts it back as it was.
 * Undoing an operation = replaying those statements backwards, in a transaction.
 * Foreign key cascades go through the triggers too: deleting an invoice and its
 * payments is restored in one block.
 *
 * Everything lives in the `temp` schema: nothing is written to the encrypted
 * database nor to the backups, and the journal disappears on shutdown. It is
 * bounded in time (`RETENTION_S`): the action bar only offers the undo for a few
 * seconds, no point keeping more.
 */

import type BetterSqlite from "better-sqlite3";

/** Tables never journalled: technical ones, or settings unrelated to any entry. */
const SKIPPED = new Set(["__drizzle_migrations", "app_settings", "audit_log", "_schema_meta"]);

const RETENTION_S = 15 * 60;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** SQL literal for a string, to nest it inside a trigger body. */
const lit = (text: string) => `'${text.replace(/'/g, "''")}'`;

export interface UndoJournal {
  /** Current position of the journal: read before and after an operation. */
  checkpoint(): number;
  /**
   * Undoes everything journalled between two positions. Returns the number of
   * statements replayed, or -1 when the operation is too old.
   */
  revert(from: number, to: number): number;
}

export function installUndoJournal(sqlite: BetterSqlite.Database): UndoJournal {
  sqlite.exec(`
    CREATE TEMP TABLE IF NOT EXISTS undolog (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL DEFAULT (unixepoch()),
      sql TEXT NOT NULL
    );
  `);

  const tables = (
    sqlite
      .prepare(
        "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[]
  )
    .map((t) => t.name)
    .filter((t) => !SKIPPED.has(t));

  for (const table of tables) {
    const cols = (sqlite.prepare(`PRAGMA main.table_info(${q(table)})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (cols.length === 0) continue;

    // Every value is quoted by quote() when the trigger fires: strings, numbers,
    // NULL and blobs come back out as valid SQL literals.
    const values = (row: "old") =>
      cols.map((c) => `quote(${row}.${q(c)})`).join(` || ',' || `);
    const insertBack =
      `${lit(`INSERT INTO main.${q(table)} (rowid, ${cols.map(q).join(", ")}) VALUES (`)}` +
      ` || old.rowid || ',' || ${values("old")} || ')'`;
    const updateBack =
      `${lit(`UPDATE main.${q(table)} SET `)} || ` +
      cols.map((c) => `${lit(`${q(c)} = `)} || quote(old.${q(c)})`).join(` || ', ' || `) +
      ` || ${lit(" WHERE rowid = ")} || old.rowid`;
    const deleteBack = `${lit(`DELETE FROM main.${q(table)} WHERE rowid = `)} || new.rowid`;

    const base = `undo_${table}`;
    sqlite.exec(`
      DROP TRIGGER IF EXISTS temp.${q(base + "_i")};
      DROP TRIGGER IF EXISTS temp.${q(base + "_u")};
      DROP TRIGGER IF EXISTS temp.${q(base + "_d")};
      CREATE TEMP TRIGGER ${q(base + "_i")} AFTER INSERT ON main.${q(table)}
        BEGIN INSERT INTO undolog (sql) VALUES (${deleteBack}); END;
      CREATE TEMP TRIGGER ${q(base + "_u")} AFTER UPDATE ON main.${q(table)}
        BEGIN INSERT INTO undolog (sql) VALUES (${updateBack}); END;
      CREATE TEMP TRIGGER ${q(base + "_d")} BEFORE DELETE ON main.${q(table)}
        BEGIN INSERT INTO undolog (sql) VALUES (${insertBack}); END;
    `);
  }

  const maxSeq = () =>
    (sqlite.prepare("SELECT coalesce(max(seq), 0) AS n FROM undolog").get() as { n: number }).n;
  const oldestSeq = () =>
    (sqlite.prepare("SELECT coalesce(min(seq), 0) AS n FROM undolog").get() as { n: number }).n;

  return {
    checkpoint() {
      sqlite.prepare("DELETE FROM undolog WHERE at < unixepoch() - ?").run(RETENTION_S);
      return maxSeq();
    },

    revert(from, to) {
      if (to <= from) return 0;
      // The operation has left the journal (too old): nothing is undone halfway.
      const oldest = oldestSeq();
      if (oldest === 0 || oldest > from + 1) return -1;

      const rows = sqlite
        .prepare("SELECT sql FROM undolog WHERE seq > ? AND seq <= ? ORDER BY seq DESC")
        .all(from, to) as { sql: string }[];
      const before = maxSeq();
      sqlite.transaction(() => {
        // The replay order may recreate a child before its parent: foreign key
        // checks wait until the end of the transaction.
        sqlite.pragma("defer_foreign_keys = ON");
        for (const r of rows) sqlite.exec(r.sql);
      })();
      // Neither the undone operation nor its own replay may stay undoable.
      sqlite
        .prepare("DELETE FROM undolog WHERE (seq > ? AND seq <= ?) OR seq > ?")
        .run(from, to, before);
      return rows.length;
    },
  };
}
