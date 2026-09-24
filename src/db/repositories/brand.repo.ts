/**
 * PDF branding settings, per company.
 *
 * No row = original template: `get` then returns the defaults, never `null`. The
 * callers (PDF rendering included) therefore have no special case to handle, and
 * a company created before this screen prints as before.
 */

import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { companyBrandSettings } from "../schema.js";
import {
  DEFAULT_BRAND,
  normalizeBrand,
  type BrandFontFace,
  type BrandSettings,
  type FontMode,
  type LogoMode,
  type PatternMode,
} from "../../shared/brand.js";

export type { BrandSettings };

/** Font weights are stored as JSON; a corrupted value must break nothing. */
function parseFaces(json: string): Partial<BrandFontFace>[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Partial<BrandFontFace>[]) : [];
  } catch {
    return [];
  }
}

function rowTo(r: typeof companyBrandSettings.$inferSelect): BrandSettings {
  return normalizeBrand({
    logoMode: r.logoMode as LogoMode,
    logoImage: r.logoImage,
    logoHeightDmm: r.logoHeightDmm,
    showContact: r.showContact,
    patternMode: r.patternMode as PatternMode,
    patternText: r.patternText,
    patternColumns: r.patternColumns,
    patternOpacityPct: r.patternOpacityPct,
    patternSizeDmm: r.patternSizeDmm,
    showQuoteSignatures: r.showQuoteSignatures,
    fontMode: r.fontMode as FontMode,
    fontFamily: r.fontFamily,
    fontFaces: parseFaces(r.fontFacesJson) as BrandFontFace[],
  });
}

export function createBrandRepo(db: DB) {
  return {
    get(companyId: string): BrandSettings {
      const row = db
        .select()
        .from(companyBrandSettings)
        .where(eq(companyBrandSettings.companyId, companyId))
        .get();
      return row ? rowTo(row) : { ...DEFAULT_BRAND };
    },

    update(companyId: string, input: Partial<BrandSettings>): BrandSettings {
      const settings = normalizeBrand(input);
      const { fontFaces, ...scalars } = settings;
      const values = {
        companyId,
        ...scalars,
        fontFacesJson: JSON.stringify(fontFaces),
        updatedAt: new Date().toISOString(),
      };
      db.insert(companyBrandSettings)
        .values(values)
        .onConflictDoUpdate({ target: companyBrandSettings.companyId, set: values })
        .run();
      return settings;
    },

    /** Back to the original template: the row is deleted rather than filled with defaults. */
    reset(companyId: string): BrandSettings {
      db.delete(companyBrandSettings)
        .where(eq(companyBrandSettings.companyId, companyId))
        .run();
      return { ...DEFAULT_BRAND };
    },
  };
}

export type BrandRepo = ReturnType<typeof createBrandRepo>;
