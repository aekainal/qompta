/**
 * Quotes repository (and their lines), filtered by company_id.
 *
 * Quotes are deliberately kept out of the accounting circuit: they never enter
 * the VAT return. `convertToInvoice` is what creates the matching sales invoice,
 * which then follows the normal invoice path.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import type { DB } from "../client.js";
import { documentLines, invoices, quotes } from "../schema.js";
import type {
  DocumentLineInput,
  DocumentLineRecord,
  Invoice,
  Quote,
  QuoteFilters,
  QuoteInput,
  QuoteStatus,
  QuoteWithLines,
} from "../../shared/types.js";
import { documentTotals, type DocumentLine } from "../../shared/documents/totals.js";
import { nextDocumentNumber } from "../../shared/documents/numbering.js";
import { quoteToInvoices } from "../../shared/documents/convert.js";
import { resolveRate } from "../../shared/vat/rates.js";
import type { InvoicesRepo } from "./invoices.repo.js";

function nowIso(): string {
  return new Date().toISOString();
}

function rowTo(row: typeof quotes.$inferSelect): Quote {
  return {
    id: row.id,
    companyId: row.companyId,
    number: row.number,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    thirdPartyId: row.thirdPartyId,
    title: row.title,
    status: row.status as QuoteStatus,
    currency: row.currency,
    amountHt: row.amountHt,
    vatAmount: row.vatAmount,
    amountTtc: row.amountTtc,
    vatNote: row.vatNote,
    notes: row.notes,
    bankAccountId: row.bankAccountId,
    acceptedAt: row.acceptedAt,
    invoiceId: row.invoiceId,
    contractId: row.contractId,
    supersededByQuoteId: row.supersededByQuoteId,
    signatureId: row.signatureId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function lineRowTo(row: typeof documentLines.$inferSelect): DocumentLineRecord {
  return {
    id: row.id,
    kind: row.kind as DocumentLineRecord["kind"],
    label: row.label,
    qtyMilli: row.qtyMilli,
    unitPriceHt: row.unitPriceHt,
    vatRateBps: row.vatRateBps,
  };
}

/** VAT rates in force on a date, to name the rate type on conversion. */
function ratesAt(date: string) {
  return {
    normal: resolveRate("normal", date),
    reduced: resolveRate("reduced", date),
    lodging: resolveRate("lodging", date),
  };
}

