/**
 * Aggregation of a list of invoices (of one company, for one period) into the
 * VAT return bases (VatReturnInput), ready for computeVatReturn().
 *
 * PURE function. The invoices passed in are assumed already filtered on the
 * period and the company (period / accrual-cash basis selection is done upstream).
 */

import { type Bps, type Cents, vatFromNet } from "../money.js";
import { emptyVatInput, type VatReturnInput } from "./compute.js";
import { deductionCodeFor, type RateType, type VatTreatment } from "./mapping.js";

/** Invoice normalized for VAT aggregation (amounts in cents, in CHF). */
export interface AggregatableInvoice {
  type: "sale" | "purchase";
  treatment: VatTreatment;
  rate: RateType;
  /** Applied rate in bps (already resolved at the invoice date). */
  rateBps: Bps;
  /** Net amount in CHF (cents). */
  netChf: Cents;
  /** VAT amount in CHF (cents). */
  vatChf: Cents;
}

export interface AggregateOptions {
  rateNormalBps: Bps;
  rateReducedBps: Bps;
  rateLodgingBps: Bps;
}

/**
 * Builds the VatReturnInput from the invoices of the period.
 *
 * Rules:
 * - Every sale (taxed or not) feeds line 200 (worldwide turnover) with its net amount.
 * - Exempt/foreign/excluded sales additionally feed the deduction 220/221/230.
 * - Taxed sales feed the base by rate (303/313/343).
 * - Discounts granted (discount) feed 235.
 * - Purchases feed the input tax 400/405 with their VAT amount.
 * - Subsidies -> 900; donations/dividends -> 910 (net/gross amount).
 */
export function aggregateInvoices(
  invoices: AggregatableInvoice[],
  opts: AggregateOptions,
): VatReturnInput {
  const input = emptyVatInput({
    normal: opts.rateNormalBps,
    reduced: opts.rateReducedBps,
    lodging: opts.rateLodgingBps,
  });

  for (const inv of invoices) {
    if (inv.type === "sale") {
      if (inv.treatment === "discount") {
        input.b235 += inv.netChf;
        continue;
      }
      if (inv.treatment === "subsidy") {
        input.b900 += inv.netChf;
        continue;
      }
      if (inv.treatment === "donation") {
        input.b910 += inv.netChf;
        continue;
      }

      // Every sale enters the worldwide turnover (200).
      input.b200 += inv.netChf;

      const deduction = deductionCodeFor(inv.treatment);
      if (deduction === "220") input.b220 += inv.netChf;
      else if (deduction === "221") input.b221 += inv.netChf;
      else if (deduction === "230") input.b230 += inv.netChf;
      else {
        // Taxed sale: break down by rate.
        if (inv.rate === "reduced") input.b313 += inv.netChf;
        else if (inv.rate === "lodging") input.b343 += inv.netChf;
        else input.b303 += inv.netChf;
      }
    } else {
      // Purchases: input tax.
      if (inv.treatment === "subsidy") {
        input.b900 += inv.netChf;
        continue;
      }
      if (inv.treatment === "donation") {
        input.b910 += inv.netChf;
        continue;
      }
      if (inv.treatment === "input_investment") {
        input.t405 += inv.vatChf;
      } else {
        input.t400 += inv.vatChf;
      }
    }
  }

  return input;
}

/**
 * Helper: recomputes the VAT of an invoice from the net amount and the bps rate.
 * Allows rebuilding vatChf when only the net amount is available.
 */
export function vatOf(netChf: Cents, rateBps: Bps): Cents {
  return vatFromNet(netChf, rateBps);
}
