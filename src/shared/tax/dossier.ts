/**
 * Assembly of the year-end tax file, adapted to the legal form.
 * "Preparation / help with the tax return" mode: we produce the tax bases and
 * summaries to report, NOT the final cantonal/federal tax amount.
 *
 * Pure and testable.
 */

import type { Cents } from "../money.js";
import type { LegalForm } from "../legal-form.js";
import { rulesFor } from "../legal-form.js";
import { allocateResult, type Associate, type AssociateShare } from "./allocation.js";
import { computeCorporateTax, type CorporateTaxResult } from "./company-tax.js";
import type { IncomeStatement } from "./result.js";

/** Yearly VAT summary. */
export interface VatRecap {
  subject: boolean;
  collected: Cents; // VAT collected (sales)
  inputTax: Cents; // input tax (purchases)
  netDue: Cents; // net amount due for the year (> 0 payable, < 0 credit)
  otherFunds900: Cents;
  otherFunds910: Cents;
}

/** Investment reference (code 405). */
export interface InvestmentRef {
  id: string;
  number: string | null;
  date: string;
  label: string;
  amountChf: Cents;
  vatChf: Cents;
}

export interface CorporateDossier extends CorporateTaxResult {
  shareCapital: Cents;
  reserves: Cents;
  retainedEarnings: Cents;
  dividends: Cents;
}

export interface TaxDossierInput {
  companyName: string;
  form: LegalForm;
  year: number;
  incomeStatement: IncomeStatement;
  vat: VatRecap;
  investments: InvestmentRef[];
  /** Shareholders (simple partnership / general partnership). */
  associates?: Associate[];
  /** Equity data (Sàrl/SA). */
  equity?: {
    shareCapital: Cents;
    reserves: Cents;
    retainedEarnings: Cents;
    nonDeductibleCharges: Cents;
    managerSalary: Cents;
    dividends: Cents;
  };
}

export interface TaxDossier {
  companyName: string;
  form: LegalForm;
  year: number;
  incomeStatement: IncomeStatement;
  vat: VatRecap;
  investments: InvestmentRef[];
  /** Tax module depending on the legal form. */
  taxModule: "independent_income" | "partner_allocation" | "corporate" | "association";
  /** Sole proprietorship: result = income from self-employment. */
  independentIncome?: Cents;
  /** Association: taxable profit (no share capital). */
  associationProfit?: Cents;
  /** Simple partnership / general partnership: result split per shareholder. */
  allocation?: AssociateShare[];
  /** Warning if the shares do not add up to 100 %. */
  allocationWarning?: string;
  /** Sàrl/SA: taxable profit + equity capital. */
  corporate?: CorporateDossier;
}

export function buildTaxDossier(input: TaxDossierInput): TaxDossier {
  const rules = rulesFor(input.form);
  const result = input.incomeStatement.result;

  const base: TaxDossier = {
    companyName: input.companyName,
    form: input.form,
    year: input.year,
    incomeStatement: input.incomeStatement,
    vat: input.vat,
    investments: input.investments,
    taxModule: rules.taxModule,
  };

  if (rules.taxModule === "independent_income") {
    return { ...base, independentIncome: result };
  }

  if (rules.taxModule === "association") {
    // Association: taxable profit = result of the financial year, no capital part.
    return { ...base, associationProfit: result };
  }

  if (rules.taxModule === "partner_allocation") {
    const associates = input.associates ?? [];
    const totalBps = associates.reduce((acc, a) => acc + a.shareBps, 0);
    if (associates.length === 0) {
      return { ...base, allocation: [], allocationWarning: "Aucun associé défini." };
    }
    if (totalBps !== 10000) {
      return {
        ...base,
        allocation: [],
        allocationWarning: `La somme des parts vaut ${(totalBps / 100).toFixed(2)} % au lieu de 100 %.`,
      };
    }
    return { ...base, allocation: allocateResult(result, associates) };
  }

  // corporate (Sàrl/SA/association)
  const eq = input.equity ?? {
    shareCapital: 0,
    reserves: 0,
    retainedEarnings: 0,
    nonDeductibleCharges: 0,
    managerSalary: 0,
    dividends: 0,
  };
  const corp = computeCorporateTax({
    accountingResult: result,
    managerSalary: eq.managerSalary,
    nonDeductibleCharges: eq.nonDeductibleCharges,
    shareCapital: eq.shareCapital,
    reserves: eq.reserves,
    retainedEarnings: eq.retainedEarnings,
    proposedDividend: eq.dividends,
  });
  return {
    ...base,
    corporate: {
      ...corp,
      shareCapital: eq.shareCapital,
      reserves: eq.reserves,
      retainedEarnings: eq.retainedEarnings,
      dividends: eq.dividends,
    },
  };
}
