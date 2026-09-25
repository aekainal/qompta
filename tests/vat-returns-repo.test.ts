import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createVatReturnsRepo } from "../src/db/repositories/vatReturns.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => { db = createTestDb(); });

function setup() {
  const companies = createCompaniesRepo(db);
  const invoices = createInvoicesRepo(db);
  const vat = createVatReturnsRepo(db);
  const c = companies.create({ name: "C", legalForm: "sarl" });
  return { companies, invoices, vat, c };
}

describe("vatReturns : calcul à la volée", () => {
  it("agrège les factures de la période sélectionnée", () => {
    const { invoices, vat, c } = setup();
    invoices.create(c.id, { type: "sale", issueDate: "2026-02-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 100000, status: "issued" });
    invoices.create(c.id, { type: "purchase", issueDate: "2026-02-10", treatment: "input_material", rate: "normal", enteredAs: "ht", enteredAmount: 20000, status: "issued" });
    // outside the period
    invoices.create(c.id, { type: "sale", issueDate: "2026-07-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 999999, status: "issued" });

    const { result } = vat.computeLive(c.id, "quarterly", 2026, 1);
    expect(result.b200).toBe(100000);
    expect(result.b303).toBe(100000);
    expect(result.b399).toBe(8100);
    expect(result.b479).toBe(1620);
    expect(result.b500).toBe(8100 - 1620);
  });
});

describe("vatReturns : impôt préalable basé sur la TVA réelle", () => {
  it("utilise la TVA saisie (override) et non le recalcul au taux", () => {
    const { invoices, vat, c } = setup();
    // Purchase 9.66 net, actual VAT 0.74 (instead of 0.78 at 8.10 %).
    invoices.create(c.id, {
      type: "purchase", issueDate: "2026-02-01", treatment: "input_material",
      rate: "normal", enteredAs: "ht", enteredAmount: 966, vatAmountOverride: 74, status: "paid",
    });
    const { result } = vat.computeLive(c.id, "quarterly", 2026, 1);
    // 400 (input tax) must reflect 0.74, not 0.78.
    expect(result.t400).toBe(74);
    expect(result.b479).toBe(74);
  });
});

describe("vatReturns : clôture et historique", () => {
  it("fige les lignes, calcule les totaux, apparaît dans l'historique", () => {
    const { invoices, vat, c } = setup();
    invoices.create(c.id, { type: "sale", issueDate: "2026-02-01", treatment: "standard", rate: "normal", enteredAs: "ht", enteredAmount: 100000, status: "issued" });

    const rec = vat.lock(c.id, "quarterly", 2026, 1);
    expect(rec.locked).toBe(true);
    expect(rec.status).toBe("closed");
    expect(rec.totalPayable).toBe(8100);

    const list = vat.list(c.id);
    expect(list).toHaveLength(1);

    // findRecord finds the closed VAT return
    const found = vat.findRecord(c.id, "quarterly", 2026, 1);
    expect(found?.id).toBe(rec.id);
  });

  it("réouverture remet le décompte en cours", () => {
    const { vat, c } = setup();
    const rec = vat.lock(c.id, "quarterly", 2026, 1);
    const reopened = vat.reopen(c.id, rec.id);
    expect(reopened.locked).toBe(false);
    expect(reopened.status).toBe("in_progress");
  });

  it("transitions de statut déposée/payée", () => {
    const { vat, c } = setup();
    const rec = vat.lock(c.id, "quarterly", 2026, 1);
    expect(vat.setStatus(c.id, rec.id, "filed").status).toBe("filed");
    expect(vat.setStatus(c.id, rec.id, "paid").status).toBe("paid");
  });
});
