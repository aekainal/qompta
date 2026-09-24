/**
 * Repository of contracts and their templates, filtered by company_id.
 *
 * The sections of a contract are frozen at creation (variables already resolved):
 * changing a template must never alter a contract that is already signed.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { contracts, contractTemplates, quotes } from "../schema.js";
import type {
  Contract,
  ContractBlock,
  ContractInput,
  ContractStatus,
  ContractTemplate,
} from "../../shared/types.js";
import { nextDocumentNumber } from "../../shared/documents/numbering.js";
import {
  DEFAULT_CONTRACT_VARIABLES,
  resolveBlocks,
  type ContractVariables,
} from "../../shared/documents/contract-template.js";
import { normalizeBlocks, withIds } from "../../shared/documents/contract-blocks.js";
import { DEFAULT_MODEL_KEY, findModel } from "../../shared/documents/contract-models.js";

function nowIso(): string {
  return new Date().toISOString();
}

/** The sections are stored as JSON; corrupted data must not break everything. */
function parseBlocks(json: string): ContractBlock[] {
  try {
    return normalizeBlocks(JSON.parse(json));
  } catch {
    return [];
  }
}

/** Comparable content of two section lists (the local ids are not part of it). */
function sameContent(a: ContractBlock[], b: ContractBlock[]): boolean {
  const strip = (list: ContractBlock[]) => JSON.stringify(list.map(({ id: _id, ...rest }) => rest));
  return strip(a) === strip(b);
}

