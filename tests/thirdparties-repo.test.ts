/**
 * Permanent deletion of a third party: allowed only when it has no history.
 *
 * A third party referenced by an invoice, a quote or a contract carries an
 * accounting trace; deleting it would hit a foreign key or orphan documents.
 * The repository then refuses and points to archiving. These tests fix that
 * boundary, and the per-company isolation of `usage`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createQuotesRepo } from "../src/db/repositories/quotes.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => {
  db = createTestDb();
});

function setup() {
  const companies = createCompaniesRepo(db);
  const invoices = createInvoicesRepo(db);
  const quotes = createQuotesRepo(db, invoices);
  const thirdParties = createThirdPartiesRepo(db);
  const company = companies.create({ name: "Qwasar", legalForm: "sarl" });
  return { companies, invoices, quotes, thirdParties, company };
}

describe("tiers : suppression définitive", () => {
  it("supprime un tiers sans document lié", () => {
    const { thirdParties, company } = setup();
    const tp = thirdParties.create(company.id, { kind: "client", name: "Sans histoire" });

    expect(thirdParties.usage(company.id, tp.id)).toEqual({ invoices: 0, quotes: 0, contracts: 0 });
    expect(thirdParties.delete(company.id, tp.id)).toEqual({ ok: true });
    expect(thirdParties.list(company.id, true).find((t) => t.id === tp.id)).toBeUndefined();
  });

  it("refuse la suppression d'un tiers lié à une facture et le laisse intact", () => {
    const { thirdParties, invoices, company } = setup();
    const tp = thirdParties.create(company.id, { kind: "client", name: "Facturé" });
    invoices.create(company.id, {
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 100000,
      thirdPartyId: tp.id,
    });

    expect(thirdParties.usage(company.id, tp.id).invoices).toBe(1);
    expect(() => thirdParties.delete(company.id, tp.id)).toThrow(/archiv/i);
    // The record survives the refusal.
    expect(thirdParties.list(company.id, true).find((t) => t.id === tp.id)).toBeDefined();
  });

  it("ne compte que les documents de la société du tiers", () => {
    const { companies, thirdParties, invoices } = setup();
    const a = companies.create({ name: "A", legalForm: "sarl" });
    const b = companies.create({ name: "B", legalForm: "sarl" });
    const clientA = thirdParties.create(a.id, { kind: "client", name: "Client A" });
    // An invoice at B must not weigh on A's usage count.
    invoices.create(b.id, {
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 5000,
    });

    expect(thirdParties.usage(a.id, clientA.id)).toEqual({ invoices: 0, quotes: 0, contracts: 0 });
    expect(thirdParties.delete(a.id, clientA.id)).toEqual({ ok: true });
  });
});
