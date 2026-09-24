/**
 * Business logic of an invoice (pure, testable): rate resolution at the date,
 * net/VAT/gross calculation, CHF conversion and default VAT return code.
 */

import { resolveAmounts, toChf, type Cents } from "./money.js";
import { resolveRate, type RateType as VatRateType } from "./vat/rates.js";
import { resolveVatCode, type InvoiceType, type RateType, type VatTreatment } from "./vat/mapping.js";
import type { VatCode } from "./vat/codes.js";

export type { InvoiceType, VatTreatment };

/** Raw invoice entry from the UI (amount already in cents). */
export interface InvoiceComputationInput {
  type: InvoiceType;
  treatment: VatTreatment;
  /** Rate type: for non-taxed services (export, foreign…), "zero". */
  rate: RateType;
  /** Amount entered in cents (in the currency entered). */
  enteredAmount: Cents;
  enteredAs: "ht" | "ttc";
  /** Date of the invoice (resolves the applicable rate). */
  issueDate: string;
  /** Currency; "CHF" by default. */
  currency?: string;
  /** Conversion rate ×10000 if currency ≠ CHF (CHF per currency unit). */
  fxRate?: number | null;
  /**
   * Actual VAT amount (in cents, currency entered) written on the invoice.
   * If supplied, it overrides the automatic calculation (supplier rounding,
   * old rates, per-line VAT…). null/undefined = auto calculation from the rate.
   */
  vatAmountOverride?: number | null;
}

export interface ComputedInvoice {
  rateBps: number;
  amountHt: Cents;
  vatAmount: Cents;
  amountTtc: Cents;
  /** Net amount converted into CHF (basis used for the VAT return). */
  amountChf: Cents;
  /** VAT amount converted into CHF (actual input tax for the VAT return). */
  vatChf: Cents;
  vatCode: VatCode;
}

/** Converts a RateType (mapping) into a resolved VAT rate type, or null if "zero". */
function toVatRateType(rate: RateType): VatRateType | null {
  if (rate === "normal") return "normal";
  if (rate === "reduced") return "reduced";
  if (rate === "lodging") return "lodging";
  return null;
}

/**
 * Computes every derived field of an invoice from the entry.
 * The rate is resolved at the invoice date (rates are historised).
 */
export function computeInvoice(
  input: InvoiceComputationInput,
  ratesAt?: { normal: number; reduced: number; lodging: number },
): ComputedInvoice {
  const vatRateType = toVatRateType(input.rate);

  // Rate resolution in bps (0 for non-taxed services).
  let rateBps = 0;
  if (vatRateType) {
    rateBps = ratesAt
      ? ratesAt[vatRateType]
      : resolveRate(vatRateType, input.issueDate);
  }

  let { ht, vat, ttc } = resolveAmounts(input.enteredAmount, input.enteredAs, rateBps);

  // Actual VAT entered: it overrides the auto calculation, net/gross are rebuilt to match.
  if (input.vatAmountOverride != null) {
    vat = input.vatAmountOverride;
    if (input.enteredAs === "ht") {
      ht = input.enteredAmount;
      ttc = ht + vat;
    } else {
      ttc = input.enteredAmount;
      ht = ttc - vat;
    }
  }

  const isChf = !input.currency || input.currency === "CHF";
  const amountChf = isChf || !input.fxRate ? ht : toChf(ht, input.fxRate);
  const vatChf = isChf || !input.fxRate ? vat : toChf(vat, input.fxRate);

  const vatCode = resolveVatCode(input.type, input.treatment, input.rate);

  return { rateBps, amountHt: ht, vatAmount: vat, amountTtc: ttc, amountChf, vatChf, vatCode };
}

/** Determines the "overdue" status of an invoice at a reference date. */
export function isOverdue(
  status: string,
  dueDate: string | null,
  today: string,
): boolean {
  if (!dueDate) return false;
  if (status === "paid" || status === "settled_vat") return false;
  return dueDate < today;
}

/**
 * "Réglé (pour TVA)" invoice: paid by a third party, recorded in the company for
 * the VAT return alone (to recover the input tax). It **enters the VAT return**
 * (see `selectPeriodInvoices`) but must **NEVER** count in the cash position nor in
 * the result (income/expenses): otherwise it would dig a fictitious loss.
 */
export function isVatOnly(status: string): boolean {
  return status === "settled_vat";
}