function rowTo(row: typeof contracts.$inferSelect): Contract {
  return {
    id: row.id,
    companyId: row.companyId,
    number: row.number,
    thirdPartyId: row.thirdPartyId,
    quoteId: row.quoteId,
    title: row.title,
    status: row.status as ContractStatus,
    issueDate: row.issueDate,
    startDate: row.startDate,
    endDate: row.endDate,
    minDurationMonths: row.minDurationMonths,
    noticeDays: row.noticeDays,
    oneOffAmountHt: row.oneOffAmountHt,
    monthlyAmountHt: row.monthlyAmountHt,
    vatRateBps: row.vatRateBps,
    blocks: parseBlocks(row.articlesJson),
    signedDate: row.signedDate,
    signedPlace: row.signedPlace,
    terminatedDate: row.terminatedDate,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function templateRowTo(row: typeof contractTemplates.$inferSelect): ContractTemplate {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    blocks: parseBlocks(row.articlesJson),
    isDefault: row.isDefault,
  };
}

export function createContractsRepo(db: DB) {
  return {
    nextNumber(companyId: string, issueDate: string): string {
      const used = db
        .select({ number: contracts.number })
        .from(contracts)
        .where(eq(contracts.companyId, companyId))
        .all()
        .map((r) => r.number);
      return nextDocumentNumber("contract", issueDate, used);
    },

    list(companyId: string, status?: ContractStatus): Contract[] {
      const conds = [eq(contracts.companyId, companyId)];
      if (status) conds.push(eq(contracts.status, status));
      return db
        .select()
        .from(contracts)
        .where(and(...conds))
        .orderBy(desc(contracts.issueDate), desc(contracts.number))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): Contract | null {
      const row = db
        .select()
        .from(contracts)
        .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    create(companyId: string, input: ContractInput): Contract {
      const id = randomUUID();
      const ts = nowIso();
      const number = input.number?.trim() || this.nextNumber(companyId, input.issueDate);

      db.insert(contracts)
        .values({
          id,
          companyId,
          number,
          thirdPartyId: input.thirdPartyId ?? null,
          quoteId: input.quoteId ?? null,
          title: input.title ?? null,
          status: input.status ?? "draft",
          issueDate: input.issueDate,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          minDurationMonths: input.minDurationMonths ?? null,
          noticeDays: input.noticeDays ?? null,
          oneOffAmountHt: input.oneOffAmountHt ?? null,
          monthlyAmountHt: input.monthlyAmountHt ?? null,
          vatRateBps: input.vatRateBps ?? 0,
          articlesJson: JSON.stringify(input.blocks),
          signedDate: input.signedDate ?? null,
          signedPlace: input.signedPlace ?? null,
          terminatedDate: input.terminatedDate ?? null,
          notes: input.notes ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      // Records the link both ways when the contract is born from a quote.
      if (input.quoteId) {
        db.update(quotes)
          .set({ contractId: id, updatedAt: ts })
          .where(and(eq(quotes.companyId, companyId), eq(quotes.id, input.quoteId)))
          .run();
      }

      return this.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: ContractInput): Contract {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Contrat introuvable");
      if (current.status === "signed" && input.status !== "terminated") {
        // A signed contract is no longer editable in substance: only its termination is.
        if (!sameContent(current.blocks, input.blocks)) {
          throw new Error(
            "Ce contrat est signé : son contenu ne peut plus être modifié. Créez un avenant.",
          );
        }
      }

      db.update(contracts)
        .set({
          number: input.number?.trim() || current.number,
          thirdPartyId: input.thirdPartyId ?? null,
          quoteId: input.quoteId ?? current.quoteId,
          title: input.title ?? null,
          status: input.status ?? current.status,
          issueDate: input.issueDate,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          minDurationMonths: input.minDurationMonths ?? null,
          noticeDays: input.noticeDays ?? null,
          oneOffAmountHt: input.oneOffAmountHt ?? null,
          monthlyAmountHt: input.monthlyAmountHt ?? null,
          vatRateBps: input.vatRateBps ?? current.vatRateBps,
          articlesJson: JSON.stringify(input.blocks),
          signedDate: input.signedDate ?? null,
          signedPlace: input.signedPlace ?? null,
          terminatedDate: input.terminatedDate ?? null,
          notes: input.notes ?? null,
          updatedAt: nowIso(),
        })
        .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
        .run();

      return this.get(companyId, id)!;
    },

    setStatus(companyId: string, id: string, status: ContractStatus, date?: string): Contract {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Contrat introuvable");
      const day = date ?? new Date().toISOString().slice(0, 10);
      db.update(contracts)
        .set({
          status,
          signedDate: status === "signed" ? (current.signedDate ?? day) : current.signedDate,
          terminatedDate: status === "terminated" ? day : current.terminatedDate,
          updatedAt: nowIso(),
        })
        .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
        .run();
      return this.get(companyId, id)!;
    },

    delete(companyId: string, id: string): { ok: true } {
      const current = this.get(companyId, id);
      if (current?.status === "signed") {
        throw new Error("Un contrat signé ne peut pas être supprimé ; il peut être résilié.");
      }
      db.delete(contracts)
        .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
        .run();
      return { ok: true };
    },

    // ── Templates ──

    listTemplates(companyId: string): ContractTemplate[] {
      return db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.companyId, companyId))
        .orderBy(asc(contractTemplates.name))
        .all()
        .map(templateRowTo);
    },

    /**
     * Default template of the company. On the first call, the standard Qwasar
     * template (15 clauses + signatures) is created so that the user has a
     * starting point.
     */
    defaultTemplate(companyId: string): ContractTemplate {
      const existing = this.listTemplates(companyId);
      const found = existing.find((t) => t.isDefault) ?? existing[0];
      if (found) return found;

      const id = randomUUID();
      db.insert(contractTemplates)
        .values({
          id,
          companyId,
          name: "Contrat de prestation de services",
          articlesJson: JSON.stringify(withIds(findModel(DEFAULT_MODEL_KEY).blocks)),
          isDefault: true,
        })
        .run();
      return this.listTemplates(companyId).find((t) => t.id === id)!;
    },

    saveTemplate(
      companyId: string,
      data: { id?: string | null; name: string; blocks: ContractBlock[]; isDefault?: boolean },
    ): ContractTemplate {
      const id = data.id ?? randomUUID();
      const values = {
        id,
        companyId,
        name: data.name,
        articlesJson: JSON.stringify(data.blocks),
        isDefault: data.isDefault ?? false,
      };

      if (data.id) {
        db.update(contractTemplates)
          .set(values)
          .where(
            and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, data.id)),
          )
          .run();
      } else {
        db.insert(contractTemplates).values(values).run();
      }

      if (data.isDefault) {
        db.update(contractTemplates)
          .set({ isDefault: false })
          .where(eq(contractTemplates.companyId, companyId))
          .run();
        db.update(contractTemplates)
          .set({ isDefault: true })
          .where(and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, id)))
          .run();
      }

      return this.listTemplates(companyId).find((t) => t.id === id)!;
    },

    deleteTemplate(companyId: string, id: string): { ok: true } {
      db.delete(contractTemplates)
        .where(and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, id)))
        .run();
      return { ok: true };
    },

    /**
     * Ready-to-use sections for a new contract: template of the company (the one
     * requested, otherwise the default one), variables resolved with the values of
     * the contract to create.
     */
    blocksFor(
      companyId: string,
      vars: Partial<ContractVariables>,
      templateId?: string | null,
    ): ContractBlock[] {
      const template =
        (templateId ? this.listTemplates(companyId).find((t) => t.id === templateId) : null) ??
        this.defaultTemplate(companyId);
      return resolveBlocks(withIds(template.blocks), { ...DEFAULT_CONTRACT_VARIABLES, ...vars });
    },
  };
}

export type ContractsRepo = ReturnType<typeof createContractsRepo>;
