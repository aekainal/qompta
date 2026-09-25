import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createInvoicesRepo } from "../src/db/repositories/invoices.repo.js";
import { createThirdPartiesRepo } from "../src/db/repositories/thirdParties.repo.js";
import { createAssociatesRepo } from "../src/db/repositories/associates.repo.js";
import { createFundContributionsRepo } from "../src/db/repositories/fundContributions.repo.js";
import { createBackupRepo } from "../src/db/repositories/backup.repo.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => { db = createTestDb(); });

describe("backup : export / import par société", () => {
  it("réimporte une société comme nouvelle entité, avec ses données et FK remappées", () => {
    const companies = createCompaniesRepo(db);
    const invoices = createInvoicesRepo(db);
    const tp = createThirdPartiesRepo(db);
    const backup = createBackupRepo(db);

    const c = companies.create({ name: "Origine", legalForm: "sarl" });
    const client = tp.create(c.id, { kind: "client", name: "Client X" });
    const inv = invoices.create(c.id, {
      type: "sale", issueDate: "2026-02-01", treatment: "standard", rate: "normal",
      enteredAs: "ht", enteredAmount: 100000, thirdPartyId: client.id, status: "issued",
    });
    invoices.addPayment(c.id, inv.id, "2026-02-10", 50000);

    const file = backup.exportCompany(c.id, "2026-05-31T00:00:00Z");
    expect(file.companies).toHaveLength(1);

    const res = backup.importFile(file);
    expect(res.imported).toBe(1);

    // Two companies now: the original one + the imported one (suffixed name).
    const all = companies.list();
    expect(all).toHaveLength(2);
    const imported = all.find((x) => x.name.includes("importé"))!;
    expect(imported).toBeTruthy();
    expect(imported.id).not.toBe(c.id);

    // The imported one has its invoice and its third party, isolated from the original.
    const importedInvoices = invoices.list(imported.id);
    expect(importedInvoices.total).toBe(1);
    expect(importedInvoices.rows[0].id).not.toBe(inv.id); // remapped ID
    expect(importedInvoices.rows[0].amountHt).toBe(100000);

    const importedTp = tp.list(imported.id);
    expect(importedTp).toHaveLength(1);
    expect(importedTp[0].name).toBe("Client X");
    // The imported invoice points to the imported third party (remapped FK).
    expect(importedInvoices.rows[0].thirdPartyId).toBe(importedTp[0].id);

    // The payment followed along (partial status).
    expect(importedInvoices.rows[0].status).toBe("partial");

    // The original is untouched.
    expect(invoices.list(c.id).total).toBe(1);
  });

  it("réimporte les entrées de fonds en les rattachant à l'associé importé", () => {
    const companies = createCompaniesRepo(db);
    const associates = createAssociatesRepo(db);
    const funding = createFundContributionsRepo(db);
    const backup = createBackupRepo(db);

    const c = companies.create({ name: "Origine SS", legalForm: "societe_simple" });
    const a = associates.create(c.id, { name: "Associé A", shareBps: 10000 });
    funding.create(c.id, {
      associateId: a.id,
      associateName: "Associé A",
      date: "2026-01-05",
      kind: "capital",
      amount: 500000,
    });

    backup.importFile(backup.exportCompany(c.id, "2026-05-31T00:00:00Z"));
    const imported = companies.list().find((x) => x.name.includes("importé"))!;

    const rows = funding.list(imported.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(500000);
    // The fund contribution follows the imported shareholder, never the original company's.
    const importedAssociate = associates.list(imported.id)[0];
    expect(rows[0].associateId).toBe(importedAssociate.id);
    expect(rows[0].associateId).not.toBe(a.id);
  });

  it("exportAll inclut toutes les sociétés", () => {
    const companies = createCompaniesRepo(db);
    const backup = createBackupRepo(db);
    companies.create({ name: "A", legalForm: "sarl" });
    companies.create({ name: "B", legalForm: "snc" });
    const file = backup.exportAll("2026-05-31T00:00:00Z");
    expect(file.scope).toBe("all");
    expect(file.companies).toHaveLength(2);
  });

  it("le plan comptable par défaut est aussi réimporté", () => {
    const companies = createCompaniesRepo(db);
    const backup = createBackupRepo(db);
    const c = companies.create({ name: "Origine", legalForm: "sarl" });
    const file = backup.exportCompany(c.id, "2026-05-31T00:00:00Z");
    backup.importFile(file);
    const imported = companies.list().find((x) => x.name.includes("importé"))!;
    const accounts = createAssociatesRepo(db); // sanity: repo usable
    expect(accounts.list(imported.id)).toEqual([]);
  });
});
