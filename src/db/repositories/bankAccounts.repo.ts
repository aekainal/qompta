/**
 * Bank details repository, filtered by company_id.
 * The account marked as default is the one proposed on new invoices.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { bankAccounts } from "../schema.js";
import type { BankAccount, BankAccountInput } from "../../shared/types.js";

function rowTo(row: typeof bankAccounts.$inferSelect): BankAccount {
  return {
    id: row.id,
    companyId: row.companyId,
    label: row.label,
    iban: row.iban,
    holderName: row.holderName,
    bankName: row.bankName,
    bic: row.bic,
    currency: row.currency,
    isDefault: row.isDefault,
    archived: row.archived,
  };
}

export function createBankAccountsRepo(db: DB) {
  /** Guarantees that only one account carries the "default" flag. */
  function clearOtherDefaults(companyId: string, keepId: string): void {
    db.update(bankAccounts)
      .set({ isDefault: false })
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isDefault, true)))
      .run();
    db.update(bankAccounts)
      .set({ isDefault: true })
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.id, keepId)))
      .run();
  }

  return {
    list(companyId: string, includeArchived = false): BankAccount[] {
      const conds = [eq(bankAccounts.companyId, companyId)];
      if (!includeArchived) conds.push(eq(bankAccounts.archived, false));
      return db
        .select()
        .from(bankAccounts)
        .where(and(...conds))
        .orderBy(asc(bankAccounts.label))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): BankAccount | null {
      const row = db
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    /** Account proposed by default, or the first available one. */
    getDefault(companyId: string): BankAccount | null {
      const all = this.list(companyId);
      return all.find((a) => a.isDefault) ?? all[0] ?? null;
    },

    create(companyId: string, data: BankAccountInput): BankAccount {
      const id = randomUUID();
      // The very first account becomes the default account.
      const isFirst = this.list(companyId).length === 0;
      db.insert(bankAccounts)
        .values({
          id,
          companyId,
          label: data.label,
          iban: data.iban,
          holderName: data.holderName ?? null,
          bankName: data.bankName ?? null,
          bic: data.bic ?? null,
          currency: data.currency ?? "CHF",
          isDefault: data.isDefault ?? isFirst,
          archived: false,
        })
        .run();
      if (data.isDefault || isFirst) clearOtherDefaults(companyId, id);
      return this.get(companyId, id)!;
    },

    update(companyId: string, id: string, data: Partial<BankAccountInput>): BankAccount {
      const current = this.get(companyId, id);
      if (!current) throw new Error("Compte bancaire introuvable");

      db.update(bankAccounts)
        .set({
          label: data.label ?? current.label,
          iban: data.iban ?? current.iban,
          holderName: data.holderName !== undefined ? data.holderName : current.holderName,
          bankName: data.bankName !== undefined ? data.bankName : current.bankName,
          bic: data.bic !== undefined ? data.bic : current.bic,
          currency: data.currency ?? current.currency,
        })
        .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.id, id)))
        .run();

      if (data.isDefault) clearOtherDefaults(companyId, id);
      return this.get(companyId, id)!;
    },

    archive(companyId: string, id: string): { ok: true } {
      db.update(bankAccounts)
        .set({ archived: true, isDefault: false })
        .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type BankAccountsRepo = ReturnType<typeof createBankAccountsRepo>;
