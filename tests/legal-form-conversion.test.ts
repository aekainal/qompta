/**
 * Legal form conversion: converting to a form with capital (Sàrl/SA) completes
 * the chart of accounts with the missing capital accounts, without duplicates.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createAccountsRepo } from "../src/db/repositories/accounts.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createTaxRepo } from "../src/db/repositories/tax.repo.js";
import { createCompanyEquityRepo } from "../src/db/repositories/companyEquity.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => {
  db = createTestDb();
});

describe("conversion de forme → plan comptable", () => {
  it("RI → Sàrl ajoute les comptes de capital manquants, sans doublon, idempotent", () => {
    const companies = createCompaniesRepo(db);
    const accounts = createAccountsRepo(db);
    const c = companies.create({ name: "C", legalForm: "raison_individuelle" });

    expect(accounts.list(c.id).some((a) => a.code === "2800")).toBe(false);

    companies.convertLegalForm(c.id, "sarl", "2026-01-01");
    const after = accounts.list(c.id);
    expect(after.some((a) => a.code === "2800")).toBe(true); // Share capital
    expect(after.some((a) => a.code === "2900")).toBe(true); // Legal reserve
    const codes = after.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length); // no duplicate

    // A second pass adds nothing.
    expect(accounts.ensureDefaults(c.id, "sarl")).toBe(0);
  });

  it("RI → société simple ne crée aucun compte de capital", () => {
    const companies = createCompaniesRepo(db);
    const accounts = createAccountsRepo(db);
    const c = companies.create({ name: "C", legalForm: "raison_individuelle" });
    companies.convertLegalForm(c.id, "societe_simple", "2026-01-01");
    expect(accounts.list(c.id).some((a) => a.code === "2800")).toBe(false);
  });
});

describe("fonds propres Sàrl/SA → dossier fiscal", () => {
  it("les montants saisis alimentent l'impôt bénéfice + capital", () => {
    const companies = createCompaniesRepo(db);
    const equity = createCompanyEquityRepo(db);
    const tax = createTaxRepo(db);
    const c = companies.create({ name: "TEST_sarl", legalForm: "sarl" });
    equity.set(c.id, { shareCapital: 2000000, reserves: 500000, retainedEarnings: 0, nonDeductibleCharges: 10000, managerSalary: 8000000, dividends: 150000 });

    const d = tax.dossier(c.id, 2026);
    expect(d.taxModule).toBe("corporate");
    expect(d.corporate!.shareCapital).toBe(2000000);
    expect(d.corporate!.equityCapital).toBe(2500000); // capital + reserves + carry-forward
    expect(d.corporate!.managerSalary).toBe(8000000);
    expect(d.corporate!.dividends).toBe(150000);
  });
});

describe("suppression dure d'une société", () => {
  it("remove supprime la société et cascade ses données", () => {
    const companies = createCompaniesRepo(db);
    const accounts = createAccountsRepo(db);
    const invoices = createInvoicesRepo(db);
    const c = companies.create({ name: "TEST_x", legalForm: "sarl" });
    invoices.create(c.id, { type: "sale", issueDate: "2026-01-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 1000 });
    expect(accounts.list(c.id).length).toBeGreaterThan(0);

    companies.remove(c.id);
    expect(companies.get(c.id)).toBeNull();
    expect(invoices.list(c.id).total).toBe(0);
    expect(accounts.list(c.id).length).toBe(0);
  });
});
