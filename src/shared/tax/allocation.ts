/**
 * Allocation of the result per shareholder (simple partnership / SNC).
 * Transparent taxation: each shareholder is taxed on their share of the result.
 *
 * Pure function. Shares are in basis points (bps): 60 % = 6000.
 * The sum of the shares MUST equal 10000. The allocation handles rounding to the
 * cent: the rounding remainder goes to the shareholder with the largest share
 * (on a tie, the first in order), so that the sum of the allocated shares
 * equals the result exactly.
 */

import { roundHalfUp, type Cents } from "../money.js";

export interface Associate {
  id: string;
  name: string;
  /** Share in basis points; the sum over all shareholders must equal 10000. */
  shareBps: number;
}

export interface AssociateShare {
  id: string;
  name: string;
  shareBps: number;
  amount: Cents;
}

export class ShareSumError extends Error {
  constructor(public actualBps: number) {
    super(`La somme des parts vaut ${actualBps} bps au lieu de 10000 (100 %).`);
    this.name = "ShareSumError";
  }
}

/**
 * Allocates a result (profit or loss) between the shareholders by their shares.
 * @param resultCents result to allocate (can be negative for a loss)
 */
export function allocateResult(resultCents: Cents, associates: Associate[]): AssociateShare[] {
  const totalBps = associates.reduce((acc, a) => acc + a.shareBps, 0);
  if (totalBps !== 10000) {
    throw new ShareSumError(totalBps);
  }

  // Initial allocation by controlled truncation through commercial rounding.
  const shares: AssociateShare[] = associates.map((a) => ({
    id: a.id,
    name: a.name,
    shareBps: a.shareBps,
    amount: roundHalfUp((resultCents * a.shareBps) / 10000),
  }));

  // Correcting the rounding remainder so that the sum is exact.
  const distributed = shares.reduce((acc, s) => acc + s.amount, 0);
  const remainder = resultCents - distributed;
  if (remainder !== 0 && shares.length > 0) {
    // Give the remainder to the largest share (the first one on a tie).
    let targetIdx = 0;
    for (let i = 1; i < shares.length; i++) {
      if (shares[i].shareBps > shares[targetIdx].shareBps) targetIdx = i;
    }
    shares[targetIdx].amount += remainder;
  }

  return shares;
}
