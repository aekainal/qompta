/**
 * Zod schema of fund contributions. Validated on the main side before writing.
 */

import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : YYYY-MM-DD");

export const fundContributionInputSchema = z.object({
  associateId: z.string().nullish(),
  associateName: z.string().min(1, "L'associé est obligatoire").max(200),
  date: dateStr,
  kind: z.enum(["capital", "current_account", "repayment"]),
  // The direction of the movement comes from `kind`: the amount stays always positive.
  amount: z.number().int().positive("Le montant doit être supérieur à zéro"),
  method: z.enum(["bank", "cash"]).optional(),
  bankAccountId: z.string().nullish(),
  reference: z.string().max(200).nullish(),
  notes: z.string().nullish(),
});
