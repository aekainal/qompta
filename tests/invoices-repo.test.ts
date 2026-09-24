/**
 * Integration tests of the M2 repositories (invoices, third parties, accounts) on an
 * in-memory DB, with a check of the isolation per company.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";
import { createAccountsRepo } from "../src/db/repositories/accounts.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => {
  db = createTestDb();
});

describe("plan comptable", () => {
  it("est installé par défaut à la création, adapté à la forme", () => {
    const companies = createCompaniesRepo(db);
    const accounts = createAccountsRepo(db);
    const ri = companies.create({ name: "RI", legalForm: "raison_individuelle" });
    const sarl = companies.create({ name: "Sàrl", legalForm: "sarl" });

    const riAcc = accounts.list(ri.id);
    const sarlAcc = accounts.list(sarl.id);
    expect(riAcc.length).toBeGreaterThan(0);
    // The Sàrl additionally has the capital/reserves accounts.
    expect(sarlAcc.some((a) => a.code === "2800")).toBe(true);
    expect(riAcc.some((a) => a.code === "2800")).toBe(false);
  });
});

describe("factures — création et calcul", () => {
  it("crée une vente avec montants et code TVA calculés", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });

    const inv = invoices.create(c.id, {
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 100000,
      status: "issued",
    });
    expect(inv.amountHt).toBe(100000);
    expect(inv.vatAmount).toBe(8100);
    expect(inv.amountTtc).toBe(108100);
    expect(inv.vatCode).toBe("303");
    expect(inv.vatCodeOverride).toBe(false);
  });

  it("respecte un code TVA forcé manuellement", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });
    const inv = invoices.create(c.id, {
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 100000,
      vatCodeOverride: "343",
    });
    expect(inv.vatCode).toBe("343");
    expect(inv.vatCodeOverride).toBe(true);
  });
});

describe("factures — paiements partiels et statut", () => {
  it("passe en partial puis paid selon le total payé", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });
    const inv = invoices.create(c.id, {
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ttc",
      enteredAmount: 108100,
      status: "issued",
    });

    let updated = invoices.addPayment(c.id, inv.id, "2026-02-10", 50000);
    expect(updated.status).toBe("partial");

    updated = invoices.addPayment(c.id, inv.id, "2026-02-20", 58100);
    expect(updated.status).toBe("paid");
    expect(invoices.paymentsTotal(c.id, inv.id)).toBe(108100);
  });
});

describe("factures — filtres et tri", () => {
  it("filtre par type et trie par montant", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });
    invoices.create(c.id, { type: "sale", issueDate: "2026-01-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 30000 });
    invoices.create(c.id, { type: "sale", issueDate: "2026-02-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 10000 });
    invoices.create(c.id, { type: "purchase", issueDate: "2026-02-01", treatment: "input_material", rate: "normal", enteredAs: "ht", enteredAmount: 5000 });

    const sales = invoices.list(c.id, { type: "sale", sortBy: "amountTtc", sortDir: "asc" });
    expect(sales.total).toBe(2);
    expect(sales.rows[0].amountHt).toBe(10000);
    expect(sales.rows[1].amountHt).toBe(30000);
  });

  it("filtre par plages de période cumulées (Q1 + Q3, non contigus)", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });
    const mk = (issueDate: string) =>
      invoices.create(c.id, { type: "sale", issueDate, treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 1000 });
    mk("2026-02-15"); // Q1
    mk("2026-05-10"); // Q2
    mk("2026-08-20"); // Q3
    mk("2026-11-30"); // Q4

    const res = invoices.list(c.id, {
      issueRanges: [
        { from: "2026-01-01", to: "2026-03-31" }, // Q1
        { from: "2026-07-01", to: "2026-09-30" }, // Q3
      ],
      sortBy: "issueDate",
      sortDir: "asc",
    });
    expect(res.total).toBe(2); // the SQL counter stays correct
    expect(res.rows.map((r) => r.issueDate)).toEqual(["2026-02-15", "2026-08-20"]);
  });
});

describe("isolation M2 — factures, tiers, comptes", () => {
  it("ne mélange jamais les données de deux sociétés", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const a = companies.create({ name: "A", legalForm: "sarl" });
    const b = companies.create({ name: "B", legalForm: "snc" });

    invoices.create(a.id, { type: "sale", issueDate: "2026-01-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 1000 });
    tp.create(a.id, { kind: "client", name: "Client A" });
    tp.create(b.id, { kind: "client", name: "Client B" });

    expect(invoices.list(a.id).total).toBe(1);
    expect(invoices.list(b.id).total).toBe(0);
    expect(tp.list(a.id).map((t) => t.name)).toEqual(["Client A"]);
    expect(tp.list(b.id).map((t) => t.name)).toEqual(["Client B"]);
  });
});
