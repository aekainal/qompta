/**
 * Monetary arithmetic in cents (integers).
 *
 * Absolute rule of the project: no monetary value is ever stored or computed as
 * a floating-point number. Everything is in cents (CHF 12.35 -> 1235).
 * VAT rates are expressed in basis points (bps): 8.10 % -> 810.
 */

/** An amount in cents (integer). Semantic alias for readability. */
export type Cents = number;

/** A rate in basis points: 8.10 % = 810, 2.60 % = 260, 0 % = 0. */
export type Bps = number;

/** Commercial rounding (half up) to the nearest integer. */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

/**
 * Converts an amount expressed in CHF (string or number) into integer cents.
 * Accepts "1'234.55", "1234.55", "1234,55".
 */
export function chfToCents(input: string | number): Cents {
  if (typeof input === "number") {
    return roundHalfUp(input * 100);
  }
  const normalized = input
    .replace(/['’\s]/g, "")
    .replace(",", ".")
    .trim();
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Montant invalide : "${input}"`);
  }
  return roundHalfUp(value * 100);
}

/** Converts cents into CHF (number, 2 decimals). */
export function centsToChf(cents: Cents): number {
  return roundHalfUp(cents) / 100;
}

/**
 * Formats cents following the Swiss convention: 1234567 -> "12’345.67".
 *
 * The formatting is explicit rather than delegated to `Intl`: depending on the
 * embedded ICU version, `fr-CH` produces a decimal comma, which is wrong here
 * (a Swiss amount is written with a dot) and made the display inconsistent
 * from one machine to another.
 */
export function formatChf(cents: Cents, withSymbol = false): string {
  const rounded = roundHalfUp(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const units = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  const formatted = `${sign}${units}.${String(abs % 100).padStart(2, "0")}`;
  return withSymbol ? `CHF ${formatted}` : formatted;
}

/** Sum of several amounts in cents. */
export function sumCents(...amounts: Cents[]): Cents {
  return amounts.reduce((acc, v) => acc + v, 0);
}

/**
 * Computes the VAT (in cents) from a net amount and a rate in bps.
 * vat = round(net * bps / 10000). Commercial rounding to the cent.
 */
export function vatFromNet(netCents: Cents, rateBps: Bps): Cents {
  return roundHalfUp((netCents * rateBps) / 10000);
}

/**
 * Splits a gross amount into {net, vat} for a given rate.
 * net = round(gross * 10000 / (10000 + bps)); vat = gross - net.
 * The VAT is derived by difference to guarantee net + vat === gross exactly.
 */
export function splitGross(grossCents: Cents, rateBps: Bps): { net: Cents; vat: Cents } {
  if (rateBps === 0) {
    return { net: grossCents, vat: 0 };
  }
  const net = roundHalfUp((grossCents * 10000) / (10000 + rateBps));
  return { net, vat: grossCents - net };
}

/**
 * From an entered amount (net or gross) and a rate, returns the consistent
 * triple { ht, vat, ttc }: single entry point for computing an invoice line.
 */
export function resolveAmounts(
  enteredCents: Cents,
  enteredAs: "ht" | "ttc",
  rateBps: Bps,
): { ht: Cents; vat: Cents; ttc: Cents } {
  if (enteredAs === "ht") {
    const vat = vatFromNet(enteredCents, rateBps);
    return { ht: enteredCents, vat, ttc: enteredCents + vat };
  }
  const { net, vat } = splitGross(enteredCents, rateBps);
  return { ht: net, vat, ttc: enteredCents };
}

/**
 * Converts an amount in a foreign currency into CHF.
 * @param amountCents amount in cents of the source currency
 * @param fxRate conversion rate ×10000 (e.g. 0.95 -> 9500), CHF per currency unit
 */
export function toChf(amountCents: Cents, fxRate: number): Cents {
  return roundHalfUp((amountCents * fxRate) / 10000);
}
