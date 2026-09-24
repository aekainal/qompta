/**
 * Repository for companies and their attached data.
 *
 * Isolation rule: every read/write of business data requires a companyId. The
 * only global tables handled here are `companies`, `company_vat_settings`
 * (key = companyId) and the legal form history.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import {
  companies,
  companyLegalFormHistory,
  companyVatSettings,
} from "../schema.js";
import type {
  Company,
  CompanyInput,
  CompanyVatSettings,
  LegalFormChange,
} from "../../shared/types.js";
import type { LegalForm } from "../../shared/legal-form.js";
import { rulesFor } from "../../shared/legal-form.js";
import { createAccountsRepo } from "./accounts.repo.js";

function nowIso(): string {
  return new Date().toISOString();
}

function rowToCompany(row: typeof companies.$inferSelect): Company {
  return {
    id: row.id,
    name: row.name,
    legalForm: row.legalForm as LegalForm,
    ideNumber: row.ideNumber,
    vatNumber: row.vatNumber,
    rcRegistered: row.rcRegistered,
    addressJson: row.addressJson,
    accountingMode: row.accountingMode as Company["accountingMode"],
    shareCapital: row.shareCapital,
    defaultCurrency: row.defaultCurrency,
    color: row.color,
    status: row.status as Company["status"],
    rcNumber: row.rcNumber,
    email: row.email,
    phone: row.phone,
    website: row.website,
    street: row.street,
    buildingNumber: row.buildingNumber,
    zip: row.zip,
    city: row.city,
    country: row.country,
    logoText: row.logoText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function createCompaniesRepo(db: DB) {
  return {
    list(includeArchived = false): Company[] {
      const rows = db.select().from(companies).all();
      return rows
        .filter((r) => includeArchived || r.status === "active")
        .map(rowToCompany);
    },

    get(id: string): Company | null {
      const row = db.select().from(companies).where(eq(companies.id, id)).get();
      return row ? rowToCompany(row) : null;
    },

    create(input: CompanyInput): Company {
      const id = randomUUID();
      const ts = nowIso();
      const rules = rulesFor(input.legalForm);
      const accountingMode =
        input.accountingMode ?? (rules.doubleEntryRequired ? "double" : "simple");

      db.insert(companies)
        .values({
          id,
          name: input.name,
          legalForm: input.legalForm,
          ideNumber: input.ideNumber ?? null,
          vatNumber: input.vatNumber ?? null,
          rcRegistered: input.rcRegistered ?? false,
          accountingMode,
          shareCapital: input.shareCapital ?? null,
          defaultCurrency: input.defaultCurrency ?? "CHF",
          color: input.color ?? null,
          status: "active",
          rcNumber: input.rcNumber ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          website: input.website ?? null,
          street: input.street ?? null,
          buildingNumber: input.buildingNumber ?? null,
          zip: input.zip ?? null,
          city: input.city ?? null,
          country: input.country || "CH",
          logoText: input.logoText ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      // Default VAT settings.
      db.insert(companyVatSettings)
        .values({ companyId: id, createdAt: ts, updatedAt: ts })
        .run();

      // First legal form history entry.
      db.insert(companyLegalFormHistory)
        .values({
          id: randomUUID(),
          companyId: id,
          fromForm: null,
          toForm: input.legalForm,
          effectiveDate: ts.slice(0, 10),
          note: "Création de la société",
          createdAt: ts,
        })
        .run();

      // Default chart of accounts fitted to the legal form.
      createAccountsRepo(db).seedDefaults(id, input.legalForm);

      return this.get(id)!;
    },

    update(id: string, patch: Partial<CompanyInput>): Company {
      db.update(companies)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.legalForm !== undefined ? { legalForm: patch.legalForm } : {}),
          ...(patch.ideNumber !== undefined ? { ideNumber: patch.ideNumber } : {}),
          ...(patch.vatNumber !== undefined ? { vatNumber: patch.vatNumber } : {}),
          ...(patch.rcRegistered !== undefined ? { rcRegistered: patch.rcRegistered } : {}),
          ...(patch.accountingMode !== undefined ? { accountingMode: patch.accountingMode } : {}),
          ...(patch.shareCapital !== undefined ? { shareCapital: patch.shareCapital } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.rcNumber !== undefined ? { rcNumber: patch.rcNumber } : {}),
          ...(patch.email !== undefined ? { email: patch.email } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          ...(patch.website !== undefined ? { website: patch.website } : {}),
          ...(patch.street !== undefined ? { street: patch.street } : {}),
          ...(patch.buildingNumber !== undefined ? { buildingNumber: patch.buildingNumber } : {}),
          ...(patch.zip !== undefined ? { zip: patch.zip } : {}),
          ...(patch.city !== undefined ? { city: patch.city } : {}),
          ...(patch.country !== undefined ? { country: patch.country || "CH" } : {}),
          ...(patch.logoText !== undefined ? { logoText: patch.logoText } : {}),
          updatedAt: nowIso(),
        })
        .where(eq(companies.id, id))
        .run();
      return this.get(id)!;
    },

    archive(id: string): { ok: true } {
      const ts = nowIso();
      db.update(companies)
        .set({ status: "archived", archivedAt: ts, updatedAt: ts })
        .where(eq(companies.id, id))
        .run();
      return { ok: true };
    },

    /** Changes a company's status (active / inactive). */
    setStatus(id: string, status: string): Company {
      db.update(companies)
        .set({ status, archivedAt: status === "active" ? null : undefined, updatedAt: nowIso() })
        .where(eq(companies.id, id))
        .run();
      return this.get(id)!;
    },

    getVatSettings(companyId: string): CompanyVatSettings | null {
      const row = db
        .select()
        .from(companyVatSettings)
        .where(eq(companyVatSettings.companyId, companyId))
        .get();
      if (!row) return null;
      return {
        companyId: row.companyId,
        isVatSubject: row.isVatSubject,
        periodType: row.periodType as CompanyVatSettings["periodType"],
        method: row.method as CompanyVatSettings["method"],
        accountingBasis: row.accountingBasis as CompanyVatSettings["accountingBasis"],
      };
    },

    updateVatSettings(s: CompanyVatSettings): CompanyVatSettings {
      db.update(companyVatSettings)
        .set({
          isVatSubject: s.isVatSubject,
          periodType: s.periodType,
          method: s.method,
          accountingBasis: s.accountingBasis,
          updatedAt: nowIso(),
        })
        .where(eq(companyVatSettings.companyId, s.companyId))
        .run();
      return this.getVatSettings(s.companyId)!;
    },

    /** HARD deletion of a company (FK cascade over all its data). */
    remove(id: string): { ok: true } {
      db.delete(companies).where(eq(companies.id, id)).run();
      return { ok: true };
    },

    convertLegalForm(
      companyId: string,
      toForm: LegalForm,
      effectiveDate: string,
      note?: string | null,
    ): LegalFormChange {
      const current = this.get(companyId);
      if (!current) throw new Error("Société introuvable");
      const id = randomUUID();
      const ts = nowIso();
      db.insert(companyLegalFormHistory)
        .values({
          id,
          companyId,
          fromForm: current.legalForm,
          toForm,
          effectiveDate,
          note: note ?? null,
          createdAt: ts,
        })
        .run();
      // The company's "current" legal form becomes the new one. A form requiring
      // double-entry accounting (SNC/Sàrl/SA) switches the mode to "double".
      const toRules = rulesFor(toForm);
      db.update(companies)
        .set({
          legalForm: toForm,
          updatedAt: ts,
          ...(toRules.doubleEntryRequired ? { accountingMode: "double" as const } : {}),
        })
        .where(eq(companies.id, companyId))
        .run();
      // Conversion to a form with capital (Sàrl/SA): complete the chart of accounts
      // with the missing capital/reserve accounts (idempotent, keyed by code).
      if (toRules.usesEquityCapital) {
        createAccountsRepo(db).ensureDefaults(companyId, toForm);
      }
      return {
        id,
        companyId,
        fromForm: current.legalForm,
        toForm,
        effectiveDate,
        note: note ?? null,
        createdAt: ts,
      };
    },

    legalFormHistory(companyId: string): LegalFormChange[] {
      return db
        .select()
        .from(companyLegalFormHistory)
        .where(eq(companyLegalFormHistory.companyId, companyId))
        .all()
        .map((r) => ({
          id: r.id,
          companyId: r.companyId,
          fromForm: r.fromForm as LegalForm | null,
          toForm: r.toForm as LegalForm,
          effectiveDate: r.effectiveDate,
          note: r.note,
          createdAt: r.createdAt,
        }));
    },

    /**
     * Legal form applicable on a given date.
     *
     * The creation entry (fromForm === null) stands for the original form and
     * applies to any date before the first conversion. For later dates, the last
     * conversion whose effective_date <= date is kept.
     */
    legalFormAt(companyId: string, atDate: string): LegalForm | null {
      const history = this.legalFormHistory(companyId);
      if (history.length === 0) return null;

      const original = history.find((h) => h.fromForm === null);
      const conversions = history
        .filter((h) => h.fromForm !== null && h.effectiveDate <= atDate)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

      if (conversions.length > 0) {
        return conversions[conversions.length - 1].toForm;
      }
      return original ? original.toForm : history[0].toForm;
    },
  };
}

export type CompaniesRepo = ReturnType<typeof createCompaniesRepo>;

// Used by other modules to guarantee the isolation filter.
export const companyScope = (col: typeof companies.id, companyId: string) =>
  and(eq(col, companyId));
