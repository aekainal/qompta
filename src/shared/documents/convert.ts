/**
 * Conversion of an accepted quote into sales invoice(s).
 *
 * PURE function: it produces the `InvoiceInput` to create, without touching the DB.
 *
 * Sensitive point — VAT. A Qompta invoice carries **a single** rate (`vatRateBps`)
 * and a single return code: that is what lets `aggregateInvoices` break it down
 * into the right box of the FTA form (303 / 313 / 343). A quote, on the other
 * hand, may mix several rates. So **one invoice per rate** is issued, rather than
 * a single invoice whose VAT breakdown would be wrong.
 *
 * In practice a single-rate quote — the common case — yields a single invoice.
 */

import type { InvoiceInput, RateType } from "../types.js";
import { documentTotals, type DocumentLine } from "./totals.js";

export interface ConvertQuoteInput {
  issueDate: string;
  dueDate?: string | null;
  thirdPartyId?: string | null;
  title?: string | null;
  lines: DocumentLine[];
  currency?: string;
  notes?: string | null;
  /** VAT rates in force at the invoicing date, to name the rate type. */
  rates: { normal: number; reduced: number; lodging: number };
}

/** Invoice to create, along with the lines that belong to it. */
export interface ConvertedInvoice {
  input: InvoiceInput;
  lines: DocumentLine[];
}

/**
 * Finds the rate type (normal / reduced / lodging) matching a rate in bps, so
 * that the return code is derived correctly.
 */
export function rateTypeOf(
  bps: number,
  rates: { normal: number; reduced: number; lodging: number },
): RateType {
  if (bps === 0) return "zero";
  if (bps === rates.reduced) return "reduced";
  if (bps === rates.lodging) return "lodging";
  return "normal";
}

/**
 * Builds the sales invoices matching the quote lines.
 * The invoices are created as drafts: they only enter the VAT return once
 * issued.
 */
export function quoteToInvoices(input: ConvertQuoteInput): ConvertedInvoice[] {
  const billable = input.lines.filter((l) => l.kind !== "section");
  if (billable.length === 0) {
    throw new Error("Ce devis ne contient aucune ligne facturable.");
  }

  const totals = documentTotals(input.lines);
  const rates = totals.byRate;
  if (rates.length === 0) {
    throw new Error("Ce devis ne contient aucun montant à facturer.");
  }

  const multiRate = rates.length > 1;

  return rates.map(({ vatRateBps, ht }) => {
    // Lines of the current rate, keeping the details attached to each service line.
    const lines = linesForRate(input.lines, vatRateBps);

    const rate = rateTypeOf(vatRateBps, input.rates);
    const suffix = multiRate ? ` (TVA ${(vatRateBps / 100).toFixed(2).replace(/0$/, "")} %)` : "";

    return {
      input: {
        type: "sale",
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        thirdPartyId: input.thirdPartyId ?? null,
        description: input.title ? `${input.title}${suffix}` : null,
        treatment: "standard",
        rate,
        enteredAs: "ht",
        enteredAmount: ht,
        currency: input.currency ?? "CHF",
        status: "draft",
        notes: input.notes ?? null,
      },
      lines,
    };
  });
}

/**
 * Selects the lines of a given rate.
 * A `detail` line follows the service line before it: it has no amount of its
 * own and must stay with it. `section` lines are kept if they introduce at
 * least one retained service line.
 */
function linesForRate(lines: DocumentLine[], vatRateBps: number): DocumentLine[] {
  const out: DocumentLine[] = [];
  let pendingSection: DocumentLine | null = null;
  let keepingDetails = false;

  for (const line of lines) {
    if (line.kind === "section") {
      pendingSection = line;
      keepingDetails = false;
      continue;
    }
    if (line.kind === "item") {
      keepingDetails = line.vatRateBps === vatRateBps;
      if (keepingDetails) {
        if (pendingSection) {
          out.push(pendingSection);
          pendingSection = null;
        }
        out.push(line);
      }
      continue;
    }
    // detail: attached to the preceding service line.
    if (keepingDetails) out.push(line);
  }

  return out;
}
