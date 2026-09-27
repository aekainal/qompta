/**
 * Undo journal (action bar « Annuler » after a change).
 * Every operation must undo itself exactly, cascades included.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";
import { createSettingsRepo } from "../src/db/repositories/settings.repo.js";
import { installUndoJournal, type UndoJournal } from "../src/main/undo.js";
import { createTestDbWithSqlite } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
let sqlite: Database.Database;
let undo: UndoJournal;

beforeEach(() => {
  ({ db, sqlite } = createTestDbWithSqlite());
  undo = installUndoJournal(sqlite);
});

/** Runs `fn` and returns the means to undo it, like the action bar does. */
function tracked(fn: () => void): () => number {
  const from = undo.checkpoint();
  fn();
  const to = undo.checkpoint();
  return () => undo.revert(from, to);
}

function snapshot(table: string): unknown[] {
  return sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
}

describe("journal d'annulation", () => {
  it("défait une modification, champ par champ", () => {
    const companies = createCompaniesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const client = tp.create(c.id, { kind: "client", name: "Client X", email: "x@exemple.ch" });
    const before = snapshot("third_parties");

    const revert = tracked(() => tp.update(c.id, client.id, { name: "Client renommé", email: null }));
    expect(tp.list(c.id)[0].name).toBe("Client renommé");

    expect(revert()).toBeGreaterThan(0);
    expect(snapshot("third_parties")).toEqual(before);
  });

  it("rétablit une suppression avec ses cascades (facture + paiements)", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const inv = invoices.create(c.id, {
      type: "sale", issueDate: "2026-02-01", treatment: "standard", rate: "normal",
      enteredAs: "ht", enteredAmount: 100000, status: "issued",
    });
    invoices.addPayment(c.id, inv.id, "2026-02-10", 50000);
    const before = { inv: snapshot("invoices"), pay: snapshot("invoice_payments") };

    const revert = tracked(() => invoices.delete(c.id, inv.id));
    expect(invoices.list(c.id).total).toBe(0);
    expect(snapshot("invoice_payments")).toHaveLength(0);

    revert();
    expect(snapshot("invoices")).toEqual(before.inv);
    expect(snapshot("invoice_payments")).toEqual(before.pay);
    expect(invoices.get(c.id, inv.id)!.status).toBe("partial");
  });

  it("défait une création", () => {
    const companies = createCompaniesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const revert = tracked(() => tp.create(c.id, { kind: "supplier", name: "Fournisseur" }));
    expect(tp.list(c.id)).toHaveLength(1);
    revert();
    expect(tp.list(c.id)).toHaveLength(0);
  });

  it("ne défait QUE l'opération visée, pas celles d'avant", () => {
    const companies = createCompaniesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const a = tp.create(c.id, { kind: "client", name: "A" });
    tp.update(c.id, a.id, { name: "A1" });
    const revert = tracked(() => tp.update(c.id, a.id, { name: "A2" }));
    revert();
    expect(tp.list(c.id)[0].name).toBe("A1");
  });

  it("une annulation n'est pas elle-même annulable et ne se rejoue pas deux fois", () => {
    const companies = createCompaniesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const c = companies.create({ name: "Qwasar", legalForm: "sarl" });
    const a = tp.create(c.id, { kind: "client", name: "A" });
    const from = undo.checkpoint();
    tp.update(c.id, a.id, { name: "B" });
    const to = undo.checkpoint();
    undo.revert(from, to);
    expect(undo.checkpoint()).toBe(from);
    expect(undo.revert(from, to)).toBe(0);
    expect(tp.list(c.id)[0].name).toBe("A");
  });

  it("ne journalise pas les réglages applicatifs", () => {
    const settings = createSettingsRepo(db);
    const from = undo.checkpoint();
    settings.set("active_company_id", "x");
    expect(undo.checkpoint()).toBe(from);
  });

  it("refuse d'annuler une opération sortie du journal", () => {
    const companies = createCompaniesRepo(db);
    const from = undo.checkpoint();
    companies.create({ name: "Ancienne", legalForm: "sarl" });
    const to = undo.checkpoint();
    sqlite.prepare("DELETE FROM temp.undolog").run();
    expect(undo.revert(from, to)).toBe(-1);
  });
});
