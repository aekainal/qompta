/**
 * Zod schema of the PDF branding. Validated on the main side before writing.
 * Fine-grained clamping (out-of-range values, dubious data-URI) stays in
 * `normalizeBrand`: one source of truth, shared by the DB and the rendering.
 */

import { z } from "zod";
import { BRAND_LIMITS } from "../brand.js";

export const brandSettingsSchema = z.object({
  logoMode: z.enum(["text", "image", "none"]),
  logoImage: z.string().max(BRAND_LIMITS.logoImageBytes * 2).nullish(),
  logoHeightDmm: z.number().int(),
  showContact: z.boolean(),
  patternMode: z.enum(["letters", "none"]),
  patternText: z.string().max(BRAND_LIMITS.patternTextMaxLength),
  patternColumns: z.number().int(),
  patternOpacityPct: z.number().int(),
  patternSizeDmm: z.number().int(),
  showQuoteSignatures: z.boolean(),
  fontMode: z.enum(["inter", "custom", "system"]),
  fontFamily: z.string().max(64),
  fontFaces: z
    .array(
      z.object({
        weight: z.number().int(),
        style: z.enum(["normal", "italic"]),
        // The data-URI itself is validated by safeFontData (normalizeBrand).
        data: z.string().max(BRAND_LIMITS.fontFileBytes * 2),
        name: z.string().max(120),
      }),
    )
    .max(BRAND_LIMITS.maxFontFaces),
});
