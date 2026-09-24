/**
 * Rules for mapping an invoice onto the VAT return codes.
 * See docs/VAT-LOGIC.md §3.
 */

import type { VatCode } from "./codes.js";

export type InvoiceType = "sale" | "purchase";

/** VAT nature of an invoice, independent of the rate. */
export type VatTreatment =
  | "standard" // taxed sale (the rate decides 303/313/343)
  | "exempt_export" // export art. 23 -> 220
  | "foreign" // service supplied abroad -> 221
  | "excluded" // excluded art. 21 -> 230
  | "discount" // reduction / rebate -> 235
  | "input_material" // material/services purchase -> 400
  | "input_investment" // investment / operating expense -> 405
  | "subsidy" // subsidy -> 900
  | "donation"; // donation / dividend -> 910

export type RateType = "normal" | "reduced" | "lodging" | "zero";

/**
 * Determines the target return code of an invoice from its type, its VAT
 * treatment and the rate. Returns the main « tax/input tax » code.
 * (Feeding code 200 and the deductions is handled in aggregate.ts.)
 */
export function resolveVatCode(
  type: InvoiceType,
  treatment: VatTreatment,
  rate: RateType,
): VatCode {
  if (type === "sale") {
    switch (treatment) {
      case "exempt_export":
        return "220";
      case "foreign":
        return "221";
      case "excluded":
        return "230";
      case "discount":
        return "235";
      case "standard":
      default:
        if (rate === "reduced") return "313";
        if (rate === "lodging") return "343";
        return "303";
    }
  }
  // Purchases
  switch (treatment) {
    case "input_investment":
      return "405";
    case "subsidy":
      return "900";
    case "donation":
      return "910";
    case "input_material":
    default:
      return "400";
  }
}

/** Tells whether a sale treatment feeds a deduction (220/221/230). */
export function deductionCodeFor(treatment: VatTreatment): VatCode | null {
  switch (treatment) {
    case "exempt_export":
      return "220";
    case "foreign":
      return "221";
    case "excluded":
      return "230";
    default:
      return null;
  }
}
