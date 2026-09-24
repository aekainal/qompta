/**
 * Management targets repository, filtered by company_id.
 * Actual progress is not here: it is computed from the data
 * (see dashboard.repo → objectivesProgress).
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { objectives } from "../schema.js";
import type {
  Objective,
  ObjectiveDirection,
  ObjectiveInput,
  ObjectiveMetric,
  ObjectivePeriodType,
} from "../../shared/objectives.js";
import { metricDef } from "../../shared/objectives.js";

function rowTo(row: typeof objectives.$inferSelect): Objective {
  return {
    id: row.id,
    companyId: row.companyId,
    metric: row.metric as ObjectiveMetric,
    periodType: row.periodType as ObjectivePeriodType,
    periodYear: row.periodYear,
    periodQuarter: row.periodQuarter,
    periodMonth: row.periodMonth,
    targetValue: row.targetValue,
    direction: row.direction as ObjectiveDirection,
    label: row.label,
    createdAt: row.createdAt,
  };
}

/** Normalises the period fields for the chosen type (no quarter on a year…). */
function periodFields(input: Pick<ObjectiveInput, "periodType" | "periodQuarter" | "periodMonth">) {
  return {
    periodQuarter: input.periodType === "quarter" ? (input.periodQuarter ?? 1) : null,
    periodMonth: input.periodType === "month" ? (input.periodMonth ?? 1) : null,
  };
}

export function createObjectivesRepo(db: DB) {
  return {
    list(companyId: string): Objective[] {
      return db
        .select()
        .from(objectives)
        .where(eq(objectives.companyId, companyId))
        .orderBy(desc(objectives.periodYear), objectives.metric)
        .all()
        .map(rowTo);
    },

    create(companyId: string, input: ObjectiveInput): Objective {
      const id = randomUUID();
      db.insert(objectives)
        .values({
          id,
          companyId,
          metric: input.metric,
          periodType: input.periodType,
          periodYear: input.periodYear,
          ...periodFields(input),
          targetValue: input.targetValue,
          // Default direction = metric's natural one (revenue floor, expense ceiling).
          direction: input.direction ?? metricDef(input.metric).defaultDirection,
          label: input.label?.trim() || null,
        })
        .run();
      return rowTo(db.select().from(objectives).where(eq(objectives.id, id)).get()!);
    },

    update(companyId: string, id: string, patch: Partial<ObjectiveInput>): Objective {
      const periods =
        patch.periodType !== undefined
          ? periodFields({
              periodType: patch.periodType,
              periodQuarter: patch.periodQuarter ?? null,
              periodMonth: patch.periodMonth ?? null,
            })
          : {};
      db.update(objectives)
        .set({
          ...(patch.metric !== undefined ? { metric: patch.metric } : {}),
          ...(patch.periodType !== undefined ? { periodType: patch.periodType, ...periods } : {}),
          ...(patch.periodYear !== undefined ? { periodYear: patch.periodYear } : {}),
          ...(patch.targetValue !== undefined ? { targetValue: patch.targetValue } : {}),
          ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
          ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}),
        })
        .where(and(eq(objectives.companyId, companyId), eq(objectives.id, id)))
        .run();
      return rowTo(db.select().from(objectives).where(eq(objectives.id, id)).get()!);
    },

    delete(companyId: string, id: string): { ok: true } {
      db.delete(objectives)
        .where(and(eq(objectives.companyId, companyId), eq(objectives.id, id)))
        .run();
      return { ok: true };
    },
  };
}

export type ObjectivesRepo = ReturnType<typeof createObjectivesRepo>;
