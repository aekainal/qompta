import { describe, expect, it } from "vitest";
import { buildTaxDossier, type TaxDossierInput } from "../src/shared/tax/dossier.js";
import { buildIncomeStatement } from "../src/shared/tax/result.js";
import type { LegalForm } from "../src/shared/legal-form.js";

function baseInput(form: LegalForm, result: number): TaxDossierInput {
  const products = result + 50000;
  return {
    companyName: "Test",
    form,
    year: 2026,
    incomeStatement: buildIncomeStatement([
      { categoryId: "p", categoryLabel: "Ventes", kind: "product", amount: products },
      { categoryId: "c", categoryLabel: "Charges", kind: "expense", amount: 50000 },
    ]),
    vat: { subject: true, collected: 8100, inputTax: 1620, netDue: 6480, otherFunds900: 0, otherFunds910: 0 },
    investments: [],
  };
}

describe("buildTaxDossier : adaptation à la forme juridique", () => {
  it("raison individuelle : résultat = revenu indépendant", () => {
    const d = buildTaxDossier(baseInput("raison_individuelle", 100000));
    expect(d.taxModule).toBe("independent_income");
    expect(d.independentIncome).toBe(100000);
    expect(d.incomeStatement.result).toBe(100000);
  });

  it("société simple : répartition par associé selon les parts", () => {
    const input = { ...baseInput("societe_simple", 100000), associates: [
      { id: "a", name: "A", shareBps: 6000 },
      { id: "b", name: "B", shareBps: 4000 },
    ] };
    const d = buildTaxDossier(input);
    expect(d.taxModule).toBe("partner_allocation");
    expect(d.allocation).toHaveLength(2);
    expect(d.allocation![0].amount).toBe(60000);
    expect(d.allocation![1].amount).toBe(40000);
    expect(d.allocationWarning).toBeUndefined();
  });

  it("société simple : avertit si les parts ≠ 100 %", () => {
    const input = { ...baseInput("snc", 100000), associates: [
      { id: "a", name: "A", shareBps: 6000 },
      { id: "b", name: "B", shareBps: 3000 },
    ] };
    const d = buildTaxDossier(input);
    expect(d.allocation).toEqual([]);
    expect(d.allocationWarning).toContain("90.00 %");
  });

  it("association : bénéfice imposable seul (pas de capital)", () => {
    const d = buildTaxDossier(baseInput("association", 100000));
    expect(d.taxModule).toBe("association");
    expect(d.associationProfit).toBe(100000);
    expect(d.corporate).toBeUndefined();
  });

  it("Sàrl : bénéfice imposable et capital propre", () => {
    const input = { ...baseInput("sarl", 200000), equity: {
      shareCapital: 2000000, reserves: 500000, retainedEarnings: 300000,
      nonDeductibleCharges: 10000, managerSalary: 8000000, dividends: 150000,
    } };
    const d = buildTaxDossier(input);
    expect(d.taxModule).toBe("corporate");
    expect(d.corporate!.taxableProfit).toBe(210000); // 200000 + 10000
    expect(d.corporate!.equityCapital).toBe(2800000); // 2000000 + 500000 + 300000
    expect(d.corporate!.managerSalary).toBe(8000000);
    expect(d.corporate!.dividends).toBe(150000);
  });
});
