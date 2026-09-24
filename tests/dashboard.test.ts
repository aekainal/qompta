import { describe, expect, it } from "vitest";
import { buildCompanyDashboard, type DashInvoice } from "../src/shared/dashboard.js";

function inv(p: Partial<DashInvoice>): DashInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    type: "sale",
    number: null,
    issueDate: "2026-02-01",
    dueDate: null,
    paymentDate: null,
    status: "issued",
    amountChf: 100000,
    amountTtc: 108100,
    categoryId: null,
    thirdPartyName: null,
    ...p,
  };
}

describe("buildCompanyDashboard", () => {
  it("calcule CA facturé/encaissé, charges et résultat de l'année", () => {
    const d = buildCompanyDashboard(
      [
        inv({ type: "sale", amountChf: 100000, status: "paid" }),
        inv({ type: "sale", amountChf: 50000, status: "issued" }),
        inv({ type: "purchase", amountChf: 30000 }),
        // outside the year: ignored
        inv({ type: "sale", amountChf: 999999, issueDate: "2025-02-01" }),
      ],
      {},
      2026,
    );
    expect(d.totalProductsInvoiced).toBe(150000);
    expect(d.totalProductsCollected).toBe(100000);
    expect(d.totalCharges).toBe(30000);
    expect(d.result).toBe(120000);
  });

  it("« Réglé (pour TVA) » ne compte ni en charges ni au résultat", () => {
    const d = buildCompanyDashboard(
      [
        inv({ type: "sale", amountChf: 100000, status: "paid" }),
        inv({ type: "purchase", amountChf: 30000, status: "paid" }),
        // Paid by a third party, recorded for the VAT return alone: out of the result.
        inv({ type: "purchase", amountChf: 40000, status: "settled_vat", issueDate: "2026-03-01" }),
      ],
      {},
      2026,
    );
    expect(d.totalCharges).toBe(30000); // not 70000
    expect(d.result).toBe(70000); // 100000 − 30000, the settled_vat digs no loss
    expect(d.monthly[2].expenses).toBe(0); // March: the settled_vat does not show up
  });

  it("expose 12 séries mensuelles de métriques (pour les graphes personnalisés)", () => {
    const d = buildCompanyDashboard(
      [inv({ type: "sale", amountChf: 100000, status: "paid", issueDate: "2026-03-15" })],
      {},
      2026,
    );
    expect(d.monthlyMetrics).toHaveLength(12);
    expect(d.monthlyMetrics[2].values.revenue_invoiced).toBe(100000); // March
    expect(d.monthlyMetrics[0].values.revenue_invoiced).toBe(0); // January
  });

  it("série mensuelle ventile produits/charges par mois", () => {
    const d = buildCompanyDashboard(
      [
        inv({ type: "sale", amountChf: 10000, issueDate: "2026-01-15" }),
        inv({ type: "sale", amountChf: 20000, issueDate: "2026-03-10" }),
        inv({ type: "purchase", amountChf: 5000, issueDate: "2026-03-20" }),
      ],
      {},
      2026,
    );
    expect(d.monthly).toHaveLength(12);
    expect(d.monthly[0].products).toBe(10000); // January
    expect(d.monthly[2].products).toBe(20000); // March
    expect(d.monthly[2].expenses).toBe(5000);
  });

  it("regroupe par catégorie avec libellés et trie décroissant", () => {
    const d = buildCompanyDashboard(
      [
        inv({ type: "purchase", amountChf: 5000, categoryId: "a" }),
        inv({ type: "purchase", amountChf: 20000, categoryId: "b" }),
        inv({ type: "purchase", amountChf: 3000, categoryId: null }),
      ],
      { a: "Loyer", b: "Salaires" },
      2026,
    );
    expect(d.expensesByCategory[0].label).toBe("Salaires");
    expect(d.expensesByCategory[0].amount).toBe(20000);
    expect(d.expensesByCategory.at(-1)?.label).toBe("Sans catégorie");
  });

  it("liste les factures impayées et en retard", () => {
    const d = buildCompanyDashboard(
      [
        inv({ type: "sale", status: "issued" }),
        inv({ type: "sale", status: "paid" }),
        inv({ type: "sale", status: "overdue" }),
      ],
      {},
      2026,
    );
    expect(d.unpaid).toHaveLength(2); // issued + overdue
    expect(d.overdue).toHaveLength(1);
  });
});
