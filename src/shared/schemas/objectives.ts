/**
 * Zod schema of the targets. Validated on the main side before writing.
 */

import { z } from "zod";
import { METRIC_CATALOG, type ObjectiveMetric } from "../objectives.js";

const metricKeys = METRIC_CATALOG.map((m) => m.key) as [ObjectiveMetric, ...ObjectiveMetric[]];

export const objectiveInputSchema = z.object({
  metric: z.enum(metricKeys),
  periodType: z.enum(["year", "quarter", "month"]),
  periodYear: z.number().int().min(2000).max(2100),
  periodQuarter: z.number().int().min(1).max(4).nullish(),
  periodMonth: z.number().int().min(1).max(12).nullish(),
  // Target in cents / units / basis points — always an integer and positive.
  targetValue: z.number().int().positive("La cible doit être supérieure à zéro"),
  direction: z.enum(["at_least", "at_most"]).optional(),
  label: z.string().max(200).nullish(),
});
