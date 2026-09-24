/**
 * Backup / restore and structured export (JSON) per company.
 *
 * Principle: a "bundle" gathers all the data of one company. The import
 * recreates each company with NEW identifiers (full FK remapping), which avoids
 * any ID conflict and guarantees isolation — an existing company is never
 * overwritten. For a full "overwriting" restore, use the copy of the SQLite
 * file (handled on the main side).
 */

import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { DB } from "../client.js";
import * as schema from "../schema.js";
import type { BackupFile, CompanyBundle } from "../../shared/types.js";

const BACKUP_VERSION = 1;

export function createBackupRepo(db: DB) {
  function bundleFor(companyId: string): CompanyBundle {
    const inv = db.select().from(schema.invoices).where(eq(schema.invoices.companyId, companyId)).all();
    const returns = db.select().from(schema.vatReturns).where(eq(schema.vatReturns.companyId, companyId)).all();
    const returnIds = returns.map((r) => r.id);
    return {
      company: db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).get()!,
      vatSettings: db.select().from(schema.companyVatSettings).where(eq(schema.companyVatSettings.companyId, companyId)).get() ?? null,
      brandSettings: db.select().from(schema.companyBrandSettings).where(eq(schema.companyBrandSettings.companyId, companyId)).get() ?? null,
      legalFormHistory: db.select().from(schema.companyLegalFormHistory).where(eq(schema.companyLegalFormHistory.companyId, companyId)).all(),
      companyVatRates: db.select().from(schema.companyVatRates).where(eq(schema.companyVatRates.companyId, companyId)).all(),
      tdfnRates: db.select().from(schema.tdfnRates).where(eq(schema.tdfnRates.companyId, companyId)).all(),
      fiscalYears: db.select().from(schema.fiscalYears).where(eq(schema.fiscalYears.companyId, companyId)).all(),
      thirdParties: db.select().from(schema.thirdParties).where(eq(schema.thirdParties.companyId, companyId)).all(),
      accountCategories: db.select().from(schema.accountCategories).where(eq(schema.accountCategories.companyId, companyId)).all(),
      invoices: inv,
      invoicePayments: db.select().from(schema.invoicePayments).where(eq(schema.invoicePayments.companyId, companyId)).all(),
      invoiceAttachments: db.select().from(schema.invoiceAttachments).where(eq(schema.invoiceAttachments.companyId, companyId)).all(),
      recurringInvoices: db.select().from(schema.recurringInvoices).where(eq(schema.recurringInvoices.companyId, companyId)).all(),
      bankAccounts: db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, companyId)).all(),
      quotes: db.select().from(schema.quotes).where(eq(schema.quotes.companyId, companyId)).all(),
      documentLines: db.select().from(schema.documentLines).where(eq(schema.documentLines.companyId, companyId)).all(),
      contracts: db.select().from(schema.contracts).where(eq(schema.contracts.companyId, companyId)).all(),
      contractTemplates: db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.companyId, companyId)).all(),
      vatReturns: returns,
      vatReturnLines: returnIds.length ? db.select().from(schema.vatReturnLines).where(inArray(schema.vatReturnLines.vatReturnId, returnIds)).all() : [],
      associates: db.select().from(schema.associates).where(eq(schema.associates.companyId, companyId)).all(),
      fundContributions: db.select().from(schema.fundContributions).where(eq(schema.fundContributions.companyId, companyId)).all(),
      cashReconciliations: db.select().from(schema.cashReconciliations).where(eq(schema.cashReconciliations.companyId, companyId)).all(),
      objectives: db.select().from(schema.objectives).where(eq(schema.objectives.companyId, companyId)).all(),
      dashboards: db.select().from(schema.dashboards).where(eq(schema.dashboards.companyId, companyId)).all(),
      companyEquity: db.select().from(schema.companyEquity).where(eq(schema.companyEquity.companyId, companyId)).get() ?? null,
      equityAccounts: db.select().from(schema.equityAccounts).where(eq(schema.equityAccounts.companyId, companyId)).all(),
      distributions: db.select().from(schema.distributions).where(eq(schema.distributions.companyId, companyId)).all(),
      signatures: db.select().from(schema.signatures).where(eq(schema.signatures.companyId, companyId)).all(),
    } as unknown as CompanyBundle;
  }

  function makeFile(scope: "all" | "company", companyIds: string[], now: string): BackupFile {
    return {
      format: "qompta-backup",
      version: BACKUP_VERSION,
      exportedAt: now,
      scope,
      companies: companyIds.map(bundleFor),
    };
  }

  return {
    exportCompany(companyId: string, now: string): BackupFile {
      return makeFile("company", [companyId], now);
    },

    exportAll(now: string): BackupFile {
      const ids = db.select({ id: schema.companies.id }).from(schema.companies).all().map((c) => c.id);
      return makeFile("all", ids, now);
    },

    /** Imports the companies of a file, giving them new identifiers. */
    importFile(file: BackupFile): { imported: number; names: string[] } {
      if (file.format !== "qompta-backup") throw new Error("Fichier de sauvegarde invalide.");
      const names: string[] = [];
      for (const bundle of file.companies) {
        names.push(importBundle(db, bundle));
      }
      return { imported: file.companies.length, names };
    },
  };
}

