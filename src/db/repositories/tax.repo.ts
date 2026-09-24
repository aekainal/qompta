/**
 * Assembles the tax file of a company for a financial year (calendar year).
 * Reuses the VAT computation and the pure assembler shared/tax/dossier.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { accountCategories, companyVatSettings, invoices } from "../schema.js";
import { buildIncomeStatement, type ResultLine } from "../../shared/tax/result.js";
import { buildTaxDossier, type InvestmentRef, type TaxDossier, type VatRecap } from "../../shared/tax/dossier.js";
import type { Associate } from "../../shared/tax/allocation.js";
import { createCompaniesRepo } from "./companies.repo.js";
import { createAssociatesRepo } from "./associates.repo.js";
import { createVatReturnsRepo } from "./vatReturns.repo.js";
import { createCompanyEquityRepo } from "./companyEquity.repo.js";

export type { TaxDossier };

function vatChfOf(r: { currency: string; fxRate: number | null; vatAmount: number }): number {
  return r.currency === "CHF" || !r.fxRate ? r.vatAmount : Math.round((r.vatAmount * r.fxRate) / 10000);
}

export function createTaxRepo(db: DB) {
  const companies = createCompaniesRepo(db);
  const associatesRepo = createAssociatesRepo(db);
  const vat = createVatReturnsRepo(db);
  const equityRepo = createCompanyEquityRepo(db);

  return {
    dossier(companyId: string, year: number): TaxDossier {
      const company = companies.get(companyId);
      if (!company) throw new Error("Société introuvable");

      const cats = new Map(
        db.select().from(accountCategories).where(eq(accountCategories.companyId, companyId)).all()
          .map((c) => [c.id, `${c.code} — ${c.label}`] as const),
      );
      const rows = db
        .select()
        .from(invoices)
        .where(eq(invoices.companyId, companyId))
        .all()
        .filter((r) => r.issueDate.slice(0, 4) === String(year));

      // Income statement: revenue (net sales) and expenses (net purchases) per category.
      const lineMap = new Map<string, ResultLine>();
      for (const r of rows) {
        const kind = r.type === "sale" ? "product" : "expense";
        const key = `${kind}:${r.categoryId ?? "none"}`;
        const label = r.categoryId ? cats.get(r.categoryId) ?? "Autre" : "Sans catégorie";
        const existing = lineMap.get(key);
        if (existing) existing.amount += r.amountChf;
        else lineMap.set(key, { categoryId: r.categoryId, categoryLabel: label, kind, amount: r.amountChf });
      }
      const incomeStatement = buildIncomeStatement([...lineMap.values()]);

      // Annual VAT recap.
      const settings = db.select().from(companyVatSettings).where(eq(companyVatSettings.companyId, companyId)).get();
      const subject = settings?.isVatSubject ?? false;
      let vatRecap: VatRecap = { subject, collected: 0, inputTax: 0, netDue: 0, otherFunds900: 0, otherFunds910: 0 };
      if (subject) {
        const collected = rows.filter((r) => r.type === "sale").reduce((s, r) => s + vatChfOf(r), 0);
        const inputTax = rows.filter((r) => r.type === "purchase").reduce((s, r) => s + vatChfOf(r), 0);
        const { result } = vat.computeLive(companyId, "annual", year, null);
        vatRecap = {
          subject: true,
          collected,
          inputTax,
          netDue: result.b500 - result.b510,
          otherFunds900: result.b900,
          otherFunds910: result.b910,
        };
      }

      // Investments (code 405).
      const investments: InvestmentRef[] = rows
        .filter((r) => r.type === "purchase" && r.treatment === "input_investment")
        .map((r) => ({
          id: r.id,
          number: r.number,
          date: r.issueDate,
          label: r.description ?? (r.categoryId ? cats.get(r.categoryId) ?? "" : "Investissement"),
          amountChf: r.amountChf,
          vatChf: vatChfOf(r),
        }));

      // Shareholders (simple partnership / SNC).
      const associates: Associate[] = associatesRepo.list(companyId).map((a) => ({
        id: a.id,
        name: a.name,
        shareBps: a.shareBps,
      }));

      // Equity (Sàrl/SA): entered through the «Fonds propres» form.
      const equity = equityRepo.get(companyId);

      return buildTaxDossier({
        companyName: company.name,
        form: company.legalForm,
        year,
        incomeStatement,
        vat: vatRecap,
        investments,
        associates,
        equity,
      });
    },
  };
}

export type TaxRepo = ReturnType<typeof createTaxRepo>;
