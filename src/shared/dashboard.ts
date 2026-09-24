/**
 * Aggregations for the dashboards (pure, testable).
 * Amounts in cents. The invoices passed in are already filtered by company.
 */

import { sumCents, type Cents } from "./money.js";
import { isVatOnly } from "./invoice.js";
import {
  buildCashPosition,
  summarizeFunding,
  type CashPosition,
  type FundContribution,
  type FundingSummary,
  type CashVatSettlement,
} from "./funding.js";
import type { CashReconciliation } from "./cashReconciliation.js";
import { computeMetricValues, yearPeriod, type MetricContract } from "./metrics.js";
import type { MetricValues } from "./objectives.js";

export interface DashInvoice {
  id: string;
  type: "sale" | "purchase";
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  amountChf: Cents; // net amount in CHF
  amountTtc: Cents;
  categoryId: string | null;
  thirdPartyId?: string | null;
  thirdPartyName?: string | null;
}

export interface MonthlyPoint {
  month: string; // "01".."12"
  products: Cents;
  expenses: Cents;
  /** Income − expenses for the month. */
  result: Cents;
}

export interface CategorySlice {
  categoryId: string | null;
  label: string;
  amount: Cents;
}

export interface InvoiceRef {
  id: string;
  number: string | null;
  thirdPartyName: string | null;
  dueDate: string | null;
  amountTtc: Cents;
  status: string;
}

/** Quote normalized for the dashboard. */
export interface DashQuote {
  id: string;
  issueDate: string;
  status: string;
  /** Net amount in cents. */
  amountHt: Cents;
  /** Revised quote that replaces this one, if any. */
  supersededByQuoteId: string | null;
}

/**
 * Sales view of a year's quotes.
 *
 * A refused or expired quote counts as lost only if it was not taken up again:
 * when an offer is revised, the new version carries the opportunity, and
 * counting both would artificially inflate the losses.
 */
export interface QuotePipeline {
  /** Open quotes (draft, sent): revenue still possible. */
  pending: Cents;
  pendingCount: number;
  /** Accepted quotes, not yet invoiced. */
  accepted: Cents;
  acceptedCount: number;
  /** Quotes turned into an invoice. */
  won: Cents;
  wonCount: number;
  /** Refused or expired quotes not taken up again: lost deals. */
  lost: Cents;
  lostCount: number;
  /** Refused or expired quotes taken up again in a revised version. */
  revised: Cents;
  revisedCount: number;
  /** Win rate in basis points: won / (won + lost). */
  winRateBps: number;
}

/** Recurring revenue base carried by the signed contracts. */
export interface ContractsSummary {
  /** Contracts signed and not terminated. */
  signedActive: number;
  /** Contracts signed during the year. */
  signedThisYear: number;
  /** Net monthly recurring revenue (MRR). */
  monthlyRecurringHt: Cents;
  /** Net annualized recurring revenue (ARR = MRR × 12). */
  yearlyRecurringHt: Cents;
  /** Net one-off service lines committed by the signed contracts. */
  oneOffHt: Cents;
}

/** Revenue invoiced per customer, for the sales ranking. */
export interface ClientRevenue {
  thirdPartyId: string | null;
  name: string;
  invoicedHt: Cents;
  count: number;
}

/** Value of the 17 metrics for a given month (series of the "metric by month" charts). */
export interface MonthlyMetric {
  month: string; // "01".."12"
  values: MetricValues;
}

export interface CompanyDashboard {
  year: number;
  totalProductsInvoiced: Cents; // net invoiced revenue
  totalProductsCollected: Cents; // net collected revenue
  totalCharges: Cents; // net expenses
  result: Cents; // income - expenses
  /** Number of sales invoices for the year. */
  salesCount: number;
  /** Net average invoice (invoiced revenue / number of sales). */
  avgInvoiceHt: Cents;
  /** New customers of the year (first invoice falling within the year). */
  newClientsCount: number;
  monthly: MonthlyPoint[];
  /** Same series for the previous year: year-over-year comparison. */
  prevYearMonthly: MonthlyPoint[];
  productsByCategory: CategorySlice[];
  expensesByCategory: CategorySlice[];
  unpaid: InvoiceRef[]; // issued sales not settled
  overdue: InvoiceRef[]; // overdue invoices
  quotes: QuotePipeline; // quotes: potential, won, lost
  /** Recurring base of the contracts. */
  contracts: ContractsSummary;
  /** Top customers of the year by invoiced revenue. */
  topClients: ClientRevenue[];
  /** Shareholder fund contributions of the year (outside VAT, outside revenue). */
  funding: FundingSummary;
  /** Cumulative cash position at year end: contributions + collections − payments. */
  cash: CashPosition;
  /** Actual values of all metrics over the year (for KPIs and targets). */
  metrics: MetricValues;
  /** The 17 metrics month by month (material for the "metric by month" charts). */
  monthlyMetrics: MonthlyMetric[];
}