/** Inserts a bundle with full identifier remapping. Returns the imported name. */
function importBundle(db: DB, b: CompanyBundle): string {
  const newCompanyId = randomUUID();
  const map = {
    thirdParty: new Map<string, string>(),
    category: new Map<string, string>(),
    invoice: new Map<string, string>(),
    recurring: new Map<string, string>(),
    fiscalYear: new Map<string, string>(),
    vatReturn: new Map<string, string>(),
    bankAccount: new Map<string, string>(),
    quote: new Map<string, string>(),
    contract: new Map<string, string>(),
    associate: new Map<string, string>(),
    signature: new Map<string, string>(),
  };
  const remap = (m: Map<string, string>, id: unknown): string | null => {
    if (id == null) return null;
    const key = String(id);
    if (!m.has(key)) m.set(key, randomUUID());
    return m.get(key)!;
  };
  const fresh = (m: Map<string, string>, id: unknown): string => {
    const key = String(id ?? randomUUID());
    if (!m.has(key)) m.set(key, randomUUID());
    return m.get(key)!;
  };
  /** The "signatures" sections of a contract point to signatures: follow them. */
  const remapBlocksJson = (json: unknown): string => {
    try {
      const list = JSON.parse(String(json ?? "[]")) as Record<string, unknown>[];
      return JSON.stringify(
        list.map((b) =>
          b && b.type === "signatures" && Array.isArray(b.signatureIds)
            ? { ...b, signatureIds: b.signatureIds.map((id) => remap(map.signature, id)) }
            : b,
        ),
      );
    } catch {
      return "[]";
    }
  };

  const company = { ...(b.company as Record<string, unknown>), id: newCompanyId, name: `${b.company.name} (importé)` };
  db.insert(schema.companies).values(company as typeof schema.companies.$inferInsert).run();

  if (b.vatSettings) {
    db.insert(schema.companyVatSettings)
      .values({ ...(b.vatSettings as Record<string, unknown>), companyId: newCompanyId } as typeof schema.companyVatSettings.$inferInsert)
      .run();
  }

  if (b.brandSettings) {
    db.insert(schema.companyBrandSettings)
      .values({ ...(b.brandSettings as Record<string, unknown>), companyId: newCompanyId } as typeof schema.companyBrandSettings.$inferInsert)
      .run();
  }

  const reCompany = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((r) => ({ ...r, id: randomUUID(), companyId: newCompanyId }));

  for (const r of reCompany(b.legalFormHistory)) db.insert(schema.companyLegalFormHistory).values(r as typeof schema.companyLegalFormHistory.$inferInsert).run();
  for (const r of reCompany(b.companyVatRates)) db.insert(schema.companyVatRates).values(r as typeof schema.companyVatRates.$inferInsert).run();
  for (const r of reCompany(b.tdfnRates)) db.insert(schema.tdfnRates).values(r as typeof schema.tdfnRates.$inferInsert).run();

  for (const r of b.fiscalYears) db.insert(schema.fiscalYears).values({ ...r, id: fresh(map.fiscalYear, r.id), companyId: newCompanyId } as typeof schema.fiscalYears.$inferInsert).run();
  for (const r of b.thirdParties) db.insert(schema.thirdParties).values({ ...r, id: fresh(map.thirdParty, r.id), companyId: newCompanyId } as typeof schema.thirdParties.$inferInsert).run();
  for (const r of b.accountCategories) db.insert(schema.accountCategories).values({ ...r, id: fresh(map.category, r.id), companyId: newCompanyId } as typeof schema.accountCategories.$inferInsert).run();
  for (const r of b.recurringInvoices) db.insert(schema.recurringInvoices).values({ ...r, id: fresh(map.recurring, r.id), companyId: newCompanyId } as typeof schema.recurringInvoices.$inferInsert).run();

  // Bank accounts come before the quotes and invoices that reference them.
  for (const r of b.bankAccounts ?? []) db.insert(schema.bankAccounts).values({ ...r, id: fresh(map.bankAccount, r.id), companyId: newCompanyId } as typeof schema.bankAccounts.$inferInsert).run();

  for (const r of b.invoices) {
    db.insert(schema.invoices).values({
      ...r,
      id: fresh(map.invoice, r.id),
      companyId: newCompanyId,
      thirdPartyId: remap(map.thirdParty, r.thirdPartyId),
      categoryId: remap(map.category, r.categoryId),
      recurringId: r.recurringId ? remap(map.recurring, r.recurringId) : null,
      quoteId: r.quoteId ? remap(map.quote, r.quoteId) : null,
      contractId: r.contractId ? remap(map.contract, r.contractId) : null,
      bankAccountId: r.bankAccountId ? remap(map.bankAccount, r.bankAccountId) : null,
    } as typeof schema.invoices.$inferInsert).run();
  }

  for (const r of b.quotes ?? []) {
    db.insert(schema.quotes).values({
      ...r,
      id: fresh(map.quote, r.id),
      companyId: newCompanyId,
      thirdPartyId: remap(map.thirdParty, r.thirdPartyId),
      bankAccountId: r.bankAccountId ? remap(map.bankAccount, r.bankAccountId) : null,
      invoiceId: r.invoiceId ? remap(map.invoice, r.invoiceId) : null,
      contractId: r.contractId ? remap(map.contract, r.contractId) : null,
      // "none" = signature deliberately absent: it is not an identifier.
      signatureId: r.signatureId && r.signatureId !== "none" ? remap(map.signature, r.signatureId) : (r.signatureId ?? null),
    } as typeof schema.quotes.$inferInsert).run();
  }

  for (const r of b.contracts ?? []) {
    db.insert(schema.contracts).values({
      ...r,
      id: fresh(map.contract, r.id),
      companyId: newCompanyId,
      thirdPartyId: remap(map.thirdParty, r.thirdPartyId),
      quoteId: r.quoteId ? remap(map.quote, r.quoteId) : null,
      articlesJson: remapBlocksJson(r.articlesJson),
    } as typeof schema.contracts.$inferInsert).run();
  }

  for (const r of reCompany(b.contractTemplates ?? [])) {
    db.insert(schema.contractTemplates)
      .values({ ...r, articlesJson: remapBlocksJson(r.articlesJson) } as typeof schema.contractTemplates.$inferInsert)
      .run();
  }

  // Lines point to a quote or an invoice depending on documentType.
  for (const r of b.documentLines ?? []) {
    const target = r.documentType === "quote" ? map.quote : map.invoice;
    db.insert(schema.documentLines).values({
      ...r,
      id: randomUUID(),
      companyId: newCompanyId,
      documentId: fresh(target, r.documentId),
    } as typeof schema.documentLines.$inferInsert).run();
  }
  for (const r of b.invoicePayments) db.insert(schema.invoicePayments).values({ ...r, id: randomUUID(), companyId: newCompanyId, invoiceId: fresh(map.invoice, r.invoiceId) } as typeof schema.invoicePayments.$inferInsert).run();
  for (const r of b.invoiceAttachments) db.insert(schema.invoiceAttachments).values({ ...r, id: randomUUID(), companyId: newCompanyId, invoiceId: fresh(map.invoice, r.invoiceId) } as typeof schema.invoiceAttachments.$inferInsert).run();

  for (const r of b.vatReturns) db.insert(schema.vatReturns).values({ ...r, id: fresh(map.vatReturn, r.id), companyId: newCompanyId } as typeof schema.vatReturns.$inferInsert).run();
  for (const r of b.vatReturnLines) db.insert(schema.vatReturnLines).values({ ...r, id: randomUUID(), vatReturnId: fresh(map.vatReturn, r.vatReturnId) } as typeof schema.vatReturnLines.$inferInsert).run();

  // Shareholders keep a remapped identifier: the fund contributions point to it.
  for (const r of b.associates) db.insert(schema.associates).values({ ...r, id: fresh(map.associate, r.id), companyId: newCompanyId } as typeof schema.associates.$inferInsert).run();
  for (const r of b.signatures ?? []) {
    db.insert(schema.signatures).values({
      ...r,
      id: fresh(map.signature, r.id),
      companyId: newCompanyId,
      associateId: r.associateId ? remap(map.associate, r.associateId) : null,
    } as typeof schema.signatures.$inferInsert).run();
  }
  for (const r of b.fundContributions ?? []) {
    db.insert(schema.fundContributions).values({
      ...r,
      id: randomUUID(),
      companyId: newCompanyId,
      associateId: r.associateId ? remap(map.associate, r.associateId) : null,
      bankAccountId: r.bankAccountId ? remap(map.bankAccount, r.bankAccountId) : null,
    } as typeof schema.fundContributions.$inferInsert).run();
  }
  // Cash reconciliations, targets, dashboards: no FK other than company.
  for (const r of reCompany(b.cashReconciliations ?? [])) db.insert(schema.cashReconciliations).values(r as typeof schema.cashReconciliations.$inferInsert).run();
  for (const r of reCompany(b.objectives ?? [])) db.insert(schema.objectives).values(r as typeof schema.objectives.$inferInsert).run();
  for (const r of reCompany(b.dashboards ?? [])) db.insert(schema.dashboards).values(r as typeof schema.dashboards.$inferInsert).run();
  if (b.companyEquity) db.insert(schema.companyEquity).values({ ...(b.companyEquity as Record<string, unknown>), companyId: newCompanyId } as typeof schema.companyEquity.$inferInsert).run();
  for (const r of reCompany(b.equityAccounts)) db.insert(schema.equityAccounts).values(r as typeof schema.equityAccounts.$inferInsert).run();
  for (const r of b.distributions) db.insert(schema.distributions).values({ ...r, id: randomUUID(), companyId: newCompanyId, fiscalYearId: r.fiscalYearId ? remap(map.fiscalYear, r.fiscalYearId) : null } as typeof schema.distributions.$inferInsert).run();

  return String(company.name);
}

export type BackupRepo = ReturnType<typeof createBackupRepo>;
