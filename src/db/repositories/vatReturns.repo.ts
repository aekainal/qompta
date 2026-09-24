/**
 * Repository of the VAT returns. As long as a return is not closed, it is
 * computed on the fly from the invoices. On closing, the lines are frozen.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { companyVatSettings, invoices, vatReturnLines, vatReturns } from "../schema.js";
import type {
  AccountingBasis,
  PeriodType,
  VatMethod,
  VatReturnRecord,
  VatReturnStatus,
} from "../../shared/types.js";
import { buildVatReturn, type ReturnInvoice } from "../../shared/vat/buildReturn.js";
import { periodRange } from "../../shared/vat/period.js";
import { toReturnLines } from "../../shared/vat/returnLines.js";
import { resolveRate } from "../../shared/vat/rates.js";
import type { VatReturnResult } from "../../shared/vat/compute.js";

function nowIso() {
  return new Date().toISOString();
}

function rowTo(row: typeof vatReturns.$inferSelect): VatReturnRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    periodType: row.periodType as PeriodType,
    year: row.year,
    periodIndex: row.periodIndex,
    startDate: row.startDate,
    endDate: row.endDate,
    method: row.method as VatMethod,
    status: row.status as VatReturnStatus,
    locked: row.locked,
    totalPayable: row.totalPayable,
    totalCredit: row.totalCredit,
    filedAt: row.filedAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createVatReturnsRepo(db: DB) {
  function basisOf(companyId: string): AccountingBasis {
    const s = db
      .select()
      .from(companyVatSettings)
      .where(eq(companyVatSettings.companyId, companyId))
      .get();
    return (s?.accountingBasis as AccountingBasis) ?? "agreed";
  }

  function ratesAt(date: string) {
    return {
      normal: resolveRate("normal", date),
      reduced: resolveRate("reduced", date),
      lodging: resolveRate("lodging", date),
    };
  }

  function loadInvoices(companyId: string): ReturnInvoice[] {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .all()
      .map((r) => {
        // Actual VAT in CHF: conversion if foreign currency.
        const isChf = r.currency === "CHF" || !r.fxRate;
        const vatChf = isChf ? r.vatAmount : Math.round((r.vatAmount * r.fxRate!) / 10000);
        return {
          type: r.type as "sale" | "purchase",
          treatment: r.treatment as ReturnInvoice["treatment"],
          vatRateBps: r.vatRateBps,
          amountChf: r.amountChf,
          vatChf,
          issueDate: r.issueDate,
          paymentDate: r.paymentDate,
          status: r.status,
        };
      });
  }

  return {
    /** Computes the VAT return on the fly (effective method) for the period. */
    computeLive(
      companyId: string,
      periodType: PeriodType,
      year: number,
      periodIndex?: number | null,
    ): { result: VatReturnResult; range: ReturnType<typeof periodRange> } {
      const range = periodRange(periodType, year, periodIndex);
      const basis = basisOf(companyId);
      const rates = ratesAt(range.endDate);
      const result = buildVatReturn(loadInvoices(companyId), basis, range, rates);
      return { result, range };
    },

    /** Finds a stored VAT return for the period, if one exists. */
    findRecord(
      companyId: string,
      periodType: PeriodType,
      year: number,
      periodIndex: number | null,
    ): VatReturnRecord | null {
      const row = db
        .select()
        .from(vatReturns)
        .where(
          and(
            eq(vatReturns.companyId, companyId),
            eq(vatReturns.periodType, periodType),
            eq(vatReturns.year, year),
            periodIndex == null
              ? eq(vatReturns.periodIndex, 0)
              : eq(vatReturns.periodIndex, periodIndex),
          ),
        )
        .get();
      return row ? rowTo(row) : null;
    },

    list(companyId: string): VatReturnRecord[] {
      return db
        .select()
        .from(vatReturns)
        .where(eq(vatReturns.companyId, companyId))
        .all()
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(rowTo);
    },

    /** Closes the period: freezes the lines and marks the return as locked. */
    lock(
      companyId: string,
      periodType: PeriodType,
      year: number,
      periodIndex: number | null,
      method: VatMethod = "effective",
    ): VatReturnRecord {
      const { result, range } = this.computeLive(companyId, periodType, year, periodIndex);
      const existing = this.findRecord(companyId, periodType, year, periodIndex);
      const ts = nowIso();
      const id = existing?.id ?? randomUUID();

      if (existing) {
        db.update(vatReturns)
          .set({
            status: "closed",
            locked: true,
            totalPayable: result.b500,
            totalCredit: result.b510,
            method,
            updatedAt: ts,
          })
          .where(eq(vatReturns.id, id))
          .run();
        db.delete(vatReturnLines).where(eq(vatReturnLines.vatReturnId, id)).run();
      } else {
        db.insert(vatReturns)
          .values({
            id,
            companyId,
            periodType,
            year,
            periodIndex: periodIndex ?? 0,
            startDate: range.startDate,
            endDate: range.endDate,
            method,
            status: "closed",
            locked: true,
            totalPayable: result.b500,
            totalCredit: result.b510,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
      }

      // Snapshot of the lines.
      for (const line of toReturnLines(result)) {
        db.insert(vatReturnLines)
          .values({
            id: randomUUID(),
            vatReturnId: id,
            code: line.code,
            baseAmount: line.base ?? 0,
            taxAmount: line.tax,
          })
          .run();
      }

      return this.findRecord(companyId, periodType, year, periodIndex)!;
    },

    reopen(companyId: string, id: string): VatReturnRecord {
      db.update(vatReturns)
        .set({ status: "in_progress", locked: false, updatedAt: nowIso() })
        .where(and(eq(vatReturns.companyId, companyId), eq(vatReturns.id, id)))
        .run();
      return rowTo(db.select().from(vatReturns).where(eq(vatReturns.id, id)).get()!);
    },

    setStatus(companyId: string, id: string, status: VatReturnStatus): VatReturnRecord {
      const ts = nowIso();
      db.update(vatReturns)
        .set({
          status,
          ...(status === "filed" ? { filedAt: ts } : {}),
          ...(status === "paid" ? { paidAt: ts } : {}),
          updatedAt: ts,
        })
        .where(and(eq(vatReturns.companyId, companyId), eq(vatReturns.id, id)))
        .run();
      return rowTo(db.select().from(vatReturns).where(eq(vatReturns.id, id)).get()!);
    },
  };
}

export type VatReturnsRepo = ReturnType<typeof createVatReturnsRepo>;