// ── Result types exposed by the repositories / IPC ──

export interface VatEstimate {
  subject: boolean;
  payable: Cents;
  credit: Cents;
}

export interface CompanyDashboardResult extends CompanyDashboard {
  companyName: string;
  vat: VatEstimate;
}

function inYear(dateIso: string | null, year: number): boolean {
  return !!dateIso && dateIso.slice(0, 4) === String(year);
}

function monthOf(dateIso: string): string {
  return dateIso.slice(5, 7);
}

/**
 * Builds a company's dashboard for a year.
 * @param categoryLabels map categoryId -> label
 */
export function buildQuotePipeline(quotes: DashQuote[], year: number): QuotePipeline {
  const p: QuotePipeline = {
    pending: 0,
    pendingCount: 0,
    accepted: 0,
    acceptedCount: 0,
    won: 0,
    wonCount: 0,
    lost: 0,
    lostCount: 0,
    revised: 0,
    revisedCount: 0,
    winRateBps: 0,
  };

  for (const q of quotes) {
    if (!inYear(q.issueDate, year)) continue;

    switch (q.status) {
      case "draft":
      case "sent":
        p.pending += q.amountHt;
        p.pendingCount++;
        break;
      case "accepted":
        p.accepted += q.amountHt;
        p.acceptedCount++;
        break;
      case "invoiced":
        p.won += q.amountHt;
        p.wonCount++;
        break;
      case "refused":
      case "expired":
        // Taken up again in a revised version: the deal is not lost.
        if (q.supersededByQuoteId) {
          p.revised += q.amountHt;
          p.revisedCount++;
        } else {
          p.lost += q.amountHt;
          p.lostCount++;
        }
        break;
    }
  }

  // Win rate over decided deals only.
  const decided = p.won + p.lost;
  p.winRateBps = decided > 0 ? Math.round((p.won * 10000) / decided) : 0;

  return p;
}

/** Monthly income / expenses / result series for a year. */
function monthlySeries(invoices: DashInvoice[], year: number): MonthlyPoint[] {
  const months: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: String(i + 1).padStart(2, "0"),
    products: 0,
    expenses: 0,
    result: 0,
  }));
  for (const inv of invoices) {
    if (!inYear(inv.issueDate, year)) continue;
    if (isVatOnly(inv.status)) continue; // recorded for the VAT return only
    const m = Number(monthOf(inv.issueDate)) - 1;
    if (m < 0 || m > 11) continue;
    if (inv.type === "sale") months[m].products += inv.amountChf;
    else months[m].expenses += inv.amountChf;
  }
  for (const p of months) p.result = p.products - p.expenses;
  return months;
}

/** Ranking of customers by net invoiced revenue for the year. */
function topClientsOf(sales: DashInvoice[], limit = 6): ClientRevenue[] {
  const map = new Map<string, ClientRevenue>();
  for (const i of sales) {
    const key = i.thirdPartyId ?? `name:${i.thirdPartyName ?? "—"}`;
    const entry =
      map.get(key) ??
      { thirdPartyId: i.thirdPartyId ?? null, name: i.thirdPartyName ?? "Sans client", invoicedHt: 0, count: 0 };
    entry.invoicedHt += i.amountChf;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.invoicedHt - a.invoicedHt)
    .slice(0, limit);
}

