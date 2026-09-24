/**
 * PDF document branding (quotes, invoices, contracts), per company.
 *
 * Each company picks its own logo, color and decorative pattern.
 * **The default values reproduce the QWASAR template exactly**: a company that
 * has never opened the branding screen prints today what it printed
 * yesterday, to the millimeter. All the fine geometry (margins, columns,
 * usable band) stays in `theme.ts`: it is not negotiable, the QR-bill
 * depends on it.
 *
 * Lengths in **tenths of a millimeter** (integers): same rule as amounts in
 * cents, never a float in the database.
 */

/** Logo printed in the top left corner. */
export type LogoMode = "text" | "image" | "none";

/** Decorative pattern along the right edge (the QWASAR « Q »s). */
export type PatternMode = "letters" | "none";

/**
 * Document font.
 *
 *  - `inter`  : Inter, embedded in the app (QWASAR template, guaranteed rendering);
 *  - `custom` : files supplied by the company, embedded in the database — the PDF
 *    then prints identically everywhere, including offline;
 *  - `system` : font installed on the machine, referenced by its name. Simpler,
 *    but the rendering depends on the workstation: if the font is missing, the
 *    document falls back to Inter without warning.
 */
export type FontMode = "inter" | "custom" | "system";

/** One weight of a custom font, embedded as a data-URI. */
export interface BrandFontFace {
  /** 100 to 900. The template uses 400 (text), 700 (bold) and 900 (logo). */
  weight: number;
  style: "normal" | "italic";
  /** Font file as a data-URI. */
  data: string;
  /** Original file name, shown in the settings screen. */
  name: string;
}

export interface BrandSettings {
  logoMode: LogoMode;
  /** Logo image as a data-URI (`image` mode). */
  logoImage: string | null;
  /** Logo height in tenths of a mm — font size in text mode. */
  logoHeightDmm: number;
  /** Contact line (e-mail) below the logo. */
  showContact: boolean;
  patternMode: PatternMode;
  /** Character(s) repeated in the pattern. */
  patternText: string;
  /**
   * Number of pattern columns (1 to 5; 3 on the QWASAR template).
   *
   * This is not just a decorative detail: the band occupies the right edge of
   * the sheet and the text column is aligned right next to it. Changing this
   * number therefore moves the right margin of the whole document — see
   * `contentRightMm` in theme.ts.
   */
  patternColumns: number;
  patternOpacityPct: number;
  /** Pattern font size in tenths of a mm. */
  patternSizeDmm: number;
  /** « Date and signature » blocks at the bottom of quotes. */
  showQuoteSignatures: boolean;
  fontMode: FontMode;
  /** System font name (`system` mode), e.g. « Poppins ». */
  fontFamily: string;
  /** Embedded weights (`custom` mode). */
  fontFaces: BrandFontFace[];
}

/** Original QWASAR template. Do not change without revisiting `theme.ts`. */
export const DEFAULT_BRAND: BrandSettings = {
  logoMode: "text",
  logoImage: null,
  logoHeightDmm: 105,
  showContact: true,
  patternMode: "letters",
  patternText: "Q",
  patternColumns: 3,
  patternOpacityPct: 40,
  patternSizeDmm: 42,
  showQuoteSignatures: true,
  fontMode: "inter",
  fontFamily: "",
  fontFaces: [],
};

/** Input bounds: beyond them the layout breaks (header too tall…). */
export const BRAND_LIMITS = {
  logoHeightDmm: { min: 30, max: 300 },
  patternSizeDmm: { min: 10, max: 150 },
  patternOpacityPct: { min: 0, max: 100 },
  /** Beyond 5 columns, the band would eat into the text column. */
  patternColumns: { min: 1, max: 5 },
  patternTextMaxLength: 3,
  /** Maximum size of an imported logo (data-URI), in bytes. */
  logoImageBytes: 2 * 1024 * 1024,
  /** Maximum size of a font file, in bytes. */
  fontFileBytes: 4 * 1024 * 1024,
  /** One weight per template usage (text, bold, logo), italics included. */
  maxFontFaces: 6,
} as const;

