/**
 * **Pure** computation of the actual value of each management metric over a
 * period (year, quarter or month). Serves the targets AND the dashboards.
 * Amounts in cents, rates in basis points.
 */

import { sumCents } from "./money.js";
import { isVatOnly } from "./invoice.js";
import { summarizeFunding, type FundContribution } from "./funding.js";
import type { DashInvoice, DashQuote } from "./dashboard.js";
import type { MetricValues, ObjectivePeriodType } from "./objectives.js";

export interface Period {
  type: ObjectivePeriodType;
  year: number;
  /** 1..4 when type = quarter. */
  quarter?: number | null;
  /** 1..12 when type = month. */
  month?: number | null;
}

/** Contract reduced to what weighs on the metrics. */
export interface MetricContract {
  status: string;
  signedDate: string | null;
  monthlyAmountHt: number | null;
  oneOffAmountHt?: number | null;
}

/** Does an ISO date fall inside the period? */
export function inPeriod(dateIso: string | null, period: Period): boolean {
  if (!dateIso) return false;
  if (dateIso.slice(0, 4) !== String(period.year)) return false;
  if (period.type === "year") return true;
  const month = Number(dateIso.slice(5, 7));
  if (period.type === "quarter") return Math.ceil(month / 3) === period.quarter;
  return month === period.month;
}

export function yearPeriod(year: number): Period {
  return { type: "year", year };
}

export interface MetricData {
  invoices: DashInvoice[];
  quotes: DashQuote[];
  contracts: MetricContract[];
  funding: FundContribution[];
}

/**
 * All actual values for a period. A single pass per data family, reused by the
 * KPIs, the charts and the progress of the targets.
 */
export function computeMetricValues(period: Period, data: MetricData): MetricValues {
  const { invoices, quotes, contracts, funding } = data;

  // « Réglé (pour TVA) » is neither real revenue nor a real expense (off result).
  const salesAll = invoices.filter((i) => i.type === "sale" && !isVatOnly(i.status));
  const salesInP = salesAll.filter((i) => inPeriod(i.issueDate, period));
  const purchasesInP = invoices.filter(
    (i) => i.type === "purchase" && !isVatOnly(i.status) && inPeriod(i.issueDate, period),
  );

  const revenue_invoiced = sumCents(...salesInP.map((i) => i.amountChf));
  // Cash basis: the sale counts on its payment date (its issue date otherwise).
  const revenue_collected = sumCents(
    ...salesAll
      .filter((i) => i.status === "paid" && inPeriod(i.paymentDate ?? i.issueDate, period))
      .map((i) => i.amountChf),
  );
  const charges = sumCents(...purchasesInP.map((i) => i.amountChf));
  const result = revenue_invoiced - charges;
  const margin_rate = revenue_invoiced > 0 ? Math.round((result * 10000) / revenue_invoiced) : 0;
  const collection_rate =
    revenue_invoiced > 0 ? Math.round((revenue_collected * 10000) / revenue_invoiced) : 0;

  // Quotes issued over the period.
  const quotesInP = quotes.filter((q) => inPeriod(q.issueDate, period));
  const quotes_created_count = quotesInP.length;
  const won = quotesInP.filter((q) => q.status === "invoiced");
  const quotes_won_amount = sumCents(...won.map((q) => q.amountHt));
  const quotes_won_count = won.length;
  // Win rate over decided deals only, by amount (like the pipeline).
  const lost = quotesInP.filter(
    (q) => (q.status === "refused" || q.status === "expired") && !q.supersededByQuoteId,
  );
  const lostAmount = sumCents(...lost.map((q) => q.amountHt));
  const decided = quotes_won_amount + lostAmount;
  const win_rate = decided > 0 ? Math.round((quotes_won_amount * 10000) / decided) : 0;

  const invoices_sales_count = salesInP.length;
  const avg_invoice = invoices_sales_count > 0 ? Math.round(revenue_invoiced / invoices_sales_count) : 0;

  // New customers: first sales invoice (across all periods) falling in here.
  const firstSale = new Map<string, string>();
  for (const i of salesAll) {
    if (!i.thirdPartyId) continue;
    const d = firstSale.get(i.thirdPartyId);
    if (!d || i.issueDate < d) firstSale.set(i.thirdPartyId, i.issueDate);
  }
  let new_clients_count = 0;
  for (const d of firstSale.values()) if (inPeriod(d, period)) new_clients_count++;

  const contracts_signed_count = contracts.filter((c) => inPeriod(c.signedDate, period)).length;
  // Recurring: snapshot of the signed contracts (see MetricDef.snapshot).
  const recurring_monthly = sumCents(
    ...contracts.filter((c) => c.status === "signed").map((c) => c.monthlyAmountHt ?? 0),
  );
  const recurring_yearly = recurring_monthly * 12;

  const funding_amount = summarizeFunding(funding.filter((f) => inPeriod(f.date, period))).net;

  // Cash & receivables (snapshots, gross), collection delay, expense ratio.
  const receivables = sumCents(
    ...salesAll.filter((i) => i.status === "issued" || i.status === "partial" || i.status === "overdue").map((i) => i.amountTtc),
  );
  const overdue_amount = sumCents(...salesAll.filter((i) => i.status === "overdue").map((i) => i.amountTtc));
  const payables = sumCents(
    ...invoices
      .filter((i) => i.type === "purchase" && !isVatOnly(i.status) && i.status !== "paid" && i.status !== "draft")
      .map((i) => i.amountTtc),
  );
  const paidSales = salesAll.filter((i) => i.status === "paid" && i.paymentDate && inPeriod(i.paymentDate, period));
  const dsoDays = paidSales.map((i) => Math.max(0, Math.round((Date.parse(i.paymentDate!) - Date.parse(i.issueDate)) / 86_400_000)));
  const dso = dsoDays.length ? Math.round(dsoDays.reduce((a, b) => a + b, 0) / dsoDays.length) : 0;
  const expense_ratio = revenue_invoiced > 0 ? Math.round((charges * 10000) / revenue_invoiced) : 0;

  return {
    revenue_invoiced,
    revenue_collected,
    result,
    charges,
    margin_rate,
    collection_rate,
    expense_ratio,
    receivables,
    payables,
    overdue_amount,
    dso,
    quotes_won_amount,
    quotes_won_count,
    quotes_created_count,
    win_rate,
    invoices_sales_count,
    avg_invoice,
    new_clients_count,
    contracts_signed_count,
    recurring_monthly,
    recurring_yearly,
    funding_amount,
  };
}
