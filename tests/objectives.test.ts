/**
 * Management metrics (per period) and target progress — pure logic.
 * Amounts in cents, rates in basis points.
 */

import { describe, expect, it } from "vitest";
import { computeMetricValues, type MetricData } from "../src/shared/metrics.js";
import {
  computeObjectiveProgress,
  metricDef,
  objectiveRatioLabel,
  targetFromInput,
  type Objective,
} from "../src/shared/objectives.js";
import type { DashInvoice, DashQuote } from "../src/shared/dashboard.js";
import type { FundContribution } from "../src/shared/funding.js";

function sale(o: Partial<DashInvoice> & { issueDate: string; amountChf: number }): DashInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    type: "sale",
    number: null,
    dueDate: null,
    paymentDate: null,
    status: "issued",
    amountTtc: Math.round(o.amountChf * 1.081),
    categoryId: null,
    thirdPartyId: null,
    thirdPartyName: null,
    ...o,
  };
}

const DATA: MetricData = {
  invoices: [
    sale({ thirdPartyId: "c1", issueDate: "2025-11-01", amountChf: 30000, status: "paid", paymentDate: "2025-11-05" }),
    sale({ thirdPartyId: "c1", issueDate: "2026-02-10", amountChf: 100000, status: "paid", paymentDate: "2026-03-01" }),
    sale({ thirdPartyId: "c2", issueDate: "2026-05-20", amountChf: 50000, status: "issued", dueDate: "2026-06-20" }),
    { ...sale({ issueDate: "2026-04-01", amountChf: 40000, status: "paid", paymentDate: "2026-04-05" }), type: "purchase" },
  ],
  quotes: [
    { id: "q1", issueDate: "2026-01-15", status: "invoiced", amountHt: 80000, supersededByQuoteId: null },
    { id: "q2", issueDate: "2026-02-01", status: "refused", amountHt: 20000, supersededByQuoteId: null },
    { id: "q3", issueDate: "2026-03-01", status: "sent", amountHt: 10000, supersededByQuoteId: null },
  ] as DashQuote[],
  contracts: [
    { status: "signed", signedDate: "2026-02-01", monthlyAmountHt: 5000, oneOffAmountHt: 30000 },
    { status: "draft", signedDate: null, monthlyAmountHt: 9999, oneOffAmountHt: 0 },
  ],
  funding: [
    { kind: "capital", amount: 200000, date: "2026-01-01", associateName: "A", associateId: null,
      id: "f1", companyId: "x", method: "bank", bankAccountId: null, reference: null, notes: null, createdAt: "" },
  ] as FundContribution[],
};

describe("métriques — période annuelle", () => {
  const m = computeMetricValues({ type: "year", year: 2026 }, DATA);

  it("agrège le chiffre d'affaires, les charges et le résultat de l'année", () => {
    expect(m.revenue_invoiced).toBe(150000); // 100000 + 50000 (the 2025 sale is excluded)
    expect(m.revenue_collected).toBe(100000); // only the sale paid in 2026
    expect(m.charges).toBe(40000);
    expect(m.result).toBe(110000);
    expect(m.margin_rate).toBe(7333); // 110000/150000
    expect(m.collection_rate).toBe(6667);
  });

  it("compte les devis et le taux de transformation en montant", () => {
    expect(m.quotes_created_count).toBe(3);
    expect(m.quotes_won_amount).toBe(80000);
    expect(m.quotes_won_count).toBe(1);
    expect(m.win_rate).toBe(8000); // 80000 / (80000 + 20000)
  });

  it("compte ventes, panier moyen et nouveaux clients", () => {
    expect(m.invoices_sales_count).toBe(2);
    expect(m.avg_invoice).toBe(75000);
    // c1 was already invoiced in 2025: only c2 is new in 2026.
    expect(m.new_clients_count).toBe(1);
  });

  it("mesure les contrats, le récurrent et les apports", () => {
    expect(m.contracts_signed_count).toBe(1);
    expect(m.recurring_monthly).toBe(5000); // signed contract only
    expect(m.recurring_yearly).toBe(60000);
    expect(m.funding_amount).toBe(200000);
  });

  it("mesure créances, retard, dettes, DSO et taux de charges", () => {
    expect(m.receivables).toBe(54050); // only uncollected sale (gross of 50000 net)
    expect(m.overdue_amount).toBe(0); // no sale in « overdue » status
    expect(m.payables).toBe(0); // the single purchase is paid
    expect(m.dso).toBe(19); // sale issued on 10.02, paid on 01.03
    expect(m.expense_ratio).toBe(2667); // 40000 / 150000
  });
});

describe("métriques — trimestre et mois", () => {
  it("ne retient que les ventes du trimestre", () => {
    const q1 = computeMetricValues({ type: "quarter", year: 2026, quarter: 1 }, DATA);
    expect(q1.revenue_invoiced).toBe(100000); // February only, May falls in Q2
  });

  it("ne retient que les ventes du mois", () => {
    const may = computeMetricValues({ type: "month", year: 2026, month: 5 }, DATA);
    expect(may.revenue_invoiced).toBe(50000);
  });
});

describe("progression des objectifs", () => {
  const base: Omit<Objective, "metric" | "targetValue" | "direction"> = {
    id: "o", companyId: "x", periodType: "year", periodYear: 2026,
    periodQuarter: null, periodMonth: null, label: null, createdAt: "",
  };

  it("plancher atteint et non atteint", () => {
    const met = computeObjectiveProgress({ ...base, metric: "revenue_invoiced", direction: "at_least", targetValue: 100000 }, 150000);
    expect(met.met).toBe(true);
    expect(met.ratioBps).toBe(15000);

    const missed = computeObjectiveProgress({ ...base, metric: "revenue_invoiced", direction: "at_least", targetValue: 200000 }, 150000);
    expect(missed.met).toBe(false);
    expect(missed.ratioBps).toBe(7500);
  });

  it("plafond respecté et dépassé", () => {
    const ok = computeObjectiveProgress({ ...base, metric: "charges", direction: "at_most", targetValue: 50000 }, 40000);
    expect(ok.met).toBe(true);
    expect(ok.ratioBps).toBe(8000);

    const over = computeObjectiveProgress({ ...base, metric: "charges", direction: "at_most", targetValue: 30000 }, 40000);
    expect(over.met).toBe(false);
    expect(over.ratioBps).toBe(13333);
  });

  it("n'affiche un pourcentage que s'il veut dire quelque chose", () => {
    // Normal case: halfway there.
    expect(objectiveRatioLabel({ actual: 5000, target: 10000, ratioBps: 5000 })).toBe("50 %");
    // Seen on screen: −971.35 CHF against a 1 CHF target showed « −97 135 % ».
    expect(objectiveRatioLabel({ actual: -97135, target: 100, ratioBps: -9713500 })).toBeNull();
    // Zero target: the division makes no sense.
    expect(objectiveRatioLabel({ actual: 5000, target: 0, ratioBps: 10000 })).toBeNull();
    // Far beyond: a five-digit number teaches nothing, a sentence does.
    expect(objectiveRatioLabel({ actual: 500000, target: 100, ratioBps: 5000000 })).toBe("cible largement dépassée");
  });

  it("convertit une saisie humaine selon l'unité", () => {
    expect(targetFromInput("money", 50000)).toBe(5000000); // 50 000 CHF -> cents
    expect(targetFromInput("rate", 80)).toBe(8000); // 80 % -> basis points
    expect(targetFromInput("count", 10)).toBe(10);
    expect(metricDef("charges").defaultDirection).toBe("at_most");
  });
});