function clamp(value: number, { min, max }: { min: number; max: number }, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Accepts only an image as a data-URI.
 *
 * The value goes as is into the `src` of an `<img>` tag of the printed HTML:
 * an `http(s)` URL would take the rendering online (and fail), and anything
 * that is not an image has no business being there.
 */
export function safeLogoImage(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(value)
    ? value.replace(/\s+/g, "")
    : null;
}

/**
 * Accepts only a « reasonable » font name.
 *
 * The value goes into a `font-family` declaration of the printed CSS: anything
 * that looks like CSS punctuation (brace, semicolon, quote) is rejected
 * rather than escaped.
 */
export function safeFontFamily(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim().slice(0, 64);
  return /^[A-Za-zÀ-ÿ0-9 ._-]+$/.test(trimmed) ? trimmed : "";
}

/** Accepts only a font file as a data-URI. */
export function safeFontData(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^data:(font\/(ttf|otf|woff|woff2)|application\/(x-)?font-(ttf|otf|woff|woff2)|application\/octet-stream);base64,[a-z0-9+/=\s]+$/i.test(
    value,
  )
    ? value.replace(/\s+/g, "")
    : null;
}

/** Cleans up a weight: valid data, weight within 100–900, known style. */
function normalizeFace(face: Partial<BrandFontFace> | null | undefined): BrandFontFace | null {
  const data = safeFontData(face?.data);
  if (!data) return null;
  const weight = clamp(face?.weight ?? 400, { min: 100, max: 900 }, 400);
  return {
    data,
    weight,
    style: face?.style === "italic" ? "italic" : "normal",
    name: (face?.name ?? "police").slice(0, 120),
  };
}

/**
 * Completes and bounds partial settings (missing database row, out-of-range
 * values, unknown fields) to get settings safe to inject into the CSS.
 */
export function normalizeBrand(input: Partial<BrandSettings> | null | undefined): BrandSettings {
  const b = input ?? {};
  const logoMode: LogoMode =
    b.logoMode === "image" || b.logoMode === "none" ? b.logoMode : DEFAULT_BRAND.logoMode;
  const logoImage = safeLogoImage(b.logoImage);
  const patternText = (b.patternText ?? DEFAULT_BRAND.patternText)
    .slice(0, BRAND_LIMITS.patternTextMaxLength)
    .trim();

  return {
    // An « image » mode with no image would print an empty header: fall back to text.
    logoMode: logoMode === "image" && !logoImage ? "text" : logoMode,
    logoImage,
    logoHeightDmm: clamp(
      b.logoHeightDmm ?? DEFAULT_BRAND.logoHeightDmm,
      BRAND_LIMITS.logoHeightDmm,
      DEFAULT_BRAND.logoHeightDmm,
    ),
    showContact: b.showContact ?? DEFAULT_BRAND.showContact,
    patternMode: b.patternMode === "none" ? "none" : DEFAULT_BRAND.patternMode,
    // An empty pattern would draw nothing yet take the space: better to drop it.
    patternText: patternText || DEFAULT_BRAND.patternText,
    patternOpacityPct: clamp(
      b.patternOpacityPct ?? DEFAULT_BRAND.patternOpacityPct,
      BRAND_LIMITS.patternOpacityPct,
      DEFAULT_BRAND.patternOpacityPct,
    ),
    patternSizeDmm: clamp(
      b.patternSizeDmm ?? DEFAULT_BRAND.patternSizeDmm,
      BRAND_LIMITS.patternSizeDmm,
      DEFAULT_BRAND.patternSizeDmm,
    ),
    patternColumns: clamp(
      b.patternColumns ?? DEFAULT_BRAND.patternColumns,
      BRAND_LIMITS.patternColumns,
      DEFAULT_BRAND.patternColumns,
    ),
    showQuoteSignatures: b.showQuoteSignatures ?? DEFAULT_BRAND.showQuoteSignatures,
    ...normalizeFont(b),
  };
}

/**
 * Font: a mode that cannot be honored falls back to Inter, never to a document
 * without a readable font.
 */
function normalizeFont(b: Partial<BrandSettings>): Pick<BrandSettings, "fontMode" | "fontFamily" | "fontFaces"> {
  const fontFamily = safeFontFamily(b.fontFamily);
  const fontFaces = (b.fontFaces ?? [])
    .map(normalizeFace)
    .filter((f): f is BrandFontFace => f !== null)
    .slice(0, BRAND_LIMITS.maxFontFaces);

  let fontMode: FontMode =
    b.fontMode === "custom" || b.fontMode === "system" ? b.fontMode : "inter";
  if (fontMode === "custom" && fontFaces.length === 0) fontMode = "inter";
  if (fontMode === "system" && !fontFamily) fontMode = "inter";

  return { fontMode, fontFamily, fontFaces };
}

/** Tenths of a mm -> mm, for the CSS. */
export function dmmToMm(dmm: number): number {
  return dmm / 10;
}
