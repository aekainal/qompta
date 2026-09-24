/**
 * Zod schemas for quotes, contracts and bank details.
 * Validated on the main side before any write to the database.
 */

import { z } from "zod";
import { isIBANValid } from "swissqrbill/utils";
import { normalizeBlocks } from "../documents/contract-blocks.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue : YYYY-MM-DD");

// ───────────────────────────── Bank details ─────────────────────────────

export const bankAccountInputSchema = z.object({
  label: z.string().min(1, "Le libellé est obligatoire").max(100),
  iban: z
    .string()
    .min(1, "L'IBAN est obligatoire")
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine(isIBANValid, "IBAN invalide (clé de contrôle incorrecte)"),
  holderName: z.string().max(70).nullish(),
  bankName: z.string().max(100).nullish(),
  bic: z.string().max(11).nullish(),
  currency: z.string().length(3).optional(),
  isDefault: z.boolean().optional(),
});

// ───────────────────────────── Quotes ─────────────────────────────

export const documentLineSchema = z.object({
  kind: z.enum(["section", "item", "detail"]),
  label: z.string().min(1, "Le libellé d'une ligne est obligatoire").max(300),
  /** Quantity ×1000: 1 = 1000. */
  qtyMilli: z.number().int().min(0).default(1000),
  unitPriceHt: z.number().int().default(0),
  vatRateBps: z.number().int().min(0).max(10000).default(0),
});

export const quoteStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "refused",
  "expired",
  "invoiced",
]);

export const quoteInputSchema = z
  .object({
    number: z.string().max(30).nullish(),
    issueDate: dateStr,
    validUntil: dateStr.nullish(),
    thirdPartyId: z.string().nullish(),
    title: z.string().max(300).nullish(),
    status: quoteStatusSchema.optional(),
    currency: z.string().length(3).optional(),
    vatNote: z.string().max(500).nullish(),
    notes: z.string().max(5000).nullish(),
    bankAccountId: z.string().nullish(),
    signatureId: z.string().max(64).nullish(),
    lines: z.array(documentLineSchema).min(1, "Un devis doit comporter au moins une ligne"),
  })
  .refine((q) => !q.validUntil || q.validUntil >= q.issueDate, {
    message: "La date de validité ne peut pas précéder la date du devis",
    path: ["validUntil"],
  })
  .refine((q) => q.lines.some((l) => l.kind === "item"), {
    message: "Un devis doit comporter au moins une prestation facturable",
    path: ["lines"],
  });

export const quoteFiltersSchema = z.object({
  status: quoteStatusSchema.optional(),
  thirdPartyId: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  search: z.string().optional(),
});

// ───────────────────────────── Contracts ─────────────────────────────

/**
 * Contract sections. The detailed shape is guaranteed by `normalizeBlocks`
 * (lenient, bounded reading); here we check what would make a contract wrong:
 * an article without a title.
 */
export const contractBlocksSchema = z
  .array(z.record(z.unknown()))
  .max(500, "Un contrat ne peut pas dépasser 500 sections")
  .transform((raw) => normalizeBlocks(raw))
  .refine((blocks) => blocks.every((b) => b.type !== "article" || b.title.trim() !== ""), {
    message: "Chaque article doit avoir un titre",
  });

export const contractStatusSchema = z.enum(["draft", "sent", "signed", "terminated"]);

export const contractInputSchema = z
  .object({
    number: z.string().max(30).nullish(),
    thirdPartyId: z.string().nullish(),
    quoteId: z.string().nullish(),
    title: z.string().max(300).nullish(),
    status: contractStatusSchema.optional(),
    issueDate: dateStr,
    startDate: dateStr.nullish(),
    endDate: dateStr.nullish(),
    minDurationMonths: z.number().int().min(0).max(600).nullish(),
    noticeDays: z.number().int().min(0).max(3650).nullish(),
    oneOffAmountHt: z.number().int().min(0).nullish(),
    monthlyAmountHt: z.number().int().min(0).nullish(),
    vatRateBps: z.number().int().min(0).max(10000).optional(),
    blocks: contractBlocksSchema,
    signedDate: dateStr.nullish(),
    signedPlace: z.string().max(100).nullish(),
    terminatedDate: dateStr.nullish(),
    notes: z.string().max(5000).nullish(),
  })
  .refine((c) => !c.endDate || !c.startDate || c.endDate >= c.startDate, {
    message: "La date de fin ne peut pas précéder la date de début",
    path: ["endDate"],
  })
  .refine((c) => c.status !== "signed" || !!c.signedDate, {
    message: "Un contrat signé doit porter sa date de signature",
    path: ["signedDate"],
  });

export const contractTemplateInputSchema = z.object({
  name: z.string().min(1, "Le nom du modèle est obligatoire").max(200),
  blocks: contractBlocksSchema,
  isDefault: z.boolean().optional(),
});