export function createQuotesRepo(db: DB, invoicesRepo: InvoicesRepo) {
  /** Rewrites a document's lines in full. */
  function replaceLines(
    companyId: string,
    documentType: "quote" | "invoice",
    documentId: string,
    lines: DocumentLineInput[],
  ): void {
    db.delete(documentLines)
      .where(
        and(
          eq(documentLines.companyId, companyId),
          eq(documentLines.documentType, documentType),
          eq(documentLines.documentId, documentId),
        ),
      )
      .run();

    lines.forEach((line, i) => {
      db.insert(documentLines)
        .values({
          id: randomUUID(),
          companyId,
          documentType,
          documentId,
          sortOrder: i,
          kind: line.kind,
          label: line.label,
          qtyMilli: line.qtyMilli,
          unitPriceHt: line.unitPriceHt,
          vatRateBps: line.vatRateBps,
        })
        .run();
    });
  }

  function linesOf(
    companyId: string,
    documentType: "quote" | "invoice",
    documentId: string,
  ): DocumentLineRecord[] {
    return db
      .select()
      .from(documentLines)
      .where(
        and(
          eq(documentLines.companyId, companyId),
          eq(documentLines.documentType, documentType),
          eq(documentLines.documentId, documentId),
        ),
      )
      .orderBy(asc(documentLines.sortOrder))
      .all()
      .map(lineRowTo);
  }

  return {
    linesOf,
    replaceLines,

    /** Next available DC… number for a given date. */
    nextNumber(companyId: string, issueDate: string): string {
      const used = db
        .select({ number: quotes.number })
        .from(quotes)
        .where(eq(quotes.companyId, companyId))
        .all()
        .map((r) => r.number);
      return nextDocumentNumber("quote", issueDate, used);
    },

    list(companyId: string, filters: QuoteFilters = {}): Quote[] {
      const conds: SQL[] = [eq(quotes.companyId, companyId)];
      if (filters.status) conds.push(eq(quotes.status, filters.status));
      if (filters.thirdPartyId) conds.push(eq(quotes.thirdPartyId, filters.thirdPartyId));
      if (filters.from) conds.push(gte(quotes.issueDate, filters.from));
      if (filters.to) conds.push(lte(quotes.issueDate, filters.to));
      if (filters.search) {
        const s = `%${filters.search}%`;
        const cond = or(like(quotes.number, s), like(quotes.title, s));
        if (cond) conds.push(cond);
      }
      return db
        .select()
        .from(quotes)
        .where(and(...conds))
        .orderBy(desc(quotes.issueDate), desc(quotes.number))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): QuoteWithLines | null {
      const row = db
        .select()
        .from(quotes)
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .get();
      if (!row) return null;
      return { ...rowTo(row), lines: linesOf(companyId, "quote", id) };
    },

    create(companyId: string, input: QuoteInput): QuoteWithLines {
      const id = randomUUID();
      const ts = nowIso();
      const totals = documentTotals(input.lines as DocumentLine[]);
      const number = input.number?.trim() || this.nextNumber(companyId, input.issueDate);

      db.insert(quotes)
        .values({
          id,
          companyId,
          number,
          issueDate: input.issueDate,
          validUntil: input.validUntil ?? null,
          thirdPartyId: input.thirdPartyId ?? null,
          title: input.title ?? null,
          status: input.status ?? "draft",
          currency: input.currency ?? "CHF",
          amountHt: totals.ht,
          vatAmount: totals.vat,
          amountTtc: totals.ttc,
          vatNote: input.vatNote ?? null,
          notes: input.notes ?? null,
          bankAccountId: input.bankAccountId ?? null,
          signatureId: input.signatureId ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      replaceLines(companyId, "quote", id, input.lines);
      return this.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: QuoteInput): QuoteWithLines {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Devis introuvable");
      // Locked as long as the invoice exists: editing it would make the quote
      // diverge from the accounting document it produced. Invoice gone, lock gone.
      if (current.status === "invoiced" && this.hasLiveInvoice(companyId, current)) {
        throw new Error(
          "Ce devis a été facturé : supprimez d'abord la facture pour le modifier.",
        );
      }

      const totals = documentTotals(input.lines as DocumentLine[]);
      db.update(quotes)
        .set({
          number: input.number?.trim() || current.number,
          issueDate: input.issueDate,
          validUntil: input.validUntil ?? null,
          thirdPartyId: input.thirdPartyId ?? null,
          title: input.title ?? null,
          status: input.status ?? current.status,
          currency: input.currency ?? current.currency,
          amountHt: totals.ht,
          vatAmount: totals.vat,
          amountTtc: totals.ttc,
          vatNote: input.vatNote ?? null,
          notes: input.notes ?? null,
          bankAccountId: input.bankAccountId ?? null,
          signatureId: input.signatureId ?? null,
          updatedAt: nowIso(),
        })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();

      replaceLines(companyId, "quote", id, input.lines);
      return this.get(companyId, id)!;
    },

    setStatus(companyId: string, id: string, status: QuoteStatus): QuoteWithLines {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Devis introuvable");
      db.update(quotes)
        .set({
          status,
          acceptedAt: status === "accepted" ? (current.acceptedAt ?? nowIso()) : current.acceptedAt,
          updatedAt: nowIso(),
        })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();
      return this.get(companyId, id)!;
    },

    /**
     * Deletes the quote and its lines.
     *
     * An invoiced quote stays protected **as long as its invoice exists**:
     * deleting it would leave an invoice orphaned from its offer. Once the
     * invoice itself is deleted (test, data entry mistake), nothing justifies
     * keeping the quote — it becomes deletable again.
     */
    delete(companyId: string, id: string): { ok: true } {
      const current = this.get(companyId, id);
      if (current?.status === "invoiced" && this.hasLiveInvoice(companyId, current)) {
        throw new Error(
          "Ce devis a produit une facture : supprimez d'abord la facture correspondante.",
        );
      }
      db.delete(documentLines)
        .where(
          and(
            eq(documentLines.companyId, companyId),
            eq(documentLines.documentType, "quote"),
            eq(documentLines.documentId, id),
          ),
        )
        .run();
      db.delete(quotes)
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();
      return { ok: true };
    },

    duplicate(companyId: string, id: string): QuoteWithLines {
      const src = this.get(companyId, id);
      if (!src) throw new Error("Devis introuvable");
      const today = new Date().toISOString().slice(0, 10);
      return this.create(companyId, {
        issueDate: today,
        validUntil: null,
        thirdPartyId: src.thirdPartyId,
        title: src.title,
        status: "draft",
        currency: src.currency,
        vatNote: src.vatNote,
        notes: src.notes,
        bankAccountId: src.bankAccountId,
        signatureId: src.signatureId,
        lines: src.lines.map(({ id: _id, ...l }) => l),
      });
    },

    /**
     * Creates an adapted version of a quote and links the two.
     *
     * The original keeps its status (refused, expired…) but no longer counts as
     * a lost deal on the dashboard: the new offer is the one that now carries
     * the opportunity.
     */
    revise(companyId: string, id: string): QuoteWithLines {
      const src = this.get(companyId, id);
      if (!src) throw new Error("Devis introuvable");
      if (src.supersededByQuoteId) {
        throw new Error("Ce devis a déjà été adapté ; reprenez la version la plus récente.");
      }

      const revision = this.duplicate(companyId, id);
      db.update(quotes)
        .set({ supersededByQuoteId: revision.id, updatedAt: nowIso() })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();
      return revision;
    },

    /**
     * Converts the quote into draft sales invoice(s).
     * The lines are copied onto the invoice so that its PDF is identical.
     */
    convertToInvoice(
      companyId: string,
      id: string,
      options: { issueDate?: string; dueDate?: string | null } = {},
    ): Invoice[] {
      const quote = this.get(companyId, id);
      if (!quote) throw new Error("Devis introuvable");
      if (quote.status === "invoiced") {
        throw new Error("Ce devis a déjà été converti en facture.");
      }

      const issueDate = options.issueDate ?? new Date().toISOString().slice(0, 10);
      const converted = quoteToInvoices({
        issueDate,
        dueDate: options.dueDate ?? null,
        thirdPartyId: quote.thirdPartyId,
        title: quote.title,
        lines: quote.lines as DocumentLine[],
        currency: quote.currency,
        notes: quote.notes,
        rates: ratesAt(issueDate),
      });

      const created: Invoice[] = [];
      for (const { input, lines } of converted) {
        const invoice = invoicesRepo.create(companyId, {
          ...input,
          // Each invoice gets its own number from the FC series.
          number: invoicesRepo.nextNumber(companyId, issueDate),
          title: quote.title,
          quoteId: quote.id,
          bankAccountId: quote.bankAccountId,
        });
        replaceLines(companyId, "invoice", invoice.id, lines);
        created.push(invoice);
      }

      db.update(quotes)
        .set({
          status: "invoiced",
          invoiceId: created[0]?.id ?? null,
          updatedAt: nowIso(),
        })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();

      return created;
    },

    /** Moves quotes past their validity date to "expired". */
    refreshExpired(companyId: string, today: string): number {
      const rows = db
        .select()
        .from(quotes)
        .where(eq(quotes.companyId, companyId))
        .all();
      let n = 0;
      for (const r of rows) {
        const stale = r.validUntil && r.validUntil < today;
        if (stale && (r.status === "draft" || r.status === "sent")) {
          db.update(quotes).set({ status: "expired" }).where(eq(quotes.id, r.id)).run();
          n++;
        }
      }
      return n;
    },

    /** Attaches a contract to the quote (conversion into a contract). */
    linkContract(companyId: string, id: string, contractId: string): void {
      db.update(quotes)
        .set({ contractId, updatedAt: nowIso() })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, id)))
        .run();
    },

    /**
     * Gives the quote back its pre-invoicing status once its invoice(s) have
     * been deleted.
     *
     * It goes back to **accepted**: the customer's agreement still stands — the
     * quote becomes editable and convertible again, without going back through
     * "sent". Call it after deleting an invoice issued from a quote.
     */
    releaseInvoice(companyId: string, quoteId: string): void {
      const quote = this.get(companyId, quoteId);
      if (!quote || quote.status !== "invoiced") return;
      if (this.hasLiveInvoice(companyId, quote)) return;

      db.update(quotes)
        .set({
          status: "accepted",
          acceptedAt: quote.acceptedAt ?? nowIso(),
          invoiceId: null,
          updatedAt: nowIso(),
        })
        .where(and(eq(quotes.companyId, companyId), eq(quotes.id, quoteId)))
        .run();
    },

    /**
     * Reviews "invoiced" quotes and releases those whose invoice has gone.
     * Self-repair: an invoice deleted outside this path (older version, import,
     * direct deletion) would otherwise leave the quote locked forever. Called
     * when the Quotes module opens.
     */
    releaseOrphaned(companyId: string): number {
      const rows = db
        .select({ id: quotes.id })
        .from(quotes)
        .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "invoiced")))
        .all();

      let released = 0;
      for (const { id } of rows) {
        this.releaseInvoice(companyId, id);
        if (this.get(companyId, id)?.status === "accepted") released++;
      }
      return released;
    },

    /**
     * Does an invoice issued from this quote still exist?
     *
     * Both links are checked: `invoices.quote_id` (set on conversion) and
     * `quotes.invoice_id` (the first invoice issued), because an invoice
     * recreated by hand may carry only one of them.
     */
    hasLiveInvoice(companyId: string, quote: Quote): boolean {
      if (this.invoicesOf(companyId, quote.id).length > 0) return true;
      if (!quote.invoiceId) return false;
      return !!db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, quote.invoiceId)))
        .get();
    },

    /** Invoices issued from a quote. */
    invoicesOf(companyId: string, quoteId: string): string[] {
      return db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.quoteId, quoteId)))
        .all()
        .map((r) => r.id);
    },
  };
}

export type QuotesRepo = ReturnType<typeof createQuotesRepo>;
