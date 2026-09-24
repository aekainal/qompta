/**
 * Zod schema of a cash reconciliation. Validated on the main side before writing.
 */

import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : YYYY-MM-DD");

export const cashReconciliationInputSchema = z.object({
  date: dateStr,
  // The actual balance can be negative (overdrawn account): signed integer, no bound.
  balance: z.number().int(),
  note: z.string().max(200).nullish(),
});
