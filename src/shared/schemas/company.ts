/**
 * Zod validation schemas for companies. Used on the main side before writing to the DB.
 */

import { z } from "zod";

export const legalFormSchema = z.enum([
  "raison_individuelle",
  "societe_simple",
  "snc",
  "sarl",
  "sa",
  "association",
]);

export const companyInputSchema = z.object({
  name: z.string().min(1, "La raison sociale est obligatoire").max(200),
  legalForm: legalFormSchema,
  ideNumber: z
    .string()
    .regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/, "Format IDE attendu : CHE-123.456.789")
    .nullish(),
  vatNumber: z.string().nullish(),
  rcRegistered: z.boolean().optional(),
  accountingMode: z.enum(["simple", "double"]).optional(),
  shareCapital: z.number().int().nonnegative().nullish(),
  defaultCurrency: z.string().length(3).optional(),
  color: z.string().nullish(),
  // Contact details printed on the documents. Without these keys, zod would drop them.
  rcNumber: z.string().max(50).nullish(),
  email: z.string().max(200).nullish(),
  phone: z.string().max(50).nullish(),
  website: z.string().max(200).nullish(),
  street: z.string().max(200).nullish(),
  buildingNumber: z.string().max(20).nullish(),
  zip: z.string().max(16).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(2).nullish(),
  logoText: z.string().max(60).nullish(),
});

export const companyVatSettingsSchema = z.object({
  companyId: z.string().min(1),
  isVatSubject: z.boolean(),
  periodType: z.enum(["quarterly", "semestrial", "annual"]),
  method: z.enum(["effective", "tdfn"]),
  accountingBasis: z.enum(["agreed", "received"]),
});

export const convertLegalFormSchema = z.object({
  companyId: z.string().min(1),
  toForm: legalFormSchema,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : YYYY-MM-DD"),
  note: z.string().nullish(),
});

export type CompanyInputValidated = z.infer<typeof companyInputSchema>;
export type ConvertLegalFormInput = z.infer<typeof convertLegalFormSchema>;
