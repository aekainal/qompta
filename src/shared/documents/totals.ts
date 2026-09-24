/**
 * Totals of a commercial document (quote or invoice), in cents.
 *
 * PURE functions, with no Electron/DB dependency. Unit prices are entered net
 * (as on Qwasar quotes); the display shows the gross total per line.
 *
 * Quantities are stored in thousandths (`qtyMilli`) to allow fractions
 * (1.5 h = 1500) without ever handling a monetary float.
 */

import { type Bps, type Cents, vatFromNet } from "../money.js";

/**
 * Nature of a line:
 *  - `section` : opens a new table; `label` acts as an introduction note;
 *  - `item`    : billable service line (quantity × net unit price);
 *  - `detail`  : service line included, printed with a dash, with no amount.
 */
export type DocumentLineKind = "section" | "item" | "detail";

export interface DocumentLine {
  kind: DocumentLineKind;
  /** Label shown in the « Description » column. */
  label: string;
  /** Quantity ×1000 (1 = 1000). Ignored outside `item` lines. */
  qtyMilli: number;
  /** Net unit price in cents. Ignored outside `item` lines. */
  unitPriceHt: Cents;
  /** VAT rate of the line, in basis points (8.10 % = 810). */
  vatRateBps: Bps;
}

/** Only `item` lines carry an amount. */
export function isBillable(line: DocumentLine): boolean {
  return line.kind === "item";
}

export interface LineTotals {
  /** Net amount of the line (quantity × unit price). */
  ht: Cents;
  vat: Cents;
  ttc: Cents;
}

export interface DocumentTotals extends LineTotals {
  /** VAT breakdown by rate, sorted by ascending rate. */
  byRate: { vatRateBps: Bps; ht: Cents; vat: Cents; ttc: Cents }[];
}

/**
 * Net amount of a line = quantity × unit price, rounded to the cent.
 * `detail` lines carry no amount.
 */
export function lineHt(line: DocumentLine): Cents {
  if (!isBillable(line)) return 0;
  return Math.round((line.qtyMilli * line.unitPriceHt) / 1000);
}

/** Net/VAT/gross totals of a line. */
export function lineTotals(line: DocumentLine): LineTotals {
  const ht = lineHt(line);
  const vat = vatFromNet(ht, line.vatRateBps);
  return { ht, vat, ttc: ht + vat };
}

/**
 * Document totals, with a breakdown by VAT rate.
 *
 * VAT is computed per line then summed (not on the net total): that is the
 * method matching the amounts printed line by line on the document.
 */
export function documentTotals(lines: DocumentLine[]): DocumentTotals {
  const groups = new Map<Bps, { ht: Cents; vat: Cents; ttc: Cents }>();
  let ht = 0;
  let vat = 0;

  for (const line of lines) {
    if (!isBillable(line)) continue;
    const t = lineTotals(line);
    ht += t.ht;
    vat += t.vat;
    const g = groups.get(line.vatRateBps) ?? { ht: 0, vat: 0, ttc: 0 };
    g.ht += t.ht;
    g.vat += t.vat;
    g.ttc += t.ttc;
    groups.set(line.vatRateBps, g);
  }

  const byRate = [...groups.entries()]
    .map(([vatRateBps, g]) => ({ vatRateBps, ...g }))
    .sort((a, b) => a.vatRateBps - b.vatRateBps);

  return { ht, vat, ttc: ht + vat, byRate };
}

/** Distinct VAT rates present in the document (sorted). */
export function ratesUsed(lines: DocumentLine[]): Bps[] {
  return documentTotals(lines).byRate.map((g) => g.vatRateBps);
}
