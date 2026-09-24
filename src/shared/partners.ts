/**
 * Partners: the **company** customers bound to us by a contract.
 *
 * This is not a new table nor a checkbox, but a reading of the address book:
 * a partner is any customer third party, of `company` kind, that has at least
 * one contract. Nothing to maintain by hand, hence nothing that can drift out
 * of sync — a terminated and deleted contract takes the third party out of the
 * list on its own.
 *
 * Amounts in cents.
 */

import { sumCents, type Cents } from "./money.js";
import type { ContractStatus, EntityType, ThirdPartyKind } from "./types.js";

/** Third party reduced to what decides its partner status. */
export interface PartnerThirdParty {
  id: string;
  name: string;
  kind: ThirdPartyKind;
  entityType: EntityType;
  city: string | null;
  email: string | null;
  archived: boolean;
}

/** Contract reduced to what weighs on the relationship. */
export interface PartnerContract {
  id: string;
  thirdPartyId: string | null;
  number: string;
  status: ContractStatus;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  minDurationMonths: number | null;
  oneOffAmountHt: Cents | null;
  monthlyAmountHt: Cents | null;
}

/** Invoice reduced to what counts for the partner's revenue. */
export interface PartnerInvoice {
  thirdPartyId: string | null;
  type: "sale" | "purchase";
  status: string;
  issueDate: string;
  amountHt: Cents;
  amountTtc: Cents;
}

export interface Partner {
  id: string;
  name: string;
  city: string | null;
  email: string | null;
  /** The partner's contracts, from the most binding to the least binding. */
  contracts: PartnerContract[];
  /** Signed and non-terminated contracts: the living relationship. */
  activeContracts: number;
  /** Monthly net recurring revenue of the signed contracts — the revenue base. */
  monthlyRecurringHt: Cents;
  /** Net one-off service lines committed by the signed contracts. */
  oneOffHt: Cents;
  /** Invoiced revenue (net), all sales combined. */
  invoicedHt: Cents;
  /** Collected revenue (net). */
  collectedHt: Cents;
  /** Outstanding (gross) on the issued unpaid sales. */
  outstandingTtc: Cents;
  /** Date of the last sales invoice, to spot relationships that are fading out. */
  lastInvoiceDate: string | null;
}

/** A signed and non-terminated contract really binds both parties. */
function isActive(c: PartnerContract): boolean {
  return c.status === "signed";
}

/**
 * Assembles the list of partners.
 *
 * An archived third party stays a partner if it has a contract: archiving hides
 * from the address book, it does not cancel a past commitment.
 */
export function buildPartners(
  thirdParties: PartnerThirdParty[],
  contracts: PartnerContract[],
  invoices: PartnerInvoice[],
): Partner[] {
  const byThirdParty = new Map<string, PartnerContract[]>();
  for (const c of contracts) {
    if (!c.thirdPartyId) continue;
    const list = byThirdParty.get(c.thirdPartyId) ?? [];
    list.push(c);
    byThirdParty.set(c.thirdPartyId, list);
  }

  const partners: Partner[] = [];

  for (const tp of thirdParties) {
    // A supplier is not a partner, and neither is an individual.
    if (tp.kind === "supplier" || tp.entityType !== "company") continue;
    const own = byThirdParty.get(tp.id);
    if (!own || own.length === 0) continue;

    const signed = own.filter(isActive);
    const sales = invoices.filter((i) => i.thirdPartyId === tp.id && i.type === "sale");
    const paid = sales.filter((i) => i.status === "paid");
    const unpaid = sales.filter(
      (i) => i.status === "issued" || i.status === "partial" || i.status === "overdue",
    );

    partners.push({
      id: tp.id,
      name: tp.name,
      city: tp.city,
      email: tp.email,
      // The biggest recurring amount first: it is what shapes the relationship.
      contracts: [...own].sort((a, b) => (b.monthlyAmountHt ?? 0) - (a.monthlyAmountHt ?? 0)),
      activeContracts: signed.length,
      monthlyRecurringHt: sumCents(...signed.map((c) => c.monthlyAmountHt ?? 0)),
      oneOffHt: sumCents(...signed.map((c) => c.oneOffAmountHt ?? 0)),
      invoicedHt: sumCents(...sales.map((i) => i.amountHt)),
      collectedHt: sumCents(...paid.map((i) => i.amountHt)),
      outstandingTtc: sumCents(...unpaid.map((i) => i.amountTtc)),
      lastInvoiceDate: sales.reduce<string | null>(
        (last, i) => (last === null || i.issueDate > last ? i.issueDate : last),
        null,
      ),
    });
  }

  // Partners with a living contract first, then by decreasing recurring revenue.
  return partners.sort(
    (a, b) =>
      b.activeContracts - a.activeContracts ||
      b.monthlyRecurringHt - a.monthlyRecurringHt ||
      a.name.localeCompare(b.name),
  );
}

/** Totals of the Partners page. */
export interface PartnersSummary {
  count: number;
  /** Partners with at least one signed and non-terminated contract. */
  activeCount: number;
  monthlyRecurringHt: Cents;
  /** Annualized recurring revenue: what the base brings in over twelve months. */
  yearlyRecurringHt: Cents;
  invoicedHt: Cents;
  outstandingTtc: Cents;
}

export function summarizePartners(partners: Partner[]): PartnersSummary {
  const monthlyRecurringHt = sumCents(...partners.map((p) => p.monthlyRecurringHt));
  return {
    count: partners.length,
    activeCount: partners.filter((p) => p.activeContracts > 0).length,
    monthlyRecurringHt,
    yearlyRecurringHt: monthlyRecurringHt * 12,
    invoicedHt: sumCents(...partners.map((p) => p.invoicedHt)),
    outstandingTtc: sumCents(...partners.map((p) => p.outstandingTtc)),
  };
}
