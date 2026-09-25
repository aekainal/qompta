/**
 * Partners: company customers under contract, assembled from the address book,
 * the contracts and the invoices. No dedicated table: see
 * src/shared/partners.ts for the rule.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { contracts, invoices, thirdParties } from "../schema.js";
import {
  buildPartners,
  summarizePartners,
  type Partner,
  type PartnersSummary,
} from "../../shared/partners.js";
import type { ContractStatus, EntityType, ThirdPartyKind } from "../../shared/types.js";

export type { Partner, PartnersSummary };

export function createPartnersRepo(db: DB) {
  return {
    list(companyId: string): { partners: Partner[]; summary: PartnersSummary } {
      const tps = db
        .select()
        .from(thirdParties)
        .where(eq(thirdParties.companyId, companyId))
        .all()
        .map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind as ThirdPartyKind,
          entityType: (r.entityType as EntityType) ?? "company",
          city: r.city,
          email: r.email,
          archived: r.archived,
        }));

      const cts = db
        .select()
        .from(contracts)
        .where(eq(contracts.companyId, companyId))
        .all()
        .map((r) => ({
          id: r.id,
          thirdPartyId: r.thirdPartyId,
          number: r.number,
          status: r.status as ContractStatus,
          title: r.title,
          startDate: r.startDate,
          endDate: r.endDate,
          minDurationMonths: r.minDurationMonths,
          oneOffAmountHt: r.oneOffAmountHt,
          monthlyAmountHt: r.monthlyAmountHt,
        }));

      const invs = db
        .select()
        .from(invoices)
        .where(eq(invoices.companyId, companyId))
        .all()
        .map((r) => ({
          thirdPartyId: r.thirdPartyId,
          type: r.type as "sale" | "purchase",
          status: r.status,
          issueDate: r.issueDate,
          amountHt: r.amountHt,
          amountTtc: r.amountTtc,
        }));

      const partners = buildPartners(tps, cts, invs);
      return { partners, summary: summarizePartners(partners) };
    },
  };
}

export type PartnersRepo = ReturnType<typeof createPartnersRepo>;
