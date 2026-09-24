/**
 * Repository of the invoices, filtered by company_id. Systematically recomputes the
 * derived amounts (net/VAT/gross/CHF + VAT code) via the pure logic shared/invoice.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../client.js";
import { invoicePayments, invoices } from "../schema.js";
import type {
  Invoice,
  InvoiceFilters,
  InvoiceInput,
  InvoiceListResult,
  InvoicePayment,
} from "../../shared/types.js";
import { computeInvoice } from "../../shared/invoice.js";
import { nextDocumentNumber } from "../../shared/documents/numbering.js";

function nowIso(): string {
  return new Date().toISOString();
}

function rowTo(row: typeof invoices.$inferSelect): Invoice {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.type as Invoice["type"],
    number: row.number,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    thirdPartyId: row.thirdPartyId,
    description: row.description,
    categoryId: row.categoryId,
    treatment: row.treatment as Invoice["treatment"],
    enteredAs: row.enteredAs as Invoice["enteredAs"],
    amountHt: row.amountHt,
    vatRateBps: row.vatRateBps,
    vatAmount: row.vatAmount,
    vatAmountOverride: row.vatAmountOverride,
    amountTtc: row.amountTtc,
    currency: row.currency,
    fxRate: row.fxRate,
    amountChf: row.amountChf,
    vatCode: row.vatCode,
    vatCodeOverride: row.vatCodeOverride,
    status: row.status as Invoice["status"],
    paymentDate: row.paymentDate,
    notes: row.notes,
    title: row.title,
    quoteId: row.quoteId,
    contractId: row.contractId,
    bankAccountId: row.bankAccountId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createInvoicesRepo(db: DB) {
  function computeFields(input: InvoiceInput) {
    const c = computeInvoice({
      type: input.type,
      treatment: input.treatment,
      rate: input.rate,
      enteredAmount: input.enteredAmount,
      enteredAs: input.enteredAs,
      issueDate: input.issueDate,
      currency: input.currency,
      fxRate: input.fxRate,
      vatAmountOverride: input.vatAmountOverride,
    });
    const override = input.vatCodeOverride ?? null;
    return {
      amountHt: c.amountHt,
      vatRateBps: c.rateBps,
      vatAmount: c.vatAmount,
      vatAmountOverride: input.vatAmountOverride ?? null,
      amountTtc: c.amountTtc,
      amountChf: c.amountChf,
      vatCode: override ?? c.vatCode,
      vatCodeOverride: override !== null,
    };
  }

  return {
    /**
     * Next customer invoice number (FC series) for a given date.
     * Sales only: a purchase invoice carries the supplier's own number.
     */
    nextNumber(companyId: string, issueDate: string): string {
      const used = db
        .select({ number: invoices.number })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.type, "sale")))
        .all()
        .map((r) => r.number);
      return nextDocumentNumber("invoice", issueDate, used);
    },

    create(companyId: string, input: InvoiceInput): Invoice {
      const id = randomUUID();
      const ts = nowIso();
      const f = computeFields(input);
      db.insert(invoices)
        .values({
          id,
          companyId,
          type: input.type,
          number: input.number ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate ?? null,
          thirdPartyId: input.thirdPartyId ?? null,
          description: input.description ?? null,
          categoryId: input.categoryId ?? null,
          treatment: input.treatment,
          enteredAs: input.enteredAs,
          amountHt: f.amountHt,
          vatRateBps: f.vatRateBps,
          vatAmount: f.vatAmount,
          vatAmountOverride: f.vatAmountOverride,
          amountTtc: f.amountTtc,
          currency: input.currency ?? "CHF",
          fxRate: input.fxRate ?? null,
          amountChf: f.amountChf,
          vatCode: f.vatCode,
          vatCodeOverride: f.vatCodeOverride,
          status: input.status ?? "draft",
          paymentDate: input.paymentDate ?? null,
          notes: input.notes ?? null,
          title: input.title ?? null,
          quoteId: input.quoteId ?? null,
          contractId: input.contractId ?? null,
          bankAccountId: input.bankAccountId ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      return this.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: InvoiceInput): Invoice {
      const f = computeFields(input);
      db.update(invoices)
        .set({
          type: input.type,
          number: input.number ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate ?? null,
          thirdPartyId: input.thirdPartyId ?? null,
          description: input.description ?? null,
          categoryId: input.categoryId ?? null,
          treatment: input.treatment,
          enteredAs: input.enteredAs,
          amountHt: f.amountHt,
          vatRateBps: f.vatRateBps,
          vatAmount: f.vatAmount,
          vatAmountOverride: f.vatAmountOverride,
          amountTtc: f.amountTtc,
          currency: input.currency ?? "CHF",
          fxRate: input.fxRate ?? null,
          amountChf: f.amountChf,
          vatCode: f.vatCode,
          vatCodeOverride: f.vatCodeOverride,
          status: input.status ?? "draft",
          paymentDate: input.paymentDate ?? null,
          notes: input.notes ?? null,
          title: input.title ?? null,
          quoteId: input.quoteId ?? null,
          contractId: input.contractId ?? null,
          bankAccountId: input.bankAccountId ?? null,
          updatedAt: nowIso(),
        })
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
        .run();
      return this.get(companyId, id)!;
    },

    get(companyId: string, id: string): Invoice | null {
      const row = db
        .select()
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    delete(companyId: string, id: string): { ok: true } {
      db.delete(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
        .run();
      return { ok: true };
    },

    duplicate(companyId: string, id: string): Invoice {
      const src = this.get(companyId, id);
      if (!src) throw new Error("Facture introuvable");
      return this.create(companyId, {
        type: src.type,
        number: src.number ? `${src.number}-copie` : null,
        issueDate: src.issueDate,
        dueDate: src.dueDate,
        thirdPartyId: src.thirdPartyId,
        description: src.description,
        categoryId: src.categoryId,
        treatment: src.treatment,
        rate: rateTypeFromBps(src.vatRateBps, src.treatment),
        enteredAs: src.enteredAs,
        enteredAmount: src.enteredAs === "ht" ? src.amountHt : src.amountTtc,
        vatAmountOverride: src.vatAmountOverride,
        currency: src.currency,
        fxRate: src.fxRate,
        vatCodeOverride: src.vatCodeOverride ? src.vatCode : null,
        status: "draft",
        notes: src.notes,
        title: src.title,
        // The copy inherits neither the source quote nor the contract: it is a new document.
        bankAccountId: src.bankAccountId,
      });
    },

    list(companyId: string, filters: InvoiceFilters = {}): InvoiceListResult {
      const conds: SQL[] = [eq(invoices.companyId, companyId)];
      if (filters.type) conds.push(eq(invoices.type, filters.type));
      if (filters.status) conds.push(eq(invoices.status, filters.status));
      if (filters.thirdPartyId) conds.push(eq(invoices.thirdPartyId, filters.thirdPartyId));
      if (filters.vatCode) conds.push(eq(invoices.vatCode, filters.vatCode));
      if (filters.from) conds.push(gte(invoices.issueDate, filters.from));
      if (filters.to) conds.push(lte(invoices.issueDate, filters.to));
      // Quick filters by VAT period: each selected range is an OR.
      if (filters.issueRanges?.length) {
        const cond = or(
          ...filters.issueRanges.map((r) =>
            and(gte(invoices.issueDate, r.from), lte(invoices.issueDate, r.to)),
          ),
        );
        if (cond) conds.push(cond);
      }
      if (filters.search) {
        const s = `%${filters.search}%`;
        const cond = or(like(invoices.number, s), like(invoices.description, s));
        if (cond) conds.push(cond);
      }
      const where = and(...conds);

      const totalRow = db
        .select({ n: sql<number>`count(*)` })
        .from(invoices)
        .where(where)
        .get();
      const total = totalRow?.n ?? 0;

      const sortCol =
        filters.sortBy === "amountTtc"
          ? invoices.amountTtc
          : filters.sortBy === "number"
            ? invoices.number
            : filters.sortBy === "status"
              ? invoices.status
              : invoices.issueDate;
      const dir = filters.sortDir === "asc" ? asc : desc;

      const rows = db
        .select()
        .from(invoices)
        .where(where)
        .orderBy(dir(sortCol))
        .limit(filters.limit ?? 100)
        .offset(filters.offset ?? 0)
        .all()
        .map(rowTo);

      return { rows, total };
    },

    // ── Partial payments ──
    addPayment(companyId: string, invoiceId: string, date: string, amount: number): Invoice {
      db.insert(invoicePayments)
        .values({ id: randomUUID(), companyId, invoiceId, date, amount })
        .run();
      // Status update according to the total amount paid.
      const inv = this.get(companyId, invoiceId);
      if (!inv) throw new Error("Facture introuvable");
      const paid = this.paymentsTotal(companyId, invoiceId);
      let status = inv.status;
      let paymentDate = inv.paymentDate;
      if (paid >= inv.amountTtc) {
        status = "paid";
        paymentDate = date;
      } else if (paid > 0) {
        status = "partial";
      }
      db.update(invoices)
        .set({ status, paymentDate, updatedAt: nowIso() })
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)))
        .run();
      return this.get(companyId, invoiceId)!;
    },

    payments(companyId: string, invoiceId: string): InvoicePayment[] {
      return db
        .select()
        .from(invoicePayments)
        .where(
          and(eq(invoicePayments.companyId, companyId), eq(invoicePayments.invoiceId, invoiceId)),
        )
        .all();
    },

    paymentsTotal(companyId: string, invoiceId: string): number {
      const row = db
        .select({ s: sql<number>`coalesce(sum(${invoicePayments.amount}),0)` })
        .from(invoicePayments)
        .where(
          and(eq(invoicePayments.companyId, companyId), eq(invoicePayments.invoiceId, invoiceId)),
        )
        .get();
      return row?.s ?? 0;
    },

    /** Marks the due unpaid invoices as « overdue » (to be called at startup). */
    refreshOverdue(companyId: string, today: string): number {
      const rows = db
        .select()
        .from(invoices)
        .where(eq(invoices.companyId, companyId))
        .all();
      let n = 0;
      for (const r of rows) {
        if (
          r.dueDate &&
          r.dueDate < today &&
          r.status !== "paid" &&
          r.status !== "draft" &&
          r.status !== "settled_vat"
        ) {
          if (r.status !== "overdue") {
            db.update(invoices)
              .set({ status: "overdue" })
              .where(eq(invoices.id, r.id))
              .run();
            n++;
          }
        }
      }
      return n;
    },
  };
}

/** Rebuilds the RateType (mapping) from the bps rate and the treatment. */
function rateTypeFromBps(
  bps: number,
  treatment: Invoice["treatment"],
): InvoiceInput["rate"] {
  if (["exempt_export", "foreign", "excluded", "subsidy", "donation"].includes(treatment)) {
    return "zero";
  }
  if (bps === 260) return "reduced";
  if (bps === 380) return "lodging";
  if (bps === 0) return "zero";
  return "normal";
}

export type InvoicesRepo = ReturnType<typeof createInvoicesRepo>;
