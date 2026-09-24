/**
 * Zod schema of a custom dashboard. Validated on the main side before writing.
 */

import { z } from "zod";
import { METRIC_CATALOG, type ObjectiveMetric } from "../objectives.js";
import { CHART_CATALOG, type ChartKind } from "../dashboards.js";

const metricKeys = METRIC_CATALOG.map((m) => m.key) as [ObjectiveMetric, ...ObjectiveMetric[]];
const chartKeys = [...CHART_CATALOG.map((c) => c.kind), "custom"] as unknown as [ChartKind, ...ChartKind[]];

const customSchema = z.object({
  type: z.enum(["bar", "line", "pie"]),
  dim: z.enum(["month", "product_category", "expense_category", "client", "quote_stage"]),
  metric: z.enum(metricKeys).nullish(),
});

const widgetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["kpi", "chart"]),
  metric: z.enum(metricKeys).nullish(),
  chart: z.enum(chartKeys).nullish(),
  custom: customSchema.nullish(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export const dashboardInputSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(80),
  position: z.number().int().nonnegative().optional(),
  widgets: z.array(widgetSchema).optional(),
});
