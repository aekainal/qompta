/**
 * Repository of handwritten signatures, filtered by company_id.
 * A single default signature per company (enforced here, not by the database).
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { associates, signatures } from "../schema.js";
import type { Signature, SignatureInput } from "../../shared/signatures.js";

function rowTo(r: typeof signatures.$inferSelect): Signature {
  return {
    id: r.id,
    companyId: r.companyId,
    associateId: r.associateId,
    name: r.name,
    role: r.role,
    image: r.image,
    isDefault: r.isDefault,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createSignaturesRepo(db: DB) {
  function nowIso(): string {
    return new Date().toISOString();
  }

  /** A shareholder of ANOTHER company cannot be attached (isolation). */
  function checkAssociate(companyId: string, associateId: string | null | undefined): string | null {
    if (!associateId) return null;
    const row = db
      .select({ id: associates.id })
      .from(associates)
      .where(and(eq(associates.companyId, companyId), eq(associates.id, associateId)))
      .get();
    if (!row) throw new Error("Associé introuvable dans cette société.");
    return row.id;
  }

  function clearDefault(companyId: string, exceptId: string): void {
    db.update(signatures)
      .set({ isDefault: false })
      .where(eq(signatures.companyId, companyId))
      .run();
    db.update(signatures)
      .set({ isDefault: true })
      .where(and(eq(signatures.companyId, companyId), eq(signatures.id, exceptId)))
      .run();
  }

  return {
    list(companyId: string): Signature[] {
      return db
        .select()
        .from(signatures)
        .where(eq(signatures.companyId, companyId))
        .orderBy(asc(signatures.createdAt))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): Signature | null {
      const row = db
        .select()
        .from(signatures)
        .where(and(eq(signatures.companyId, companyId), eq(signatures.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    create(companyId: string, input: SignatureInput): Signature {
      const id = randomUUID();
      const ts = nowIso();
      // The company's first signature becomes the default one.
      const first = this.list(companyId).length === 0;
      db.insert(signatures)
        .values({
          id,
          companyId,
          associateId: checkAssociate(companyId, input.associateId),
          name: input.name,
          role: input.role ?? null,
          image: input.image,
          isDefault: false,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      if (first || input.isDefault) clearDefault(companyId, id);
      return this.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: SignatureInput): Signature {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Signature introuvable");
      db.update(signatures)
        .set({
          associateId: checkAssociate(companyId, input.associateId),
          name: input.name,
          role: input.role ?? null,
          image: input.image,
          updatedAt: nowIso(),
        })
        .where(and(eq(signatures.companyId, companyId), eq(signatures.id, id)))
        .run();
      if (input.isDefault) clearDefault(companyId, id);
      return this.get(companyId, id)!;
    },

    remove(companyId: string, id: string): { ok: true } {
      const current = this.get(companyId, id);
      db.delete(signatures)
        .where(and(eq(signatures.companyId, companyId), eq(signatures.id, id)))
        .run();
      // The default signature is gone: the oldest remaining one takes over.
      if (current?.isDefault) {
        const next = this.list(companyId)[0];
        if (next) clearDefault(companyId, next.id);
      }
      return { ok: true };
    },
  };
}

export type SignaturesRepo = ReturnType<typeof createSignaturesRepo>;
