/**
 * Repository for a company's equity (Sàrl/SA): one row per company.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { companyEquity } from "../schema.js";
import type { CompanyEquity } from "../../shared/equity.js";
import { EMPTY_EQUITY } from "../../shared/equity.js";

function rowTo(r: typeof companyEquity.$inferSelect): CompanyEquity {
  return {
    shareCapital: r.shareCapital,
    reserves: r.reserves,
    retainedEarnings: r.retainedEarnings,
    nonDeductibleCharges: r.nonDeductibleCharges,
    managerSalary: r.managerSalary,
    dividends: r.dividends,
  };
}

export function createCompanyEquityRepo(db: DB) {
  const repo = {
    get(companyId: string): CompanyEquity {
      const r = db.select().from(companyEquity).where(eq(companyEquity.companyId, companyId)).get();
      return r ? rowTo(r) : { ...EMPTY_EQUITY };
    },

    set(companyId: string, v: CompanyEquity): CompanyEquity {
      const updatedAt = new Date().toISOString();
      const existing = db.select().from(companyEquity).where(eq(companyEquity.companyId, companyId)).get();
      if (existing) {
        db.update(companyEquity).set({ ...v, updatedAt }).where(eq(companyEquity.companyId, companyId)).run();
      } else {
        db.insert(companyEquity).values({ companyId, ...v, updatedAt }).run();
      }
      return repo.get(companyId);
    },
  };
  return repo;
}

export type CompanyEquityRepo = ReturnType<typeof createCompanyEquityRepo>;
