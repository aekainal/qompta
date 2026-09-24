/**
 * Repository of custom dashboards: seeding of the defaults, round-trip of the
 * widgets (JSON), isolation per company.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createCompaniesRepo } from "../src/db/repositories/companies.repo.js";
import { createDashboardsRepo } from "../src/db/repositories/dashboards.repo.js";
import type { DashboardWidget } from "../src/shared/dashboards.js";
import { widgetsOverlap } from "../src/shared/dashboards.js";
import { createTestDb } from "./helpers/test-db.js";
import type { DB } from "../src/db/client.js";

let db: DB;
beforeEach(() => {
  db = createTestDb();
});

describe("dashboards repo", () => {
  it("crée les 3 tableaux par défaut au premier accès (listOrSeed), idempotent", () => {
    const companies = createCompaniesRepo(db);
    const repo = createDashboardsRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });

    const seeded = repo.listOrSeed(c.id);
    expect(seeded.map((d) => d.name)).toEqual(["Vue d'ensemble", "Finances", "Commercial"]);
    expect(seeded[0].widgets.length).toBeGreaterThan(0);
    // A second call recreates nothing.
    expect(repo.listOrSeed(c.id)).toHaveLength(3);
  });

  it("crée, modifie les widgets (round-trip JSON) et supprime", () => {
    const companies = createCompaniesRepo(db);
    const repo = createDashboardsRepo(db);
    const c = companies.create({ name: "C", legalForm: "sarl" });

    const w1: DashboardWidget = { id: "w1", kind: "kpi", metric: "result", chart: null, custom: null, x: 0, y: 0, w: 3, h: 2 };
    const d = repo.create(c.id, { name: "Perso", widgets: [w1] });
    expect(d.widgets).toEqual([w1]);

    const up = repo.update(c.id, d.id, {
      widgets: [{ id: "w2", kind: "chart", chart: "top_clients", metric: null, custom: null, x: 3, y: 0, w: 6, h: 6 }],
    });
    expect(up.widgets[0].chart).toBe("top_clients");
    expect(up.widgets[0].w).toBe(6);

    repo.remove(c.id, d.id);
    expect(repo.get(c.id, d.id)).toBeNull();
  });

  it("détecte le chevauchement de widgets (collisions)", () => {
    const a = { x: 0, y: 0, w: 3, h: 2 };
    expect(widgetsOverlap(a, { x: 2, y: 1, w: 3, h: 2 })).toBe(true); // overlaps
    expect(widgetsOverlap(a, { x: 3, y: 0, w: 3, h: 2 })).toBe(false); // adjacent on the right
    expect(widgetsOverlap(a, { x: 0, y: 2, w: 3, h: 2 })).toBe(false); // adjacent below
    expect(widgetsOverlap(a, { x: 5, y: 5, w: 2, h: 2 })).toBe(false); // elsewhere
  });

  it("isole les tableaux par société", () => {
    const companies = createCompaniesRepo(db);
    const repo = createDashboardsRepo(db);
    const a = companies.create({ name: "A", legalForm: "sarl" });
    const b = companies.create({ name: "B", legalForm: "sarl" });
    repo.listOrSeed(a.id);
    expect(repo.list(b.id)).toHaveLength(0);
  });
});
