/**
 * Repository of fund contributions (shareholder contributions), filtered by company_id.
 *
 * No entry here goes into the VAT return: a contribution is out of scope.
 * The shareholder name is frozen at entry, the id serves for grouping.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { associates, fundContributions } from "../schema.js";
import type {
  FundContribution,
  FundContributionInput,
  FundContributionKind,
  FundContributionMethod,
} from "../../shared/funding.js";

export type { FundContribution, FundContributionInput };

function rowTo(r: typeof fundContributions.$inferSelect): FundContribution {
  return {
    id: r.id,
    companyId: r.companyId,
    associateId: r.associateId,
    associateName: r.associateName,
    date: r.date,
    kind: r.kind as FundContributionKind,
    amount: r.amount,
    method: r.method as FundContributionMethod,
    bankAccountId: r.bankAccountId,
    reference: r.reference,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

export function createFundContributionsRepo(db: DB) {
  /** Current name of the shareholder, if they still exist in this company. */
  function associateName(companyId: string, associateId: string | null | undefined): string | null {
    if (!associateId) return null;
    const row = db
      .select()
      .from(associates)
      .where(and(eq(associates.companyId, companyId), eq(associates.id, associateId)))
      .get();
    return row?.name ?? null;
  }

  function values(companyId: string, input: FundContributionInput) {
    return {
      companyId,
      associateId: input.associateId ?? null,
      associateName: associateName(companyId, input.associateId) ?? input.associateName,
      date: input.date,
      kind: input.kind,
      amount: input.amount,
      method: input.method ?? "bank",
      bankAccountId: input.bankAccountId ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    };
  }

  const repo = {
    list(companyId: string): FundContribution[] {
      return db
        .select()
        .from(fundContributions)
        .where(eq(fundContributions.companyId, companyId))
        .orderBy(desc(fundContributions.date), desc(fundContributions.createdAt))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): FundContribution | null {
      const row = db
        .select()
        .from(fundContributions)
        .where(and(eq(fundContributions.companyId, companyId), eq(fundContributions.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    create(companyId: string, input: FundContributionInput): FundContribution {
      const id = randomUUID();
      db.insert(fundContributions).values({ id, ...values(companyId, input) }).run();
      return repo.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: FundContributionInput): FundContribution {
      db.update(fundContributions)
        .set(values(companyId, input))
        .where(and(eq(fundContributions.companyId, companyId), eq(fundContributions.id, id)))
        .run();
      const row = repo.get(companyId, id);
      if (!row) throw new Error("Entrée de fonds introuvable");
      return row;
    },

    remove(companyId: string, id: string): { ok: true } {
      db.delete(fundContributions)
        .where(and(eq(fundContributions.companyId, companyId), eq(fundContributions.id, id)))
        .run();
      return { ok: true } as const;
    },
  };

  return repo;
}

export type FundContributionsRepo = ReturnType<typeof createFundContributionsRepo>;
