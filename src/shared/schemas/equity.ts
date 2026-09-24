/**
 * Zod schema of a company's equity. Validated on the main side before writing.
 */

import { z } from "zod";

export const companyEquitySchema = z.object({
  shareCapital: z.number().int(),
  reserves: z.number().int(),
  retainedEarnings: z.number().int(),
  nonDeductibleCharges: z.number().int(),
  managerSalary: z.number().int(),
  dividends: z.number().int(),
});
