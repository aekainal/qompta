/**
 * Swiss VAT rates, historised by date.
 * Values are in basis points (bps): 8.10 % = 810.
 */

import type { Bps } from "../money.js";

export type RateType = "normal" | "reduced" | "lodging";

export interface VatRatePeriod {
  rateType: RateType;
  valueBps: Bps;
  /** ISO date the rate starts being valid (inclusive). */
  validFrom: string;
  /** ISO date the rate stops being valid (inclusive), or null if in force. */
  validTo: string | null;
}

/**
 * Default rates (FTA). From 1 January 2024 the Swiss rates are:
 * standard 8.10 %, reduced 2.60 %, lodging 3.80 %. Valid in 2026.
 * Earlier rates (until 31.12.2023: 7.7 / 2.5 / 3.7) are kept so that older
 * periods keep their values.
 */
export const DEFAULT_VAT_RATES: VatRatePeriod[] = [
  { rateType: "normal", valueBps: 770, validFrom: "2018-01-01", validTo: "2023-12-31" },
  { rateType: "reduced", valueBps: 250, validFrom: "2018-01-01", validTo: "2023-12-31" },
  { rateType: "lodging", valueBps: 370, validFrom: "2018-01-01", validTo: "2023-12-31" },
  { rateType: "normal", valueBps: 810, validFrom: "2024-01-01", validTo: null },
  { rateType: "reduced", valueBps: 260, validFrom: "2024-01-01", validTo: null },
  { rateType: "lodging", valueBps: 380, validFrom: "2024-01-01", validTo: null },
];

/**
 * Returns the rate in bps applicable on a given date for a rate type.
 * @param atDate ISO date (YYYY-MM-DD), typically the invoice or period date.
 */
export function resolveRate(
  rateType: RateType,
  atDate: string,
  rates: VatRatePeriod[] = DEFAULT_VAT_RATES,
): Bps {
  const match = rates.find(
    (r) =>
      r.rateType === rateType &&
      r.validFrom <= atDate &&
      (r.validTo === null || r.validTo >= atDate),
  );
  if (!match) {
    throw new Error(`Aucun taux ${rateType} défini pour la date ${atDate}`);
  }
  return match.valueBps;
}
