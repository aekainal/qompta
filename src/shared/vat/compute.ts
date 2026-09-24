/**
 * Computation of the Swiss VAT return from the bases aggregated by code.
 * Logic faithful to the FTA form — see docs/VAT-LOGIC.md.
 *
 * PURE function: no Electron/DB dependency. Fully testable.
 */

import { roundHalfUp, sumCents, vatFromNet, type Bps, type Cents } from "../money.js";

/** Entered/aggregated bases (« Prestations CHF » column), in cents. */
export interface VatReturnInput {
  // I. Considerations
  b200: Cents;
  b205: Cents;
  // II. Deductions
  b220: Cents;
  b221: Cents;
  b225: Cents;
  b230: Cents;
  b235: Cents;
  b280: Cents;
  // Taxable bases by rate
  b303: Cents;
  b313: Cents;
  b343: Cents;
  /** Acquisition tax (net tax amount, already computed excluding VAT). */
  tax383: Cents;
  // Input tax (tax amounts, in cents)
  t400: Cents;
  t405: Cents;
  t410: Cents;
  t415: Cents;
  t420: Cents;
  // III. Other cash flows (informative)
  b900: Cents;
  b910: Cents;
  // Rates applicable to the period (bps)
  rateNormalBps: Bps;
  rateReducedBps: Bps;
  rateLodgingBps: Bps;
}

export interface VatReturnResult {
  // Bases
  b200: Cents;
  b205: Cents;
  b220: Cents;
  b221: Cents;
  b225: Cents;
  b230: Cents;
  b235: Cents;
  b280: Cents;
  b289: Cents;
  b299: Cents;
  b303: Cents;
  b313: Cents;
  b343: Cents;
  b379: Cents;
  // Taxes
  tax303: Cents;
  tax313: Cents;
  tax343: Cents;
  tax383: Cents;
  b399: Cents;
  // Input tax
  t400: Cents;
  t405: Cents;
  t410: Cents;
  t415: Cents;
  t420: Cents;
  b479: Cents;
  // Balance
  b500: Cents;
  b510: Cents;
  // Others
  b900: Cents;
  b910: Cents;
  /** true if 379 ≠ 299 (inconsistency to report, non-blocking). */
  coherenceWarning: boolean;
}

/** Default values (0), so only the useful fields need filling in tests/usages. */
export function emptyVatInput(rates: { normal: Bps; reduced: Bps; lodging: Bps }): VatReturnInput {
  return {
    b200: 0, b205: 0,
    b220: 0, b221: 0, b225: 0, b230: 0, b235: 0, b280: 0,
    b303: 0, b313: 0, b343: 0, tax383: 0,
    t400: 0, t405: 0, t410: 0, t415: 0, t420: 0,
    b900: 0, b910: 0,
    rateNormalBps: rates.normal,
    rateReducedBps: rates.reduced,
    rateLodgingBps: rates.lodging,
  };
}

/**
 * Computes the whole VAT return (effective method).
 */
export function computeVatReturn(input: VatReturnInput): VatReturnResult {
  const b289 = sumCents(input.b220, input.b221, input.b225, input.b230, input.b235, input.b280);
  const b299 = input.b200 - b289;

  const b379 = sumCents(input.b303, input.b313, input.b343);

  const tax303 = vatFromNet(input.b303, input.rateNormalBps);
  const tax313 = vatFromNet(input.b313, input.rateReducedBps);
  const tax343 = vatFromNet(input.b343, input.rateLodgingBps);
  const b399 = sumCents(tax303, tax313, tax343, input.tax383);

  const b479 = input.t400 + input.t405 + input.t410 - input.t415 - input.t420;

  const solde = b399 - b479;
  const b500 = solde > 0 ? solde : 0;
  const b510 = solde <= 0 ? -solde : 0;

  return {
    b200: input.b200,
    b205: input.b205,
    b220: input.b220,
    b221: input.b221,
    b225: input.b225,
    b230: input.b230,
    b235: input.b235,
    b280: input.b280,
    b289,
    b299,
    b303: input.b303,
    b313: input.b313,
    b343: input.b343,
    b379,
    tax303,
    tax313,
    tax343,
    tax383: input.tax383,
    b399,
    t400: input.t400,
    t405: input.t405,
    t410: input.t410,
    t415: input.t415,
    t420: input.t420,
    b479,
    b500,
    b510,
    b900: input.b900,
    b910: input.b910,
    coherenceWarning: b379 !== b299,
  };
}

/**
 * VAT return computed with the net tax debt rate method (TDFN).
 * Tax due = sum(gross turnover per sector × flat rate), without input tax.
 * @param sectors list of { grossTtc, rateBps } (FTA flat rate in bps)
 */
export function computeTdfnReturn(sectors: { grossTtcCents: Cents; rateBps: Bps }[]): {
  totalGross: Cents;
  taxDue: Cents;
} {
  const totalGross = sumCents(...sectors.map((s) => s.grossTtcCents));
  const taxDue = sumCents(
    ...sectors.map((s) => roundHalfUp((s.grossTtcCents * s.rateBps) / 10000)),
  );
  return { totalGross, taxDue };
}
