import { describe, expect, it } from "vitest";
import { allocateResult, ShareSumError } from "../src/shared/tax/allocation.js";
import { computeCorporateTax } from "../src/shared/tax/company-tax.js";
import { buildIncomeStatement } from "../src/shared/tax/result.js";

describe("allocateResult — répartition par associé (société simple / SNC)", () => {
  it("répartit 60/40 exactement", () => {
    const shares = allocateResult(100000, [
      { id: "a", name: "A", shareBps: 6000 },
      { id: "b", name: "B", shareBps: 4000 },
    ]);
    expect(shares[0].amount).toBe(60000);
    expect(shares[1].amount).toBe(40000);
    expect(shares[0].amount + shares[1].amount).toBe(100000);
  });

  it("gère le reliquat d'arrondi (la somme reste exacte)", () => {
    // 3 shareholders at 1/3 of a non-divisible amount
    const shares = allocateResult(10000, [
      { id: "a", name: "A", shareBps: 3334 },
      { id: "b", name: "B", shareBps: 3333 },
      { id: "c", name: "C", shareBps: 3333 },
    ]);
    const total = shares.reduce((acc, s) => acc + s.amount, 0);
    expect(total).toBe(10000);
    // the remainder goes to the largest share (A)
    expect(shares[0].amount).toBeGreaterThanOrEqual(shares[1].amount);
  });

  it("répartit une perte (montant négatif)", () => {
    const shares = allocateResult(-9000, [
      { id: "a", name: "A", shareBps: 5000 },
      { id: "b", name: "B", shareBps: 5000 },
    ]);
    expect(shares[0].amount).toBe(-4500);
    expect(shares[1].amount).toBe(-4500);
  });

  it("rejette une somme de parts ≠ 100 %", () => {
    expect(() =>
      allocateResult(1000, [
        { id: "a", name: "A", shareBps: 5000 },
        { id: "b", name: "B", shareBps: 4000 },
      ]),
    ).toThrow(ShareSumError);
  });
});

describe("computeCorporateTax — Sàrl : bénéfice imposable + capital propre", () => {
  it("réintègre les charges non déductibles dans le bénéfice imposable", () => {
    const r = computeCorporateTax({
      accountingResult: 5000000,
      managerSalary: 8000000,
      nonDeductibleCharges: 200000,
      shareCapital: 2000000,
      reserves: 500000,
      retainedEarnings: 1000000,
      proposedDividend: 1500000,
    });
    expect(r.taxableProfit).toBe(5200000);
    expect(r.equityCapital).toBe(3500000);
    expect(r.managerSalary).toBe(8000000);
    expect(r.proposedDividend).toBe(1500000);
  });
});

describe("buildIncomeStatement — compte de résultat", () => {
  it("calcule produits, charges et résultat", () => {
    const stmt = buildIncomeStatement([
      { categoryId: "p1", categoryLabel: "Ventes", kind: "product", amount: 200000 },
      { categoryId: "p2", categoryLabel: "Autres produits", kind: "product", amount: 50000 },
      { categoryId: "c1", categoryLabel: "Loyer", kind: "expense", amount: 80000 },
      { categoryId: "c2", categoryLabel: "Salaires", kind: "expense", amount: 100000 },
    ]);
    expect(stmt.totalProducts).toBe(250000);
    expect(stmt.totalExpenses).toBe(180000);
    expect(stmt.result).toBe(70000);
    expect(stmt.productsByCategory).toHaveLength(2);
    expect(stmt.expensesByCategory).toHaveLength(2);
  });
});