export function buildCompanyDashboard(
  invoices: DashInvoice[],
  categoryLabels: Record<string, string>,
  year: number,
  quotes: DashQuote[] = [],
  contributions: FundContribution[] = [],
  contracts: MetricContract[] = [],
  reconciliations: CashReconciliation[] = [],
  vatSettlements: CashVatSettlement[] = [],
): CompanyDashboard {
  const yearInvoices = invoices.filter((i) => inYear(i.issueDate, year));
  // "Réglé (pour TVA)" is not a real sale/expense: outside income, expenses, result.
  const sales = yearInvoices.filter((i) => i.type === "sale" && !isVatOnly(i.status));
  const purchases = yearInvoices.filter((i) => i.type === "purchase" && !isVatOnly(i.status));

  const totalProductsInvoiced = sumCents(...sales.map((i) => i.amountChf));
  const totalProductsCollected = sumCents(
    ...sales.filter((i) => i.status === "paid").map((i) => i.amountChf),
  );
  const totalCharges = sumCents(...purchases.map((i) => i.amountChf));
  const salesCount = sales.length;
  const avgInvoiceHt = salesCount > 0 ? Math.round(totalProductsInvoiced / salesCount) : 0;

  const monthly = monthlySeries(invoices, year);
  const prevYearMonthly = monthlySeries(invoices, year - 1);

  const productsByCategory = groupByCategory(sales, categoryLabels);
  const expensesByCategory = groupByCategory(purchases, categoryLabels);

  const unpaid: InvoiceRef[] = sales
    .filter((i) => i.status === "issued" || i.status === "partial" || i.status === "overdue")
    .map(toRef);
  const overdue: InvoiceRef[] = yearInvoices.filter((i) => i.status === "overdue").map(toRef);

  /*
   * Contributions: the shareholder table stays on the selected year, but the
   * cash position is cumulative up to 31.12 — last year's contribution still
   * funds this year's invoices.
   */
  const endOfYear = `${year}-12-31`;
  const funding = summarizeFunding(
    contributions.filter((c) => inYear(c.date, year)),
  );
  const cash = buildCashPosition(contributions, invoices, endOfYear, reconciliations, vatSettlements);

  // Recurring base of the contracts.
  const signed = contracts.filter((c) => c.status === "signed");
  const monthlyRecurringHt = sumCents(...signed.map((c) => c.monthlyAmountHt ?? 0));
  const contractsSummary: ContractsSummary = {
    signedActive: signed.length,
    signedThisYear: contracts.filter((c) => inYear(c.signedDate, year)).length,
    monthlyRecurringHt,
    yearlyRecurringHt: monthlyRecurringHt * 12,
    oneOffHt: sumCents(...signed.map((c) => c.oneOffAmountHt ?? 0)),
  };

  const metricData = { invoices, quotes, contracts, funding: contributions };
  const metrics = computeMetricValues(yearPeriod(year), metricData);
  const monthlyMetrics: MonthlyMetric[] = Array.from({ length: 12 }, (_, i) => ({
    month: String(i + 1).padStart(2, "0"),
    values: computeMetricValues({ type: "month", year, month: i + 1 }, metricData),
  }));

  return {
    year,
    totalProductsInvoiced,
    totalProductsCollected,
    totalCharges,
    result: totalProductsInvoiced - totalCharges,
    salesCount,
    avgInvoiceHt,
    newClientsCount: metrics.new_clients_count,
    monthly,
    prevYearMonthly,
    productsByCategory,
    expensesByCategory,
    unpaid,
    overdue,
    quotes: buildQuotePipeline(quotes, year),
    contracts: contractsSummary,
    topClients: topClientsOf(sales),
    funding,
    cash,
    metrics,
    monthlyMetrics,
  };
}

function groupByCategory(invoices: DashInvoice[], labels: Record<string, string>): CategorySlice[] {
  const map = new Map<string, Cents>();
  for (const inv of invoices) {
    const key = inv.categoryId ?? "_none";
    map.set(key, (map.get(key) ?? 0) + inv.amountChf);
  }
  return Array.from(map.entries())
    .map(([key, amount]) => ({
      categoryId: key === "_none" ? null : key,
      label: key === "_none" ? "Sans catégorie" : labels[key] ?? key,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function toRef(i: DashInvoice): InvoiceRef {
  return {
    id: i.id,
    number: i.number,
    thirdPartyName: i.thirdPartyName ?? null,
    dueDate: i.dueDate,
    amountTtc: i.amountTtc,
    status: i.status,
  };
}
