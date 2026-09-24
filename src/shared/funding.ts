/**
 * Fund contributions: pure logic (aggregates, cash position). Amounts in cents.
 *
 * A shareholder contribution is neither revenue nor a VAT operation: it appears
 * nowhere in the FTA return. It only does two things:
 *  - fill the company account (available cash position);
 *  - create either equity (`capital`) or a debt towards the shareholder
 *    (`current_account`), which `repayment` settles.
 */

import { sumCents, type Cents } from "./money.js";
import { isVatOnly } from "./invoice.js";
import { latestReconciliation, type CashReconciliation } from "./cashReconciliation.js";

export type FundContributionKind = "capital" | "current_account" | "repayment";
export type FundContributionMethod = "bank" | "cash";

export const FUND_KIND_LABELS: Record<FundContributionKind, string> = {
  capital: "Apport en capital",
  current_account: "Avance en compte courant",
  repayment: "Remboursement à l'associé",
};

export const FUND_METHOD_LABELS: Record<FundContributionMethod, string> = {
  bank: "Virement bancaire",
  cash: "Espèces",
};

/** A repayment leaves the till: it counts as negative. */
export function signedAmount(kind: FundContributionKind, amount: Cents): Cents {
  return kind === "repayment" ? -amount : amount;
}

/** Fund movement as exposed by the repository and the IPC. */
export interface FundContribution {
  id: string;
  companyId: string;
  associateId: string | null;
  associateName: string;
  date: string;
  kind: FundContributionKind;
  amount: Cents;
  method: FundContributionMethod;
  bankAccountId: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FundContributionInput {
  associateId?: string | null;
  associateName: string;
  date: string;
  kind: FundContributionKind;
  amount: Cents;
  method?: FundContributionMethod;
  bankAccountId?: string | null;
  reference?: string | null;
  notes?: string | null;
}

/** A shareholder's position: what they put in, what was paid back. */
export interface AssociateFunding {
  associateId: string | null;
  name: string;
  capital: Cents;
  currentAccount: Cents;
  repaid: Cents;
  /** Contributed − repaid: what the company still owes them (shareholder loan included). */
  net: Cents;
}

export interface FundingSummary {
  /** Equity contributions. */
  capital: Cents;
  /** Shareholder loan account advances (debt towards the shareholders). */
  currentAccount: Cents;
  /** Repayments paid to the shareholders. */
  repaid: Cents;
  /** capital + shareholder loan account − repayments: net money that entered the company. */
  net: Cents;
  /** Debt still owed to the shareholders: shareholder loan account − repayments. */
  owedToAssociates: Cents;
  count: number;
  byAssociate: AssociateFunding[];
}

const EMPTY: FundingSummary = {
  capital: 0,
  currentAccount: 0,
  repaid: 0,
  net: 0,
  owedToAssociates: 0,
  count: 0,
  byAssociate: [],
};

/**
 * Aggregates fund movements.
 * @param upTo inclusive ISO date: only counts movements on or before it.
 */
export function summarizeFunding(rows: FundContribution[], upTo?: string): FundingSummary {
  const kept = upTo ? rows.filter((r) => r.date <= upTo) : rows;
  if (kept.length === 0) return { ...EMPTY };

  const byKey = new Map<string, AssociateFunding>();
  const out: FundingSummary = { ...EMPTY, count: kept.length, byAssociate: [] };

  for (const r of kept) {
    if (r.kind === "capital") out.capital += r.amount;
    else if (r.kind === "current_account") out.currentAccount += r.amount;
    else out.repaid += r.amount;

    // Grouping by shareholder; failing an identifier, by the entered name.
    const key = r.associateId ?? `name:${r.associateName}`;
    const entry = byKey.get(key) ?? {
      associateId: r.associateId,
      name: r.associateName,
      capital: 0,
      currentAccount: 0,
      repaid: 0,
      net: 0,
    };
    if (r.kind === "capital") entry.capital += r.amount;
    else if (r.kind === "current_account") entry.currentAccount += r.amount;
    else entry.repaid += r.amount;
    entry.net = entry.capital + entry.currentAccount - entry.repaid;
    byKey.set(key, entry);
  }

  out.net = out.capital + out.currentAccount - out.repaid;
  out.owedToAssociates = out.currentAccount - out.repaid;
  out.byAssociate = Array.from(byKey.values()).sort((a, b) => b.net - a.net);
  return out;
}

/** Invoice reduced to what moves the cash position. */
export interface CashInvoice {
  type: "sale" | "purchase";
  status: string;
  issueDate: string;
  paymentDate: string | null;
  amountTtc: Cents;
}

/**
 * Settlement of a paid VAT return: signed NET amount (positive = paid to the FTA →
 * leaves the cash position; negative = refund received → enters the cash position),
 * at the payment date of the return.
 */
export interface CashVatSettlement {
  date: string;
  amount: Cents;
}

/**
 * Available cash position: what the shareholders put in, plus what has been
 * collected, minus what has been paid. Cumulative (no financial year) — this is
 * the question « can I pay the next invoice? », not an annual result.
 */
export interface CashPosition {
  /** Net shareholder contributions. */
  funding: Cents;
  /** Collected sales (gross). */
  collected: Cents;
  /** Paid purchases (gross). */
  spent: Cents;
  /** funding + collected − spent, or, if a reconciliation exists, the actual balance + later flows. */
  available: Cents;
  /** Issued unpaid purchases: what is still to go out. */
  toPay: Cents;
  /** Date of the last reconciliation taken into account (null if none) — `available` derives from it. */
  reconciledOn?: string | null;
  /** Actual balance recorded at that date (null if no reconciliation). */
  reconciledBalance?: Cents | null;
}

/**
 * @param upTo inclusive ISO date; a movement counts at its payment date,
 *   failing that at its issue date.
 */
export function buildCashPosition(
  contributions: FundContribution[],
  invoices: CashInvoice[],
  upTo?: string,
  reconciliations: CashReconciliation[] = [],
  vatSettlements: CashVatSettlement[] = [],
): CashPosition {
  const funding = summarizeFunding(contributions, upTo).net;
  const onDate = (i: CashInvoice) => i.paymentDate ?? i.issueDate;
  // VAT paid to (or refunded by) the FTA for paid returns — leaves/enters the cash position.
  const vatPaid = sumCents(
    ...vatSettlements.filter((s) => upTo === undefined || s.date <= upTo).map((s) => s.amount),
  );
  const kept = upTo ? invoices.filter((i) => onDate(i) <= upTo) : invoices;

  const paid = kept.filter((i) => i.status === "paid");
  const collected = sumCents(...paid.filter((i) => i.type === "sale").map((i) => i.amountTtc));
  const spent = sumCents(...paid.filter((i) => i.type === "purchase").map((i) => i.amountTtc));
  const toPay = sumCents(
    ...kept
      .filter(
        (i) =>
          i.type === "purchase" &&
          i.status !== "paid" &&
          i.status !== "draft" &&
          !isVatOnly(i.status), // already settled by a third party: not a debt to pay
      )
      .map((i) => i.amountTtc),
  );

  /*
   * Reconciliation: the last actual balance (≤ upTo) is authoritative. The cash
   * position starts from that balance and adds ONLY the later flows — an entry
   * dated before the reconciliation therefore no longer moves the present cash
   * position. Without a reconciliation, we fall back on the total since inception.
   */
  const anchor = latestReconciliation(reconciliations, upTo);
  let available: Cents;
  if (anchor) {
    const after = (d: string) => d > anchor.date && (upTo === undefined || d <= upTo);
    const paidAfter = invoices.filter((i) => i.status === "paid" && after(onDate(i)));
    const collectedAfter = sumCents(
      ...paidAfter.filter((i) => i.type === "sale").map((i) => i.amountTtc),
    );
    const spentAfter = sumCents(
      ...paidAfter.filter((i) => i.type === "purchase").map((i) => i.amountTtc),
    );
    const fundingAfter = summarizeFunding(contributions.filter((c) => after(c.date))).net;
    const vatPaidAfter = sumCents(...vatSettlements.filter((s) => after(s.date)).map((s) => s.amount));
    available = anchor.balance + fundingAfter + collectedAfter - spentAfter - vatPaidAfter;
  } else {
    available = funding + collected - spent - vatPaid;
  }

  return {
    funding,
    collected,
    spent,
    available,
    toPay,
    reconciledOn: anchor?.date ?? null,
    reconciledBalance: anchor?.balance ?? null,
  };
}
