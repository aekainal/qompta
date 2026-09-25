/**
 * Cash reconciliation: the actual balance observed at a date (bank
 * reconciliation). It overrides the *computed* cash position: on that day, the
 * cash position equals that balance, and only LATER flows add to it. An earlier
 * entry added afterwards (backdated invoice, etc.) therefore no longer moves the
 * present cash position; it of course stays in the lists, the reports and the VAT
 * return. A reconciliation is neither income nor a VAT operation.
 */

import type { Cents } from "./money.js";

export interface CashReconciliation {
  id: string;
  companyId: string;
  date: string;
  /** Actual balance observed at that date, in cents. May be negative (overdraft). */
  balance: Cents;
  note: string | null;
  createdAt: string;
}

export interface CashReconciliationInput {
  date: string;
  balance: Cents;
  note?: string | null;
}

/**
 * The last reconciliation at a date <= `upTo` prevails (null if none). At equal
 * dates, the most recently entered one wins (`createdAt`).
 */
export function latestReconciliation(
  reconciliations: CashReconciliation[],
  upTo?: string,
): CashReconciliation | null {
  const eligible = reconciliations.filter((r) => !upTo || r.date <= upTo);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) =>
    r.date > best.date || (r.date === best.date && r.createdAt > best.createdAt) ? r : best,
  );
}
