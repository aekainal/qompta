/**
 * Third parties repository (customers/suppliers), filtered by company_id.
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../client.js";
import { contracts, invoices, quotes, thirdParties } from "../schema.js";
import type { ThirdParty, ThirdPartyInput, ThirdPartyUsage } from "../../shared/types.js";

function rowTo(row: typeof thirdParties.$inferSelect): ThirdParty {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind as ThirdParty["kind"],
    name: row.name,
    addressJson: row.addressJson,
    email: row.email,
    phone: row.phone,
    entityType: (row.entityType as ThirdParty["entityType"]) ?? "company",
    vatNumber: row.vatNumber,
    rcNumber: row.rcNumber,
    notes: row.notes,
    archived: row.archived,
    addressLine2: row.addressLine2,
    street: row.street,
    buildingNumber: row.buildingNumber,
    zip: row.zip,
    city: row.city,
    country: row.country,
  };
}

export function createThirdPartiesRepo(db: DB) {
  return {
    list(companyId: string, includeArchived = false): ThirdParty[] {
      return db
        .select()
        .from(thirdParties)
        .where(eq(thirdParties.companyId, companyId))
        .all()
        .filter((r) => includeArchived || !r.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(rowTo);
    },

    create(companyId: string, input: ThirdPartyInput): ThirdParty {
      const id = randomUUID();
      db.insert(thirdParties)
        .values({
          id,
          companyId,
          kind: input.kind,
          entityType: input.entityType ?? "company",
          name: input.name,
          email: input.email || null,
          phone: input.phone ?? null,
          vatNumber: input.vatNumber ?? null,
          rcNumber: input.rcNumber ?? null,
          notes: input.notes ?? null,
          addressLine2: input.addressLine2 ?? null,
          street: input.street ?? null,
          buildingNumber: input.buildingNumber ?? null,
          zip: input.zip ?? null,
          city: input.city ?? null,
          country: input.country || "CH",
        })
        .run();
      return rowTo(db.select().from(thirdParties).where(eq(thirdParties.id, id)).get()!);
    },

    update(companyId: string, id: string, patch: Partial<ThirdPartyInput>): ThirdParty {
      db.update(thirdParties)
        .set({
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.entityType !== undefined ? { entityType: patch.entityType } : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.email !== undefined ? { email: patch.email || null } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
          ...(patch.vatNumber !== undefined ? { vatNumber: patch.vatNumber } : {}),
          ...(patch.rcNumber !== undefined ? { rcNumber: patch.rcNumber } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.addressLine2 !== undefined ? { addressLine2: patch.addressLine2 } : {}),
          ...(patch.street !== undefined ? { street: patch.street } : {}),
          ...(patch.buildingNumber !== undefined ? { buildingNumber: patch.buildingNumber } : {}),
          ...(patch.zip !== undefined ? { zip: patch.zip } : {}),
          ...(patch.city !== undefined ? { city: patch.city } : {}),
          ...(patch.country !== undefined ? { country: patch.country || "CH" } : {}),
        })
        .where(and(eq(thirdParties.companyId, companyId), eq(thirdParties.id, id)))
        .run();
      return rowTo(db.select().from(thirdParties).where(eq(thirdParties.id, id)).get()!);
    },

    archive(companyId: string, id: string): { ok: true } {
      db.update(thirdParties)
        .set({ archived: true })
        .where(and(eq(thirdParties.companyId, companyId), eq(thirdParties.id, id)))
        .run();
      return { ok: true };
    },

    /**
     * Counts the documents that reference this third party. A record linked to an
     * invoice, a quote or a contract carries history: it cannot be deleted
     * (foreign keys forbid it, and archiving exists for that).
     */
    usage(companyId: string, id: string): ThirdPartyUsage {
      const invoicesN =
        db
          .select({ n: sql<number>`count(*)` })
          .from(invoices)
          .where(and(eq(invoices.companyId, companyId), eq(invoices.thirdPartyId, id)))
          .get()?.n ?? 0;
      const quotesN =
        db
          .select({ n: sql<number>`count(*)` })
          .from(quotes)
          .where(and(eq(quotes.companyId, companyId), eq(quotes.thirdPartyId, id)))
          .get()?.n ?? 0;
      const contractsN =
        db
          .select({ n: sql<number>`count(*)` })
          .from(contracts)
          .where(and(eq(contracts.companyId, companyId), eq(contracts.thirdPartyId, id)))
          .get()?.n ?? 0;
      return { invoices: invoicesN, quotes: quotesN, contracts: contractsN };
    },

    /**
     * Permanently deletes a third party, but only if it is referenced nowhere.
     * A third party with history (invoices, quotes, contracts) must be archived:
     * the deletion is refused rather than hitting a foreign-key constraint or
     * orphaning documents.
     */
    delete(companyId: string, id: string): { ok: true } {
      const u = this.usage(companyId, id);
      const linked = u.invoices + u.quotes + u.contracts;
      if (linked > 0) {
        throw new Error(
          "Ce tiers est lié à des documents (factures, devis ou contrats) : archivez-le plutôt que de le supprimer.",
        );
      }
      db.delete(thirdParties)
        .where(and(eq(thirdParties.companyId, companyId), eq(thirdParties.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type ThirdPartiesRepo = ReturnType<typeof createThirdPartiesRepo>;
