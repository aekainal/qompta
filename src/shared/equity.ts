/**
 * Equity entered for a Sàrl/SA — feeds the "profit + capital" tax file.
 * Amounts in cents.
 */

export interface CompanyEquity {
  shareCapital: number;
  reserves: number;
  retainedEarnings: number;
  nonDeductibleCharges: number;
  managerSalary: number;
  dividends: number;
}

export const EMPTY_EQUITY: CompanyEquity = {
  shareCapital: 0,
  reserves: 0,
  retainedEarnings: 0,
  nonDeductibleCharges: 0,
  managerSalary: 0,
  dividends: 0,
};
