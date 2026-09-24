/**
 * Repository of the shareholders (simple partnership / SNC), filtered by company_id.
 * Shares in basis points (50 % = 5000); the expected sum is 10000.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { associates } from "../schema.js";
import type { AssociateInput, AssociateRecord } from "../../shared/types.js";

export type { AssociateInput, AssociateRecord };

function rowTo(r: typeof associates.$inferSelect): AssociateRecord {
  return {
    id: r.id,
    companyId: r.companyId,
    name: r.name,
    shareBps: r.shareBps,
    role: r.role,
    fromDate: r.fromDate,
    toDate: r.toDate,
  };
}

export function createAssociatesRepo(db: DB) {
  return {
    list(companyId: string): AssociateRecord[] {
      return db
        .select()
        .from(associates)
        .where(eq(associates.companyId, companyId))
        .all()
        .map(rowTo);
    },

    create(companyId: string, input: AssociateInput): AssociateRecord {
      const id = randomUUID();
      db.insert(associates)
        .values({
          id,
          companyId,
          name: input.name,
          shareBps: input.shareBps,
          role: input.role ?? null,
          fromDate: input.fromDate ?? new Date().toISOString().slice(0, 10),
        })
        .run();
      return rowTo(db.select().from(associates).where(eq(associates.id, id)).get()!);
    },

    update(companyId: string, id: string, patch: Partial<AssociateInput>): AssociateRecord {
      db.update(associates)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.shareBps !== undefined ? { shareBps: patch.shareBps } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
        })
        .where(and(eq(associates.companyId, companyId), eq(associates.id, id)))
        .run();
      return rowTo(db.select().from(associates).where(eq(associates.id, id)).get()!);
    },

    remove(companyId: string, id: string): { ok: true } {
      db.delete(associates)
        .where(and(eq(associates.companyId, companyId), eq(associates.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type AssociatesRepo = ReturnType<typeof createAssociatesRepo>;
