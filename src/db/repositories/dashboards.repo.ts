/**
 * Repository of custom dashboards, filtered by company_id.
 * The widgets are stored as JSON in a text column.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { dashboards } from "../schema.js";
import type { Dashboard, DashboardInput, DashboardWidget } from "../../shared/dashboards.js";
import { defaultDashboards } from "../../shared/dashboards.js";

export type { Dashboard, DashboardInput };

function rowTo(r: typeof dashboards.$inferSelect): Dashboard {
  let widgets: DashboardWidget[] = [];
  try {
    const parsed: unknown = JSON.parse(r.widgets);
    if (Array.isArray(parsed)) widgets = parsed as DashboardWidget[];
  } catch {
    widgets = [];
  }
  return { id: r.id, companyId: r.companyId, name: r.name, position: r.position, widgets, createdAt: r.createdAt };
}

export function createDashboardsRepo(db: DB) {
  const repo = {
    list(companyId: string): Dashboard[] {
      return db
        .select()
        .from(dashboards)
        .where(eq(dashboards.companyId, companyId))
        .orderBy(asc(dashboards.position), asc(dashboards.createdAt))
        .all()
        .map(rowTo);
    },

    get(companyId: string, id: string): Dashboard | null {
      const row = db
        .select()
        .from(dashboards)
        .where(and(eq(dashboards.companyId, companyId), eq(dashboards.id, id)))
        .get();
      return row ? rowTo(row) : null;
    },

    create(companyId: string, input: DashboardInput): Dashboard {
      const id = randomUUID();
      const position = input.position ?? repo.list(companyId).length;
      db.insert(dashboards)
        .values({ id, companyId, name: input.name, position, widgets: JSON.stringify(input.widgets ?? []) })
        .run();
      return repo.get(companyId, id)!;
    },

    update(companyId: string, id: string, input: Partial<DashboardInput>): Dashboard {
      const set: Partial<typeof dashboards.$inferInsert> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.position !== undefined) set.position = input.position;
      if (input.widgets !== undefined) set.widgets = JSON.stringify(input.widgets);
      db.update(dashboards)
        .set(set)
        .where(and(eq(dashboards.companyId, companyId), eq(dashboards.id, id)))
        .run();
      const row = repo.get(companyId, id);
      if (!row) throw new Error("Tableau de bord introuvable");
      return row;
    },

    remove(companyId: string, id: string): { ok: true } {
      db.delete(dashboards)
        .where(and(eq(dashboards.companyId, companyId), eq(dashboards.id, id)))
        .run();
      return { ok: true } as const;
    },

    /** Lists, first creating the 3 default dashboards if the company has none. */
    listOrSeed(companyId: string): Dashboard[] {
      const existing = repo.list(companyId);
      if (existing.length > 0) return existing;
      defaultDashboards().forEach((d, i) => {
        db.insert(dashboards)
          .values({ id: randomUUID(), companyId, name: d.name, position: i, widgets: JSON.stringify(d.widgets) })
          .run();
      });
      return repo.list(companyId);
    },
  };

  return repo;
}

export type DashboardsRepo = ReturnType<typeof createDashboardsRepo>;
