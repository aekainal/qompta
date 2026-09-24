/**
 * Test of strict data isolation between companies.
 * No data of one company must leak into another.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { invoices } from "../src/db/schema.js";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;

beforeEach(() => {
  db = createTestDb();
});

function addInvoice(companyId: string, amountChf: number) {
  db.insert(invoices)
    .values({
      id: randomUUID(),
      companyId,
      type: "sale",
      issueDate: "2026-02-01",
      treatment: "standard",
      enteredAs: "ht",
      amountHt: amountChf,
      vatRateBps: 810,
      vatAmount: Math.round((amountChf * 810) / 10000),
      amountTtc: amountChf + Math.round((amountChf * 810) / 10000),
      amountChf,
      status: "issued",
    })
    .run();
}

describe("isolation inter-sociétés", () => {
  it("les factures d'une société ne sont visibles que sous son company_id", () => {
    const repo = createCompaniesRepo(db);
    const a = repo.create({ name: "Alpha SA", legalForm: "sarl" });
    const b = repo.create({ name: "Beta RI", legalForm: "raison_individuelle" });

    addInvoice(a.id, 100000);
    addInvoice(a.id, 50000);
    addInvoice(b.id, 9999);

    const aInvoices = db.select().from(invoices).where(eq(invoices.companyId, a.id)).all();
    const bInvoices = db.select().from(invoices).where(eq(invoices.companyId, b.id)).all();

    expect(aInvoices).toHaveLength(2);
    expect(bInvoices).toHaveLength(1);
    expect(aInvoices.every((i) => i.companyId === a.id)).toBe(true);
    expect(bInvoices.every((i) => i.companyId === b.id)).toBe(true);
    // No invoice of B within A's set
    expect(aInvoices.some((i) => i.companyId === b.id)).toBe(false);
  });

  it("la liste des sociétés exclut les archivées par défaut", () => {
    const repo = createCompaniesRepo(db);
    const a = repo.create({ name: "Alpha", legalForm: "sarl" });
    repo.create({ name: "Beta", legalForm: "snc" });
    repo.archive(a.id);

    expect(repo.list()).toHaveLength(1);
    expect(repo.list(true)).toHaveLength(2);
  });

  it("chaque société reçoit ses réglages TVA par défaut", () => {
    const repo = createCompaniesRepo(db);
    const a = repo.create({ name: "Alpha", legalForm: "sarl" });
    const s = repo.getVatSettings(a.id);
    expect(s).not.toBeNull();
    expect(s!.periodType).toBe("quarterly");
    expect(s!.method).toBe("effective");
    expect(s!.accountingBasis).toBe("agreed");
  });
});

describe("conversion de forme juridique", () => {
  it("conserve l'historique et résout la forme applicable à une date", () => {
    const repo = createCompaniesRepo(db);
    const c = repo.create({ name: "Evolutive", legalForm: "societe_simple" });

    repo.convertLegalForm(c.id, "snc", "2026-01-01", "Passage en SNC");
    repo.convertLegalForm(c.id, "sarl", "2027-01-01", "Passage en Sàrl");

    const history = repo.legalFormHistory(c.id);
    expect(history).toHaveLength(3); // creation + 2 conversions

    // Before the 1st conversion: simple partnership
    expect(repo.legalFormAt(c.id, "2025-06-01")).toBe("societe_simple");
    // In between: SNC
    expect(repo.legalFormAt(c.id, "2026-06-01")).toBe("snc");
    // After: Sàrl
    expect(repo.legalFormAt(c.id, "2027-06-01")).toBe("sarl");

    // The company's current legal form is the last one
    expect(repo.get(c.id)!.legalForm).toBe("sarl");
  });
});
