/**
 * Cash reconciliations repository, filtered by company_id.
 *
 * A reconciliation touches neither the VAT return nor the result: it only
 * realigns the displayed cash position with the actual bank balance at a date.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { cashReconciliations } from "../schema.js";
import type {
  CashReconciliation,
  CashReconciliationInput,
} from "../../shared/cashReconciliation.js";

export type { CashReconciliation, CashReconciliationInput };

function rowTo(r: typeof cashReconciliations.$inferSelect): CashReconciliation {
  return {
    id: r.id,
    companyId: r.companyId,
    date: r.date,
    balance: r.balance,
    note: r.note,
    createdAt: r.createdAt,
  };
}

export function createCashReconciliationsRepo(db: DB) {
  const repo = {
    list(companyId: string): CashReconciliation[] {
      return db
        .select()
        .from(cashReconciliations)
        .where(eq(cashReconciliations.companyId, companyId))
        .orderBy(desc(cashReconciliations.date), desc(cashReconciliations.createdAt))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): CashReconciliation | null {
      const row = db
        .select()
        .from(cashReconciliations)
        .where(and(eq(cashReconciliations.companyId, companyId), eq(cashReconciliations.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    create(companyId: string, input: CashReconciliationInput): CashReconciliation {
      const id = randomUUID();
      db.insert(cashReconciliations)
        .values({ id, companyId, date: input.date, balance: input.balance, note: input.note ?? null })
        .run();
      return repo.get(companyId, id)!;
    },

    remove(companyId: string, id: string): { ok: true } {
      db.delete(cashReconciliations)
        .where(and(eq(cashReconciliations.companyId, companyId), eq(cashReconciliations.id, id)))
        .run();
      return { ok: true } as const;
    },
  };

  return repo;
}

export type CashReconciliationsRepo = ReturnType<typeof createCashReconciliationsRepo>;
