/**
 * Guard rail on migrations: an application update must NEVER destroy a user's
 * data.
 *
 * The database lives in `userData` and survives reinstalls: migrations
 * therefore apply to real data. This test fails if a migration introduces a
 * destructive statement, and checks on a populated database that every row
 * survives.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema.js";
import { sourceMigrationsFolder } from "../src/db/migrate.js";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";

const MIGRATIONS = sourceMigrationsFolder();

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }));
}

/**
 * Statements that destroy data.
 * `ON DELETE cascade` in a FOREIGN KEY clause is not one of them: it is an
 * integrity rule, not a deletion at migration time.
 */
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\s+\S+\s+RENAME\b/i,
];

/**
 * Intentional deletions, reviewed by hand. Only entry: the removal of QomptAI
 * (v1.20.0) — its conversation history is not accounting data, and the user
 * asked that nothing of the assistant remain after the update.
 */
const ALLOWED_DROPS: Record<string, string[]> = {
  "0016_remove_qomptai.sql": ["DROP TABLE `ai_messages`", "DROP TABLE `ai_conversations`"],
};

describe("migrations — aucune perte de données à la mise à jour", () => {
  it("ne contient aucune instruction destructive", () => {
    for (const { name, sql: raw } of migrationFiles()) {
      const sql = (ALLOWED_DROPS[name] ?? []).reduce((acc, stmt) => acc.replace(stmt, ""), raw);
      for (const pattern of DESTRUCTIVE) {
        expect(sql, `${name} contient une instruction destructive (${pattern})`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("recrée les tables uniquement pour les ajouter, jamais pour les remplacer", () => {
    // Drizzle works around SQLite's ALTER limits by copying a table into a
    // `__new_*` table: that scheme can lose data and must be reviewed by hand
    // before being allowed.
    for (const { name, sql } of migrationFiles()) {
      expect(sql, `${name} recrée une table via __new_ : à relire manuellement`).not.toMatch(
        /__new_/,
      );
    }
  });

  it("conserve toutes les lignes d'une base peuplée quand on rejoue les migrations", () => {
    // Database at the current schema, filled like a user database.
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS });

    const companies = createCompaniesRepo(db);
    const thirdParties = createThirdPartiesRepo(db);
    const invoices = createInvoicesRepo(db);

    const company = companies.create({ name: "Société test", legalForm: "sarl" });
    const client = thirdParties.create(company.id, { kind: "client", name: "Client test" });
    for (let i = 0; i < 5; i++) {
      invoices.create(company.id, {
        type: "sale",
        issueDate: "2026-07-22",
        thirdPartyId: client.id,
        treatment: "standard",
        rate: "normal",
        enteredAs: "ht",
        enteredAmount: 10000 + i,
        status: "issued",
      });
    }

    const count = (t: string) =>
      (sqlite.prepare(`SELECT count(*) AS n FROM "${t}"`).get() as { n: number }).n;
    const before = {
      companies: count("companies"),
      thirdParties: count("third_parties"),
      invoices: count("invoices"),
      accountCategories: count("account_categories"),
    };

    // Replaying the migrations on an already up-to-date database must be a no-op.
    migrate(db, { migrationsFolder: MIGRATIONS });

    expect({
      companies: count("companies"),
      thirdParties: count("third_parties"),
      invoices: count("invoices"),
      accountCategories: count("account_categories"),
    }).toEqual(before);

    sqlite.close();
  });
});
