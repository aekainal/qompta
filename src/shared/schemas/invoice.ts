/**
 * Zod schemas for invoices, third parties and accounts. Validated on the main side before writing.
 */

import { z } from "zod";

export const thirdPartyInputSchema = z.object({
  kind: z.enum(["client", "supplier", "both"]),
  entityType: z.enum(["company", "person"]).optional(),
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  email: z.string().email("E-mail invalide").nullish().or(z.literal("")),
  phone: z.string().nullish(),
  vatNumber: z.string().nullish(),
  rcNumber: z.string().max(50).nullish(),
  notes: z.string().nullish(),
  // Structured address: carried over onto the documents and required by the QR-bill.
  // Any key missing from here would be silently dropped by zod.
  addressLine2: z.string().max(200).nullish(),
  street: z.string().max(200).nullish(),
  buildingNumber: z.string().max(20).nullish(),
  zip: z.string().max(16).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(2).nullish(),
});

export const associateInputSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  shareBps: z.number().int().min(0).max(10000),
  role: z.string().nullish(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const accountCategoryInputSchema = z.object({
  code: z.string().min(1).max(20),
  label: z.string().min(1).max(200),
  kind: z.enum(["product", "expense", "asset", "liability", "equity"]),
  defaultVatCode: z.string().nullish(),
  isInvestment: z.boolean().optional(),
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : YYYY-MM-DD");

export const invoiceInputSchema = z.object({
  type: z.enum(["sale", "purchase"]),
  number: z.string().nullish(),
  issueDate: dateStr,
  dueDate: dateStr.nullish(),
  thirdPartyId: z.string().nullish(),
  description: z.string().nullish(),
  categoryId: z.string().nullish(),
  treatment: z.enum([
    "standard",
    "exempt_export",
    "foreign",
    "excluded",
    "discount",
    "input_material",
    "input_investment",
    "subsidy",
    "donation",
  ]),
  rate: z.enum(["normal", "reduced", "lodging", "zero"]),
  enteredAs: z.enum(["ht", "ttc"]),
  enteredAmount: z.number().int(),
  vatAmountOverride: z.number().int().nonnegative().nullish(),
  currency: z.string().length(3).optional(),
  fxRate: z.number().int().positive().nullish(),
  vatCodeOverride: z.string().nullish(),
  status: z.enum(["draft", "issued", "paid", "partial", "overdue", "settled_vat"]).optional(),
  paymentDate: dateStr.nullish(),
  notes: z.string().nullish(),
});

export const invoiceFiltersSchema = z.object({
  type: z.enum(["sale", "purchase"]).optional(),
  status: z.enum(["draft", "issued", "paid", "partial", "overdue", "settled_vat"]).optional(),
  issueRanges: z.array(z.object({ from: dateStr, to: dateStr })).optional(),
  thirdPartyId: z.string().optional(),
  vatCode: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  sortBy: z.enum(["issueDate", "amountTtc", "number", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});
