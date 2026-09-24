/**
 * Encrypted storage of the database: migration of the old plaintext database,
 * no readable data on disk, identical re-reading.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase } from "../src/db/client.js";
import { dumpDatabase, loadDatabase } from "../src/db/dump.js";
import { createTestDbWithSqlite } from "./helpers/test-db.js";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { DATA_FILE, LEGACY_FILE, openDataStore } from "../src/main/storage.js";
import { generateKey, isVault } from "../src/main/security/vault.js";

const dirs: string[] = [];
afterEach(() => {
  closeDatabase();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "qompta-storage-"));
  dirs.push(d);
  return d;
}

describe("stockage chiffré", () => {
  it("chiffre l'ancienne base en clair (mode WAL), vérifie, puis supprime le clair", () => {
    const dir = tempDir();
    const legacy = new Database(join(dir, LEGACY_FILE));
    legacy.pragma("journal_mode = WAL");
    legacy.exec("CREATE TABLE secrets (v TEXT); INSERT INTO secrets VALUES ('Client Confidentiel SA')");
    legacy.close();

    const key = generateKey();
    const store = openDataStore(dir, key);
    expect(store.migratedLegacy).toBe(true);
    expect(existsSync(join(dir, LEGACY_FILE))).toBe(false);
    expect(existsSync(join(dir, `${LEGACY_FILE}-wal`))).toBe(false);

    const onDisk = readFileSync(join(dir, DATA_FILE));
    expect(isVault(onDisk)).toBe(true);
    expect(onDisk.includes(Buffer.from("Confidentiel"))).toBe(false);
    expect(store.sqlite.prepare("SELECT v FROM secrets").get()).toEqual({ v: "Client Confidentiel SA" });
  });

  it("relit après fermeture ce qui a été écrit, et refuse une autre clé", () => {
    const dir = tempDir();
    const key = generateKey();
    const store = openDataStore(dir, key);
    store.sqlite.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('écrit')");
    store.flushNow();
    closeDatabase();

    const again = openDataStore(dir, key);
    expect(again.migratedLegacy).toBe(false);
    expect(again.sqlite.prepare("SELECT v FROM t").get()).toEqual({ v: "écrit" });
    closeDatabase();

    expect(() => openDataStore(dir, generateKey())).toThrow(/autre clé/);
  });

  it("une base gelée (restauration en cours) n'écrase plus le fichier", () => {
    const dir = tempDir();
    const key = generateKey();
    const store = openDataStore(dir, key);
    store.flushNow();
    const before = readFileSync(join(dir, DATA_FILE));
    store.freeze();
    store.sqlite.exec("CREATE TABLE apres (v TEXT)");
    store.flushNow();
    expect(readFileSync(join(dir, DATA_FILE)).equals(before)).toBe(true);
  });
});

describe("copie logique de la base (sans serialize, qui plante Electron)", () => {
  it("reconstruit une base identique : schéma, lignes, blobs, séquences, migrations", () => {
    const { db, sqlite } = createTestDbWithSqlite();
    const c = createCompaniesRepo(db).create({ name: "Qwasar", legalForm: "sarl" });
    createInvoicesRepo(db).create(c.id, {
      type: "sale", issueDate: "2026-09-21", treatment: "standard", rate: "normal",
      enteredAs: "ht", enteredAmount: 123456, status: "issued",
    });
    sqlite.exec("CREATE TABLE blobs (b BLOB); INSERT INTO blobs VALUES (x'DEADBEEF00')");

    const copy = loadDatabase(dumpDatabase(sqlite));
    const tables = (d: Database.Database) =>
      (d.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string; sql: string }[]);
    expect(tables(copy)).toEqual(tables(sqlite));
    for (const { name } of tables(sqlite).filter((t) => t.sql.startsWith("CREATE TABLE"))) {
      expect(copy.prepare(`SELECT * FROM "${name}"`).all(), name).toEqual(sqlite.prepare(`SELECT * FROM "${name}"`).all());
    }
    expect((copy.prepare("SELECT b FROM blobs").get() as { b: Buffer }).b.equals(Buffer.from("DEADBEEF00", "hex"))).toBe(true);
    // The copy is a database like any other: foreign keys active, writing possible.
    copy.pragma("foreign_keys = ON");
    expect(() => copy.prepare("INSERT INTO invoices (id, company_id) VALUES ('x', 'inexistante')").run()).toThrow();
  });
});
