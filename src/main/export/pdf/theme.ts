/**
 * QWASAR visual identity for PDF documents (quotes, invoices, contracts).
 *
 * Reproduces the existing quote template: Inter, logo in Inter Black uppercase,
 * band of semi-transparent «Q» (40 %) along the right edge, tables
 * Description / Qty. / Unit price / Gross total.
 *
 * Fonts are embedded as base64 in the HTML: rendering goes through an offscreen
 * BrowserWindow which has no access to system fonts, and the app must work
 * 100 % offline.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BRAND, dmmToMm, type BrandSettings } from "../../../shared/brand.js";

/**
 * Default brand color, taken from the existing Qwasar quotes.
 * It dresses the logo, the contact e-mail and the Q band; everything else in
 * the document stays black. Overridable per company (`companies.color`).
 */
export const DEFAULT_BRAND_COLOR = "#3b82f6";

/** Accepts a hexadecimal color only (the CSS is injected into the HTML). */
export function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : DEFAULT_BRAND_COLOR;
}

/** Template geometry, in millimetres (A4 page 210 × 297). */
export const LAYOUT = {
  pageWidth: 210,
  /** Left margin of the content (42 pt on the original template). */
  marginLeft: 14.8,
  /**
   * Right edge of the content. Set ~2.4 mm from the 1st Q column (measured at
   * 190.9 mm): the text must run close along the band.
   */
  contentRight: 188.5,
  marginTop: 14,
  marginBottom: 16,
  /** X position of the Q band. */
  qBandLeft: 197,
  /** Inset of the band from the right edge, in Q widths. */
  qBandInsetQ: 1.5,
  /** Number of Q columns, tight against one another. */
  qBandColumns: 3,
  /** Q font size (the original template had a single one, three times bigger). */
  qBandFontSize: 4.2,
  /** Vertical step between two Q. */
  qBandStep: 5.1,
} as const;

/**
 * Width of one pattern column, taken from the original template (13 mm for
 * three columns). It is the unit of measure for everything below: adding a
 * column widens the band by exactly this value, and narrows the text column
 * by as much.
 */
export const Q_COLUMN_WIDTH = (LAYOUT.pageWidth - LAYOUT.qBandLeft) / LAYOUT.qBandColumns;
/** Offset of the band towards the inside of the sheet. */
const Q_BAND_INSET = LAYOUT.qBandInsetQ * Q_COLUMN_WIDTH;

/** Number of columns actually drawn (none if the pattern is turned off). */
export function patternColumns(brand: BrandSettings): number {
  return brand.patternMode === "none" ? 0 : brand.patternColumns;
}

/** Band width, in mm. */
export function patternBandWidthMm(brand: BrandSettings): number {
  return patternColumns(brand) * Q_COLUMN_WIDTH;
}

/**
 * Right edge of the text column, in mm.
 *
 * The original template sets the text ~4 mm from the first Q column. That gap
 * is kept whatever the number of columns: the right margin follows the band
 * width, column by column. Without a pattern the text could run to the edge —
 * it is held back at a right margin equal to the left one, so the page stays
 * balanced.
 *
 * At 3 columns (QWASAR default), the formula gives back exactly `LAYOUT.contentRight`.
 */
export function contentRightMm(brand: BrandSettings = DEFAULT_BRAND): number {
  const symmetric = LAYOUT.pageWidth - LAYOUT.marginLeft;
  const shifted =
    LAYOUT.contentRight + (LAYOUT.qBandColumns - patternColumns(brand)) * Q_COLUMN_WIDTH;
  return Math.min(symmetric, shifted);
}

/** Right margin of the sheet (complement of the text right edge), in mm. */
export function contentRightMarginMm(brand: BrandSettings = DEFAULT_BRAND): number {
  return LAYOUT.pageWidth - contentRightMm(brand);
}

const FONT_FILES = [
  { file: "inter-400-normal.woff2", weight: 400, style: "normal" },
  { file: "inter-400-italic.woff2", weight: 400, style: "italic" },
  { file: "inter-700-normal.woff2", weight: 700, style: "normal" },
  { file: "inter-700-italic.woff2", weight: 700, style: "italic" },
  { file: "inter-900-normal.woff2", weight: 900, style: "normal" },
] as const;

