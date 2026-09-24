/**
 * Tax computation for legal entities (Sàrl/SA): taxable profit and
 * equity capital, distinguishing the manager's salary from dividends.
 *
 * M5 scope (product decision): PREPARATION / help with the tax return.
 * We produce the tax bases (taxable profit, equity capital), NOT the final
 * cantonal/federal tax amount.
 *
 * Pure function.
 */

import { sumCents, type Cents } from "../money.js";

export interface CorporateTaxInput {
  /** Accounting result of the financial year (profit/loss before distributions). */
  accountingResult: Cents;
  /** Manager's salary already booked as an expense (deductible). Informative. */
  managerSalary: Cents;
  /** Non-deductible expenses to add back (e.g. fines). */
  nonDeductibleCharges: Cents;
  /** Paid-up share capital. */
  shareCapital: Cents;
  /** Reserves (statutory + voluntary). */
  reserves: Cents;
  /** Retained earnings (cumulated profit/loss). */
  retainedEarnings: Cents;
  /** Dividend proposed/distributed for the financial year. */
  proposedDividend: Cents;
}

export interface CorporateTaxResult {
  /** Taxable profit = accounting result + non-deductible expenses. */
  taxableProfit: Cents;
  /** Taxable equity capital = share capital + reserves + retained earnings. */
  equityCapital: Cents;
  managerSalary: Cents;
  proposedDividend: Cents;
}

/**
 * Computes the profit tax and capital tax base of a Sàrl/SA.
 */
export function computeCorporateTax(input: CorporateTaxInput): CorporateTaxResult {
  const taxableProfit = input.accountingResult + input.nonDeductibleCharges;
  const equityCapital = sumCents(input.shareCapital, input.reserves, input.retainedEarnings);
  return {
    taxableProfit,
    equityCapital,
    managerSalary: input.managerSalary,
    proposedDividend: input.proposedDividend,
  };
}
