/**
 * Zod schema for signatures. Validated on the main side before writing.
 */

import { z } from "zod";
import { safeSignatureImage } from "../signatures.js";

export const signatureInputSchema = z.object({
  associateId: z.string().nullish(),
  name: z.string().trim().min(1, "Le nom du signataire est obligatoire").max(200),
  role: z.string().trim().max(200).nullish(),
  image: z
    .string()
    .refine((v) => safeSignatureImage(v) !== null, "Image de signature invalide ou trop lourde"),
  isDefault: z.boolean().optional(),
});