let fontCss: string | null = null;

/**
 * @font-face declarations with the Inter woff2 files as data-URI.
 * The folder is supplied by the caller (the main knows how to resolve dev vs packaged).
 */
export function interFontFaces(fontsDir: string): string {
  if (fontCss) return fontCss;
  fontCss = FONT_FILES.map(({ file, weight, style }) => {
    const b64 = readFileSync(join(fontsDir, file)).toString("base64");
    return `@font-face{font-family:Inter;font-weight:${weight};font-style:${style};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join("");
  return fontCss;
}

/**
 * Family name under which the supplied files are declared.
 * Fixed: it only appears in the document CSS, never on screen.
 */
const CUSTOM_FONT_FAMILY = "QomptaBrand";

/**
 * `@font-face` declarations for the fonts supplied by the company (`custom` mode).
 * They are embedded as data-URI, like Inter: the PDF must print identically on
 * any machine, offline.
 */
export function customFontFaces(brand: BrandSettings): string {
  if (brand.fontMode !== "custom") return "";
  return brand.fontFaces
    .map(
      (f) =>
        `@font-face{font-family:${CUSTOM_FONT_FAMILY};font-weight:${f.weight};font-style:${f.style};font-display:block;src:url(${f.data})}`,
    )
    .join("");
}

/**
 * `font-family` chain of the document.
 *
 * Inter always stays second: a missing weight in the supplied font, or a system
 * font absent from the machine, must not produce a document in the OS default
 * font — the template takes over.
 */
export function fontFamilyCss(brand: BrandSettings): string {
  if (brand.fontMode === "custom" && brand.fontFaces.length > 0) {
    return `${CUSTOM_FONT_FAMILY}, Inter, sans-serif`;
  }
  if (brand.fontMode === "system" && brand.fontFamily) {
    // The name is validated upstream (safeFontFamily): no quote, no CSS punctuation.
    return `"${brand.fontFamily}", Inter, sans-serif`;
  }
  return "Inter, sans-serif";
}

/** Escapes text bound for the HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes while keeping line breaks (free text: notes, articles). */
export function escMultiline(value: unknown): string {
  return esc(value).replace(/\r?\n/g, "<br>");
}

/**
 * Step / size ratio of the pattern, taken from the original template (5.1 / 4.2).
 * The step follows the size: enlarging the pattern must not cram the characters.
 */
const PATTERN_STEP_RATIO = LAYOUT.qBandStep / LAYOUT.qBandFontSize;

/** Pattern font size, in mm. */
export function patternSizeMm(brand: BrandSettings): number {
  return dmmToMm(brand.patternSizeDmm);
}

/** Vertical step of the pattern, in mm. */
export function patternStepMm(brand: BrandSettings): number {
  return patternSizeMm(brand) * PATTERN_STEP_RATIO;
}

/**
 * Decorative band on the right edge (Inter Black, semi-transparent) — the QWASAR
 * «Q» by default, any other character otherwise, or nothing at all.
 * Rendered in fixed position so it repeats identically on every printed page.
 */
export function qBand(brand: BrandSettings = DEFAULT_BRAND): string {
  if (brand.patternMode === "none") return "";
  const rows = Math.ceil(297 / patternStepMm(brand)) + 1;
  const cells = Array.from(
    { length: rows * patternColumns(brand) },
    () => `<span>${esc(brand.patternText)}</span>`,
  ).join("");
  return `<div class="qband" aria-hidden="true">${cells}</div>`;
}

/** Height of the standard QR payment part (bottom half of an A4). */
export const QR_PART_HEIGHT_MM = 105;

/**
 * Usable height of a page when the `thead` only holds the top margin spacer.
 * A document with a repeated header has a shorter band: it is then measured at
 * render time (see `htmlToPdfBuffer`).
 */
export const CONTENT_BAND_MM = 297 - LAYOUT.marginTop;

/**
 * Maximum height of a repeated header.
 *
 * Chromium stops replaying a table header beyond about a quarter of the page
 * (74 mm on A4): past that it only appears on the first page — silently.
 * Measured on a real render: 75.5 mm does not repeat, 62 mm does. A safety
 * margin is kept, and the render falls back to a first-page header only if the
 * measurement exceeds this threshold (over-long customer address).
 */
export const MAX_REPEATED_HEADER_MM = 70;

/**
 * Layout measured during a first render: number of pages, usable height of a
 * page (297 mm minus what the `thead` repeats) and whether the header actually
 * repeats.
 */
export interface DocumentLayout {
  pages: number;
  bandMm: number;
  /** Does the header fit within Chromium's repetition limit? */
  repeatHeader: boolean;
}

/**
 * Height to reserve for the content so that the QR payment part, which follows
 * it in the flow, lands at the bottom of the last of the `pages` pages.
 * `pages = 0` (measurement render) stretches nothing.
 */
export function qrFillMm(pages: number, bandMm = CONTENT_BAND_MM): number {
  if (pages <= 0) return 0;
  return Math.max(0, pages * bandMm - QR_PART_HEIGHT_MM);
}

/** Page layout options of a document. */
export interface PageOptions {
  /**
   * Removes the bottom margin of the sheet so the QR payment part touches the
   * edge. Invoices only: the space is taken back as content `padding`.
   */
  fullBleedBottom?: boolean;
  /** Number of pages of the document (QR-bill alignment). 0 = measurement render. */
  pages?: number;
  /** Usable height of a page, measured on the previous render. */
  bandMm?: number;
  /** Block repeated at the top of every page (quotes and invoices). */
  header?: string;
  /**
   * Shifts the Q band half a column towards the right edge, and paints it over
   * everything else — including the QR payment part, which its right margin
   * then crosses. Quotes and invoices only; contracts keep the original band.
   */
  documentQBand?: boolean;
  /** Branding of the issuing company. Default: QWASAR template. */
  brand?: BrandSettings;
}

/** Style sheet shared by every document. */
export function baseCss(
  fontsDir: string,
  brandColor = DEFAULT_BRAND_COLOR,
  opts: PageOptions = {},
): string {
  const bottomMargin = opts.fullBleedBottom ? 0 : LAYOUT.marginBottom;
  const brand = opts.brand ?? DEFAULT_BRAND;
  return `
${interFontFaces(fontsDir)}
${customFontFaces(brand)}

:root { --brand: ${safeColor(brandColor)}; }

/*
 * Sheet with no margin at all: Chromium CLIPS fixed-position elements to the
 * content area, so any @page margin would stop the Q band and the QR payment
 * part from reaching the physical edges.
 *
 * Content margins are restored another way:
 *  - horizontal: content padding (a left/right padding holds on every page);
 *  - vertical: spacer bands in the thead/tfoot of the wrapping table, which the
 *    print engine repeats on EVERY page. A top/bottom padding would apply only
 *    once and let the text stick to the edge from the 2nd page on.
 */
@page {
  size: A4;
  margin: 0;
}

/* Wrapping table: its header and footer bands create the vertical margins. */
table.sheet { width: 100%; border-collapse: collapse; }
table.sheet > thead > tr > td,
table.sheet > tfoot > tr > td,
table.sheet > tbody > tr > td { padding: 0; }
.v-space-top { height: ${LAYOUT.marginTop}mm; }
.v-space-bottom { height: ${bottomMargin}mm; }

*, *::before, *::after { box-sizing: border-box; }

/*
 * Width pinned to the sheet: the render window is also used to MEASURE the
 * repeated header (see htmlToPdfBuffer). Without this width the measurement
 * would depend on the window size and the header would wrap differently than
 * when printed.
 */
html { width: ${LAYOUT.pageWidth}mm; }

html, body {
  margin: 0;
  padding: 0;
  font-family: ${fontFamilyCss(brand)};
  font-weight: 400;
  color: #000;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}

/* ── Q band along the right edge ── */
/*
 * Band repeated on every printed page. When printing, Chromium positions a fixed
 * element against the WHOLE page (@page margins included): it is therefore simply
 * anchored to the edges, with no negative offset — which would send it off-sheet.
 */
.qband {
  position: fixed;
  top: 0;
  bottom: 0;
  right: ${(opts.documentQBand ? Q_BAND_INSET - Q_COLUMN_WIDTH / 2 : Q_BAND_INSET).toFixed(2)}mm;
  width: ${patternBandWidthMm(brand).toFixed(2)}mm;
  /* Tight columns (3 on the original template), filled row by row. */
  display: grid;
  grid-template-columns: repeat(${Math.max(1, patternColumns(brand))}, 1fr);
  align-content: start;
  overflow: hidden;
  /*
   * Quotes and invoices: the band goes ABOVE the content, otherwise the QR
   * payment part — opaque and full width — would break it at the bottom of the
   * page. It runs along the right edge, outside the text column, and hides none of it.
   */
  z-index: ${opts.documentQBand ? 3 : 0};
  pointer-events: none;
}
.qband span {
  font-weight: 900;
  font-size: ${patternSizeMm(brand).toFixed(2)}mm;
  line-height: ${patternStepMm(brand).toFixed(2)}mm;
  text-align: center;
  color: var(--brand);
  opacity: ${(brand.patternOpacityPct / 100).toFixed(2)};
  letter-spacing: 0;
}

/* ── Page ── */
.page {
  position: relative;
  z-index: 1;
  /*
   * Without a repeated header, the sheet is filled. With one, the usable band is
   * shorter: a fixed minimum height would spill onto a second page — it is then
   * the QR-bill alignment (content min-height) that fills the page.
   */
  min-height: ${opts.header ? 0 : 297 - LAYOUT.marginTop - bottomMargin}mm;
  padding-left: ${LAYOUT.marginLeft}mm;
  /* Follows the band width: the text stays set against it, never underneath. */
  padding-right: ${contentRightMarginMm(brand).toFixed(2)}mm;
  page-break-after: always;
}
.page:last-child { page-break-after: auto; }

/* ── Header repeated on every page (quotes, invoices) ── */
/*
 * It lives in the thead of the wrapping table: that is the only way to get a
 * per-page repetition when printing. It therefore carries the horizontal margins
 * itself, the .page padding applying to the body only.
 *
 * CONSTRAINT: Chromium stops repeating a table header beyond about a quarter of
 * the page (~74 mm on A4). All the geometry below is set to stay under that, top
 * margin spacer included — and the render checks the real height before printing
 * (see MAX_REPEATED_HEADER_MM).
 */
.doc-header {
  padding-left: ${LAYOUT.marginLeft}mm;
  padding-right: ${contentRightMarginMm(brand).toFixed(2)}mm;
  padding-bottom: 6mm;
}

/* ── Header ── */
.logo {
  font-weight: 900;
  font-size: ${dmmToMm(brand.logoHeightDmm).toFixed(2)}mm;
  line-height: 1;
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--brand);
}
.logo-contact { font-size: 3.4mm; margin-top: 1.8mm; color: var(--brand); }
/* Image logo: the height is imposed, the width follows the original ratio. */
.logo-img { display: block; height: ${dmmToMm(brand.logoHeightDmm).toFixed(2)}mm; width: auto; max-width: 90mm; }

.parties { display: flex; justify-content: space-between; gap: 10mm; margin-top: 6mm; }
.party { font-size: 3.9mm; line-height: 1.35; }
.party.client { text-align: right; }
.party .name { font-weight: 700; }

/* ── Document title ── */
.doc-title { margin-top: 9mm; font-size: 4.2mm; }
/* Quotes and invoices: the gap comes from the bottom padding of the repeated header. */
.doc-content > .doc-title:first-child { margin-top: 0; }
.doc-title strong { font-weight: 700; }

.remark { margin-top: 3mm; font-size: 3.5mm; font-style: italic; }
.remark b { font-weight: 700; font-style: italic; }

/* ── Service line tables ── */
/*
 * Each block is a standalone table; the wider gap separates them clearly.
 * Above all NO page-break-inside: avoid here: a 40-row table fits in no page,
 * and Chromium then pushed it whole to the next page — leaving the first one
 * nearly empty. Only the rows stay unbreakable.
 */
.section { margin-top: 7mm; }
.section + .section { margin-top: 10mm; }
.section-note { font-size: 3.5mm; font-weight: 700; margin-bottom: 2mm; }

table.items { width: 100%; border-collapse: collapse; }
table.items th {
  font-weight: 700;
  font-size: 3.5mm;
  text-align: left;
  padding: 0 0 1.4mm;
  border-bottom: .35mm solid #000;
}
table.items tr { break-inside: avoid; page-break-inside: avoid; }
table.items th.num, table.items td.num { text-align: right; }
table.items td { padding: 1.6mm 0; font-size: 3.2mm; vertical-align: top; }
table.items tr.item td { font-weight: 700; font-size: 3.2mm; }
/*
 * Included service lines: they read as the detail of the service line just
 * above, hence the italics and a very tight leading that groups them into a
 * block — without cramming them to the point of being unreadable.
 */
table.items tr.detail td { padding: .35mm 0; font-size: 2.8mm; font-style: italic; line-height: 1.15; }
table.items tr.detail td:first-child { padding-left: 0; }
/* The first of a series stands slightly apart from the line it details. */
table.items tr.item + tr.detail td { padding-top: 1mm; }
/* And the service line following a series of details gets its air back. */
table.items tr.detail + tr.item td { padding-top: 3mm; }
table.items tr.detail:last-child td { padding-bottom: 1.6mm; }
table.items col.c-desc { width: 62%; }
table.items col.c-qty  { width: 10%; }
table.items col.c-unit { width: 12%; }
table.items col.c-tot  { width: 16%; }

/* ── Totals ── */
.totals { margin-top: 6mm; display: flex; justify-content: flex-end; page-break-inside: avoid; }
.totals table { border-collapse: collapse; min-width: 70mm; }
.totals td { padding: 1.2mm 0 1.2mm 6mm; font-size: 3.5mm; text-align: right; }
.totals td:first-child { text-align: left; padding-left: 0; }
.totals tr.grand td { font-weight: 700; font-size: 4.2mm; border-top: .35mm solid #000; padding-top: 2mm; }

.vat-note { margin-top: 4mm; font-size: 3.5mm; }

/* ── Signatures ── */
/*
 * The rules are pushed to the bottom of their column (margin-top auto): the
 * labels do not have the same height — the customer's spans two lines — and a
 * plain fixed spacing offset the two signature rules from one another.
 */
.signatures {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 20mm;
  margin-top: 16mm;
  page-break-inside: avoid;
}
.signature {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 26mm;
  font-size: 3.5mm;
  font-weight: 700;
}
.signature .rule { margin-top: auto; border-top: .3mm solid #000; }

/* ── Contract ── */
.contract h1 { font-size: 4.2mm; font-weight: 700; margin: 0 0 5mm; }
/* Summary of the financial commitments, at the head of the contract. */
.commitments { margin-top: 5mm; page-break-inside: avoid; }
.commitments table { border-collapse: collapse; }
.commitments td { padding: 1.2mm 8mm 1.2mm 0; font-size: 3.5mm; }
.commitments td:last-child { font-weight: 700; padding-right: 0; }
.article { margin-top: 5mm; page-break-inside: avoid; }
.article h2 { font-size: 3.5mm; font-weight: 700; margin: 0 0 1.2mm; }
.article p { font-size: 3.5mm; line-height: 1.5; margin: 0; }
/* Typed sections of the contract builder (v1.20.0). */
.article .intro { margin-bottom: 1mm; }
.article ul, .article ol { margin: 1mm 0 0; padding-left: 6mm; font-size: 3.5mm; line-height: 1.5; }
.article li { margin: .4mm 0; break-inside: avoid; }
table.kv { width: 100%; border-collapse: collapse; margin-top: 1.5mm; }
table.kv th { font-size: 3.2mm; font-weight: 700; text-align: left; padding: 0 3mm 1.2mm 0; border-bottom: .3mm solid #000; }
table.kv td { font-size: 3.4mm; line-height: 1.4; padding: 1.2mm 3mm 1.2mm 0; vertical-align: top; border-bottom: .15mm solid #d0d0d0; }
table.kv td:first-child { width: 45%; font-weight: 700; }
table.kv tr { break-inside: avoid; page-break-inside: avoid; }
.part-heading { margin-top: 9mm; break-after: avoid; page-break-after: avoid; }
.part-heading .title { font-size: 4mm; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--brand); }
.part-heading .sub { font-size: 3.3mm; margin-top: 1mm; font-style: italic; }
.free-text { margin-top: 5mm; font-size: 3.5mm; line-height: 1.5; }
.callout { margin-top: 5mm; border-left: 1mm solid var(--brand); background: #f3f5f9; padding: 3mm 4mm; font-size: 3.5mm; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; }
.callout .title { font-weight: 700; margin-bottom: 1mm; }
.parties-text { margin-top: 6mm; font-size: 3.5mm; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; }
.parties-text p { margin: 0 0 1.5mm; }
.page-break { break-after: page; page-break-after: always; height: 0; }
.sign-block { margin-top: 10mm; break-inside: avoid; page-break-inside: avoid; }
.sign-block .signatures { margin-top: 6mm; }
.signature .sig-party { font-weight: 400; margin-top: .8mm; }
.signature .sig-mention { font-weight: 400; font-style: italic; margin-top: .8mm; }
.sig-slot { margin-top: auto; padding-top: 4mm; font-weight: 400; }
.sig-slot + .sig-slot { margin-top: 0; }
.sig-slot .rule { margin-top: 0; }
.sig-slot.blank .rule { margin-top: 14mm; }
.sig-img { display: block; max-height: 18mm; max-width: 60mm; margin-bottom: 1mm; object-fit: contain; }
.sig-name { font-weight: 700; margin-top: .8mm; }
.sig-role, .sig-caption { font-size: 3mm; margin-top: .4mm; }

/* ── QR payment part (invoice) ── */
/*
 * The payment part follows the content IN THE FLOW — and not in fixed position,
 * which would repeat it on every page and let the text run underneath. The
 * content before it is stretched to (page count × usable band − 105 mm) so that
 * it falls exactly at the bottom of the LAST page.
 *
 * The negative margins give it back the full width of the sheet; the negative
 * bottom margin takes a fraction of a millimetre off the flow, so that a
 * pagination rounding cannot cause an extra blank page — the payment part
 * itself is painted all the way to the physical edge.
 */
.qr-part {
  width: ${LAYOUT.pageWidth}mm;
  height: ${QR_PART_HEIGHT_MM}mm;
  margin-left: -${LAYOUT.marginLeft}mm;
  /* Must cancel the .page padding EXACTLY: the payment part is 210 mm on the
     dot, and any discrepancy would trigger a scaling that would make it
     non-compliant. Hence the same function on both sides. */
  margin-right: -${contentRightMarginMm(brand).toFixed(2)}mm;
  margin-bottom: -0.6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.qr-part svg { display: block; width: ${LAYOUT.pageWidth}mm; height: ${QR_PART_HEIGHT_MM}mm; }
.page.with-qr .doc-content { min-height: ${qrFillMm(opts.pages ?? 0, opts.bandMm).toFixed(2)}mm; }
`;
}

/** Complete HTML skeleton of a document. */
export function htmlDocument(
  title: string,
  fontsDir: string,
  body: string,
  brandColor = DEFAULT_BRAND_COLOR,
  opts: PageOptions = {},
): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${baseCss(fontsDir, brandColor, opts)}</style>
</head>
<body>${qBand(opts.brand ?? DEFAULT_BRAND)}
<table class="sheet">
<thead><tr><td><div class="v-space-top"></div>${opts.header ?? ""}</td></tr></thead>
<tbody><tr><td>${body}</td></tr></tbody>
<tfoot><tr><td><div class="v-space-bottom"></div></td></tr></tfoot>
</table>
</body>
</html>`;
}
