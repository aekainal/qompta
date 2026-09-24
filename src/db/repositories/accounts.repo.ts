/**
 * Chart of accounts repository (account_categories), filtered by company_id.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { accountCategories } from "../schema.js";
import type { AccountCategory, AccountCategoryInput } from "../../shared/types.js";
import { defaultChartOfAccounts } from "../../shared/chart-of-accounts.js";
import type { LegalForm } from "../../shared/legal-form.js";

function rowTo(row: typeof accountCategories.$inferSelect): AccountCategory {
  return {
    id: row.id,
    companyId: row.companyId,
    code: row.code,
    label: row.label,
    kind: row.kind as AccountCategory["kind"],
    defaultVatCode: row.defaultVatCode,
    isInvestment: row.isInvestment,
    sortOrder: row.sortOrder,
    archived: row.archived,
  };
}

export function createAccountsRepo(db: DB) {
  return {
    /** Installs the default chart of accounts for the legal form (on company creation). */
    seedDefaults(companyId: string, form: LegalForm): void {
      defaultChartOfAccounts(form).forEach((a, i) => {
        db.insert(accountCategories)
          .values({
            id: randomUUID(),
            companyId,
            code: a.code,
            label: a.label,
            kind: a.kind,
            defaultVatCode: a.defaultVatCode ?? null,
            isInvestment: a.isInvestment ?? false,
            sortOrder: i,
          })
          .run();
      });
    },

    /**
     * Adds the default accounts of the form that are MISSING (compared by code),
     * without duplicating existing ones. Used on a legal form conversion (e.g.
     * RI → Sàrl: adds missing capital/reserve accounts). Returns the count added.
     */
    ensureDefaults(companyId: string, form: LegalForm): number {
      const rows = db
        .select()
        .from(accountCategories)
        .where(eq(accountCategories.companyId, companyId))
        .all();
      const existing = new Set(rows.map((r) => r.code));
      let sort = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
      let added = 0;
      for (const a of defaultChartOfAccounts(form)) {
        if (existing.has(a.code)) continue;
        sort += 1;
        db.insert(accountCategories)
          .values({
            id: randomUUID(),
            companyId,
            code: a.code,
            label: a.label,
            kind: a.kind,
            defaultVatCode: a.defaultVatCode ?? null,
            isInvestment: a.isInvestment ?? false,
            sortOrder: sort,
          })
          .run();
        added += 1;
      }
      return added;
    },

    list(companyId: string, includeArchived = false): AccountCategory[] {
      return db
        .select()
        .from(accountCategories)
        .where(eq(accountCategories.companyId, companyId))
        .all()
        .filter((r) => includeArchived || !r.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(rowTo);
    },

    create(companyId: string, input: AccountCategoryInput): AccountCategory {
      const id = randomUUID();
      const max = db
        .select()
        .from(accountCategories)
        .where(eq(accountCategories.companyId, companyId))
        .all()
        .reduce((m, r) => Math.max(m, r.sortOrder), -1);
      db.insert(accountCategories)
        .values({
          id,
          companyId,
          code: input.code,
          label: input.label,
          kind: input.kind,
          defaultVatCode: input.defaultVatCode ?? null,
          isInvestment: input.isInvestment ?? false,
          sortOrder: max + 1,
        })
        .run();
      return rowTo(
        db.select().from(accountCategories).where(eq(accountCategories.id, id)).get()!,
      );
    },

    update(companyId: string, id: string, patch: Partial<AccountCategoryInput>): AccountCategory {
      db.update(accountCategories)
        .set({
          ...(patch.code !== undefined ? { code: patch.code } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.defaultVatCode !== undefined ? { defaultVatCode: patch.defaultVatCode } : {}),
          ...(patch.isInvestment !== undefined ? { isInvestment: patch.isInvestment } : {}),
        })
        .where(and(eq(accountCategories.companyId, companyId), eq(accountCategories.id, id)))
        .run();
      return rowTo(
        db.select().from(accountCategories).where(eq(accountCategories.id, id)).get()!,
      );
    },

    archive(companyId: string, id: string): { ok: true } {
      db.update(accountCategories)
        .set({ archived: true })
        .where(and(eq(accountCategories.companyId, companyId), eq(accountCategories.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type AccountsRepo = ReturnType<typeof createAccountsRepo>;
