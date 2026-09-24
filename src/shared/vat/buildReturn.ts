/**
 * Assembles a complete VAT return from the invoices of a company.
 * Pure and testable: selection by period + basis (accrual/cash), mapping, aggregation,
 * then calculation of the totals (computeVatReturn).
 */

import { vatFromNet, type Bps } from "../money.js";
import type { AccountingBasis } from "../types.js";
import { aggregateInvoices, type AggregatableInvoice } from "./aggregate.js";
import { computeVatReturn, type VatReturnResult } from "./compute.js";
import type { RateType, VatTreatment } from "./mapping.js";
import type { PeriodRange } from "./period.js";

/** Subset of the invoice fields needed by the VAT return. */
export interface ReturnInvoice {
  type: "sale" | "purchase";
  treatment: VatTreatment;
  vatRateBps: number;
  amountChf: number;
  /**
   * Actual VAT of the invoice in CHF (input tax effectively paid).
   * If absent, recomputed from the rate. Used for purchases (400/405).
   */
  vatChf?: number;
  issueDate: string;
  paymentDate: string | null;
  status: string;
}

export interface VatRatesBps {
  normal: Bps;
  reduced: Bps;
  lodging: Bps;
}

/** Allocation date of an invoice per basis (accrual = invoice, cash = payment). */
export function attributionDate(inv: ReturnInvoice, basis: AccountingBasis): string | null {
  return basis === "received" ? inv.paymentDate : inv.issueDate;
}

/** Filters the invoices falling in the period per the VAT return basis. */
export function selectPeriodInvoices(
  invoices: ReturnInvoice[],
  basis: AccountingBasis,
  range: PeriodRange,
): ReturnInvoice[] {
  return invoices.filter((inv) => {
    // A draft is not an issued invoice: it creates no VAT liability, whatever
    // the basis. On the accrual basis, VAT is due on issuance; as long as the
    // invoice is not issued, it stays out of the VAT return.
    if (inv.status === "draft") return false;
    const d = attributionDate(inv, basis);
    if (!d) return false;
    return d >= range.startDate && d <= range.endDate;
  });
}

/** Derives the RateType (mapping) from the rate in bps and the treatment. */
export function rateTypeOf(bps: number, treatment: VatTreatment): RateType {
  if (["exempt_export", "foreign", "excluded", "discount", "subsidy", "donation"].includes(treatment)) {
    return "zero";
  }
  if (bps === 260) return "reduced";
  if (bps === 380) return "lodging";
  if (bps === 0) return "zero";
  return "normal";
}

/** Converts an invoice into an aggregatable entry (amounts in CHF). */
export function toAggregatable(inv: ReturnInvoice): AggregatableInvoice {
  const rate = rateTypeOf(inv.vatRateBps, inv.treatment);
  return {
    type: inv.type,
    treatment: inv.treatment,
    rate,
    rateBps: inv.vatRateBps,
    netChf: inv.amountChf,
    // Actual VAT recorded if available (supplier override), otherwise recomputed.
    vatChf: inv.vatChf ?? vatFromNet(inv.amountChf, inv.vatRateBps),
  };
}

/**
 * Builds the VAT return (effective method) for a given period.
 */
export function buildVatReturn(
  invoices: ReturnInvoice[],
  basis: AccountingBasis,
  range: PeriodRange,
  rates: VatRatesBps,
): VatReturnResult {
  const selected = selectPeriodInvoices(invoices, basis, range);
  const input = aggregateInvoices(selected.map(toAggregatable), {
    rateNormalBps: rates.normal,
    rateReducedBps: rates.reduced,
    rateLodgingBps: rates.lodging,
  });
  return computeVatReturn(input);
}
