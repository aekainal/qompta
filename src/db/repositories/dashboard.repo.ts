/**
 * Dashboard aggregations (per company). Reuses the pure logic of
 * shared/dashboard + shared/metrics and the existing VAT calculation.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { accountCategories, companyVatSettings, contracts, invoices, quotes, thirdParties, vatReturns } from "../schema.js";
import type { CashVatSettlement } from "../../shared/funding.js";
import {
  buildCompanyDashboard,
  buildQuotePipeline,
  type CompanyDashboardResult,
  type DashInvoice,
  type DashQuote,
  type QuotePipeline,
  type VatEstimate,
} from "../../shared/dashboard.js";
import { computeMetricValues, type MetricContract, type MetricData, type Period } from "../../shared/metrics.js";
import {
  computeObjectiveProgress,
  type MetricValues,
  type ObjectiveProgress,
} from "../../shared/objectives.js";
import { createCompaniesRepo } from "./companies.repo.js";
import { createObjectivesRepo } from "./objectives.repo.js";
import { createVatReturnsRepo } from "./vatReturns.repo.js";
import { createFundContributionsRepo } from "./fundContributions.repo.js";
import { createCashReconciliationsRepo } from "./cashReconciliations.repo.js";

export type { CompanyDashboardResult };

export function createDashboardRepo(db: DB) {
  const companies = createCompaniesRepo(db);
  const vat = createVatReturnsRepo(db);
  const funding = createFundContributionsRepo(db);
  const reconciliations = createCashReconciliationsRepo(db);
  const objectives = createObjectivesRepo(db);

  function loadDashInvoices(companyId: string): DashInvoice[] {
    const tpNames = new Map(
      db.select().from(thirdParties).where(eq(thirdParties.companyId, companyId)).all()
        .map((t) => [t.id, t.name] as const),
    );
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .all()
      .map((r) => ({
        id: r.id,
        type: r.type as "sale" | "purchase",
        number: r.number,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        paymentDate: r.paymentDate,
        status: r.status,
        amountChf: r.amountChf,
        amountTtc: r.amountTtc,
        categoryId: r.categoryId,
        thirdPartyId: r.thirdPartyId,
        thirdPartyName: r.thirdPartyId ? tpNames.get(r.thirdPartyId) ?? null : null,
      }));
  }

  function loadDashQuotes(companyId: string): DashQuote[] {
    return db
      .select()
      .from(quotes)
      .where(eq(quotes.companyId, companyId))
      .all()
      .map((r) => ({
        id: r.id,
        issueDate: r.issueDate,
        status: r.status,
        amountHt: r.amountHt,
        supersededByQuoteId: r.supersededByQuoteId,
      }));
  }

  function loadContracts(companyId: string): MetricContract[] {
    return db
      .select()
      .from(contracts)
      .where(eq(contracts.companyId, companyId))
      .all()
      .map((r) => ({
        status: r.status,
        signedDate: r.signedDate,
        monthlyAmountHt: r.monthlyAmountHt,
        oneOffAmountHt: r.oneOffAmountHt,
      }));
  }

  function metricData(companyId: string): MetricData {
    return {
      invoices: loadDashInvoices(companyId),
      quotes: loadDashQuotes(companyId),
      contracts: loadContracts(companyId),
      funding: funding.list(companyId),
    };
  }

  /** Paid VAT returns → cash settlements (signed net at the payment date). */
  function loadVatSettlements(companyId: string): CashVatSettlement[] {
    return db
      .select()
      .from(vatReturns)
      .where(eq(vatReturns.companyId, companyId))
      .all()
      .filter((r) => r.status === "paid" && r.paidAt)
      .map((r) => ({ date: r.paidAt!.slice(0, 10), amount: (r.totalPayable ?? 0) - (r.totalCredit ?? 0) }));
  }

  function categoryLabels(companyId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of db.select().from(accountCategories).where(eq(accountCategories.companyId, companyId)).all()) {
      out[c.id] = `${c.code} · ${c.label}`;
    }
    return out;
  }

  function vatEstimate(companyId: string, year: number): VatEstimate {
    const settings = db
      .select()
      .from(companyVatSettings)
      .where(eq(companyVatSettings.companyId, companyId))
      .get();
    if (!settings?.isVatSubject) return { subject: false, payable: 0, credit: 0 };
    const { result } = vat.computeLive(companyId, "annual", year, null);
    return { subject: true, payable: result.b500, credit: result.b510 };
  }

  return {
    company(companyId: string, year: number): CompanyDashboardResult {
      const company = companies.get(companyId);
      if (!company) throw new Error("Société introuvable");
      const data = buildCompanyDashboard(
        loadDashInvoices(companyId),
        categoryLabels(companyId),
        year,
        loadDashQuotes(companyId),
        funding.list(companyId),
        loadContracts(companyId),
        reconciliations.list(companyId),
        loadVatSettlements(companyId),
      );
      return { ...data, companyName: company.name, vat: vatEstimate(companyId, year) };
    },

    /** Values of every management metric for a period (used by QomptAI). */
    metrics(companyId: string, period: Period): MetricValues {
      return computeMetricValues(period, metricData(companyId));
    },

    /** Quote pipeline of the year (open, accepted, won, lost), used by QomptAI. */
    pipeline(companyId: string, year: number): QuotePipeline {
      return buildQuotePipeline(loadDashQuotes(companyId), year);
    },

    /** Targets of the company with their actual progress recomputed. */
    objectivesProgress(companyId: string): ObjectiveProgress[] {
      const objs = objectives.list(companyId);
      if (objs.length === 0) return [];
      const data = metricData(companyId);
      // A given period is computed only once.
      const cache = new Map<string, MetricValues>();
      return objs.map((o) => {
        const key = `${o.periodType}:${o.periodYear}:${o.periodQuarter}:${o.periodMonth}`;
        let values = cache.get(key);
        if (!values) {
          const period: Period = {
            type: o.periodType,
            year: o.periodYear,
            quarter: o.periodQuarter,
            month: o.periodMonth,
          };
          values = computeMetricValues(period, data);
          cache.set(key, values);
        }
        return computeObjectiveProgress(o, values[o.metric]);
      });
    },
  };
}

export type DashboardRepo = ReturnType<typeof createDashboardRepo>;
