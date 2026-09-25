/**
 * Builds the HTML of a quote or an invoice, using the QWASAR template.
 * The HTML is then converted to PDF by `printToPDF` (see render.ts).
 */

import { formatChf as chf } from "../../../shared/money.js";
import { documentTotals, lineTotals, type DocumentLine } from "../../../shared/documents/totals.js";
import { DEFAULT_BRAND, type BrandSettings } from "../../../shared/brand.js";
import { safeSignatureImage } from "../../../shared/signatures.js";
import { esc, escMultiline, htmlDocument, safeColor, type DocumentLayout } from "./theme.js";

/** A party on the document (issuer or customer). */
export interface PartyView {
  name: string;
  /** Free-form lines shown under the name: address, postcode/city, UID, CR, etc. */
  details: string[];
}

/**
 * A printed block: an optional introductory note, then its own table with its
 * own header. A `section` line closes the current block and opens a new one:
 * that is what produces two distinct tables on the document.
 */
export interface SectionView {
  note?: string | null;
  lines: DocumentLine[];
}

/**
 * Splits the flat list of lines into blocks to print.
 *
 * `section` lines are never rendered as table rows: they carry neither quantity
 * nor price, only a heading that introduces the next block. The first block has
 * no note if no section precedes it.
 */
export function groupIntoSections(lines: DocumentLine[]): SectionView[] {
  const sections: SectionView[] = [];
  let current: SectionView = { note: null, lines: [] };

  for (const line of lines) {
    if (line.kind === "section") {
      // A new block only opens if the previous one holds something, so that a
      // section placed first does not produce an empty table.
      if (current.lines.length > 0) sections.push(current);
      current = { note: line.label, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) sections.push(current);

  return sections;
}

export interface DocumentView {
  kind: "quote" | "invoice";
  number: string;
  /** Subject of the document, shown after the number. */
  title: string;
  issueDate: string;
  /** Quote: validity date. Invoice: due date. */
  untilDate?: string | null;
  logoText: string;
  contact: string;
  sender: PartyView;
  client: PartyView;
  /** Document lines, in order; split into tables when printed. */
  lines: DocumentLine[];
  /** Free text in the table footer (VAT mention). */
  vatNote?: string | null;
  notes?: string | null;
  showSignatures: boolean;
  /** Provider signature placed at the bottom of the quote (image + name). */
  signature?: { name: string; role: string | null; image: string } | null;
  /** SVG of the QR payment part (invoices only). */
  qrSvg?: string | null;
  /** Brand color (logo, e-mail, Q band). Default: Qwasar blue. */
  brandColor?: string | null;
  /** Branding of the issuing company. Default: QWASAR template. */
  brand?: BrandSettings;
}

/** ISO date -> `22.07.2026`. */
export function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Unit price: no decimals when the amount is round (as on the template). */
function unitPrice(cents: number): string {
  return cents % 100 === 0
    ? String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "’")
    : chf(cents);
}

/** Quantity in thousandths -> compact text (1000 -> "1", 1500 -> "1.5"). */
function qty(qtyMilli: number): string {
  const v = qtyMilli / 1000;
  return Number.isInteger(v) ? String(v) : String(v).replace(".", ".");
}

/**
 * Logo and contact line, at the top of the document.
 *
 * The `image` mode without an image falls back to text: an empty header would be
 * worse than the company name. `none` deliberately prints no logo at all.
 */
export function logoBlock(
  logoText: string,
  contact: string,
  brand: BrandSettings = DEFAULT_BRAND,
): string {
  const logo =
    brand.logoMode === "none"
      ? ""
      : brand.logoMode === "image" && brand.logoImage
        ? `<img class="logo-img" src="${esc(brand.logoImage)}" alt="${esc(logoText)}">`
        : `<div class="logo">${esc(logoText)}</div>`;
  const line = brand.showContact && contact ? `<div class="logo-contact">${esc(contact)}</div>` : "";
  return logo + line;
}

function partyBlock(p: PartyView, cls: string): string {
  const details = p.details.filter(Boolean).map((d) => `<div>${esc(d)}</div>`).join("");
  return `<div class="party ${cls}"><div class="name">${esc(p.name)}</div>${details}</div>`;
}

function sectionBlock(s: SectionView): string {
  const note = s.note ? `<div class="section-note">${escMultiline(s.note)}</div>` : "";
  const rows = s.lines
    .map((line) => {
      // `section` lines have already been consumed by groupIntoSections().
      if (line.kind === "section") return "";
      if (line.kind === "detail") {
        // The dash marks "included in the service line", under the Unit price column.
        return `<tr class="detail"><td>${esc(line.label)}</td><td class="num"></td><td class="num">-</td><td class="num"></td></tr>`;
      }
      const t = lineTotals(line);
      return `<tr class="item"><td>${esc(line.label)}</td><td class="num">${qty(line.qtyMilli)}</td><td class="num">${unitPrice(line.unitPriceHt)}</td><td class="num">${chf(t.ttc)} CHF</td></tr>`;
    })
    .join("");

  return `<div class="section">${note}
  <table class="items">
    <colgroup><col class="c-desc"><col class="c-qty"><col class="c-unit"><col class="c-tot"></colgroup>
    <thead><tr><th>Description</th><th class="num">Qte.</th><th class="num">Prix u.</th><th class="num">Total TTC</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function totalsBlock(lines: DocumentLine[]): string {
  const t = documentTotals(lines);
  const vatRows = t.byRate
    .filter((g) => g.vatRateBps > 0)
    .map(
      (g) =>
        `<tr><td>TVA ${(g.vatRateBps / 100).toFixed(2).replace(/0$/, "")} %</td><td>${chf(g.vat)} CHF</td></tr>`,
    )
    .join("");

  return `<div class="totals"><table>
    <tr><td>Total HT</td><td>${chf(t.ht)} CHF</td></tr>
    ${vatRows}
    <tr class="grand"><td>Total TTC</td><td>${chf(t.ttc)} CHF</td></tr>
  </table></div>`;
}

function signaturesBlock(signature: DocumentView["signature"]): string {
  const img = signature ? safeSignatureImage(signature.image) : null;
  // The signer's name goes UNDER the rule; the customer gets an empty caption of
  // the same height so both rules stay aligned.
  const provider = signature
    ? `${img ? `<img class="sig-img" src="${esc(img)}" alt="Signature">` : ""}<div class="rule"></div>` +
      `<div class="sig-caption"><b>${esc(signature.name)}</b>${signature.role ? `, ${esc(signature.role)}` : ""}</div>`
    : `<div class="rule"></div>`;
  const client = signature ? `<div class="rule"></div><div class="sig-caption">&nbsp;</div>` : `<div class="rule"></div>`;
  return `<div class="signatures">
    <div class="signature">Date et signature prestataire :<div class="sig-slot">${provider}</div></div>
    <div class="signature">Date et signature client :<div class="sig-slot">${client}</div></div>
  </div>`;
}

/**
 * Header repeated on **every** page: logo, contact, issuer and customer.
 *
 * It goes into the `thead` of the wrapping table: the only way to get a
 * per-page repetition when printing. Reserved for quotes and invoices: a
 * contract keeps its header on the first page only.
 */
export function documentHeader(view: DocumentView): string {
  return `<div class="doc-header">
  ${logoBlock(view.logoText, view.contact, view.brand)}

  <div class="parties">
    ${partyBlock(view.sender, "sender")}
    ${partyBlock(view.client, "client")}
  </div>
</div>`;
}

/** Document body (title, tables, totals, signatures); the header is separate. */
export function documentBody(view: DocumentView): string {
  const sections = groupIntoSections(view.lines);

  const label = view.kind === "quote" ? "Devis" : "Facture";
  const untilLabel =
    view.kind === "quote"
      ? view.untilDate
        ? `<div class="remark"><b>Remarque</b> : Ce devis est valable jusqu'au <b>${esc(frDate(view.untilDate))}</b>.</div>`
        : ""
      : view.untilDate
        ? `<div class="remark">Échéance de paiement : <b>${esc(frDate(view.untilDate))}</b>.</div>`
        : "";

  // The content is isolated from the QR payment part: it is the one being stretched
  // (min-height) to push the QR-bill to the bottom of the LAST page.
  return `<div class="page${view.qrSvg ? " with-qr" : ""}">
  <div class="doc-content">
  <div class="doc-title"><strong>${esc(label)} N°${esc(view.number)}</strong> du ${esc(frDate(view.issueDate))}${view.title ? ` : ${esc(view.title)}` : ""}</div>
  ${untilLabel}

  ${sections.map(sectionBlock).join("")}
  ${totalsBlock(view.lines)}
  ${view.vatNote ? `<div class="vat-note">${escMultiline(view.vatNote)}</div>` : ""}
  ${view.notes ? `<div class="vat-note">${escMultiline(view.notes)}</div>` : ""}
  ${view.showSignatures ? signaturesBlock(view.signature) : ""}
  </div>
  ${view.qrSvg ? `<div class="qr-part">${view.qrSvg}</div>` : ""}
</div>`;
}

/**
 * Complete document ready to print.
 *
 * `layout` describes the pagination measured on the previous render: number of
 * pages and usable height of a page (297 mm minus the repeated header). Both are
 * used to reserve the height that pushes the QR-bill to the bottom of the last
 * page, and are only known after a first render, hence the two-step call
 * (see `htmlToPdfBuffer`). Without `layout`, nothing is stretched.
 */
export function buildDocumentHtml(
  view: DocumentView,
  fontsDir: string,
  layout?: DocumentLayout,
): string {
  const title = `${view.kind === "quote" ? "Devis" : "Facture"} ${view.number}`;
  const header = documentHeader(view);
  // Too tall for Chromium to replay: it falls back to the top of the body, hence
  // on the first page only: better than a header that vanishes silently while
  // having skewed the usable-band computation.
  const repeated = layout?.repeatHeader ?? true;

  return htmlDocument(
    title,
    fontsDir,
    repeated ? documentBody(view) : header + documentBody(view),
    safeColor(view.brandColor),
    {
      brand: view.brand ?? DEFAULT_BRAND,
      // The QR payment part must touch the bottom of the sheet.
      fullBleedBottom: !!view.qrSvg,
      // The header (logo, issuer, customer) repeats on every page.
      header: repeated ? header : undefined,
      // Q band offset by half a column and painted over the QR-bill.
      documentQBand: true,
      pages: layout?.pages ?? 0,
      bandMm: layout?.bandMm,
    },
  );
}
