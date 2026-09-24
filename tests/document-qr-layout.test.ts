/**
 * QR-bill alignment: it must close the LAST page, whatever the number of pages
 * of the document. The original trap: in fixed position, Chromium repeated it
 * on every page and the content ran underneath.
 */

import { describe, expect, it } from "vitest";
import { documentBody, documentHeader } from "../src/main/export/pdf/documentHtml.js";
import { CONTENT_BAND_MM, QR_PART_HEIGHT_MM, qrFillMm } from "../src/main/export/pdf/theme.js";
import type { DocumentLine } from "../src/shared/documents/totals.js";

const item = (label: string, price = 100_00): DocumentLine => ({
  kind: "item",
  label,
  qtyMilli: 1000,
  unitPriceHt: price,
  vatRateBps: 810,
});

const VIEW = {
  kind: "invoice",
  number: "FC2026072201",
  title: "Prestations",
  issueDate: "2026-07-22",
  logoText: "QWASAR",
  contact: "contact@qwasar.ch",
  sender: { name: "Qwasar", details: ["Rue Chautenatte 19"] },
  client: { name: "Client", details: ["1200 Genève"] },
  lines: [item("Site internet")],
  showSignatures: false,
} as const;

function invoiceBody(qrSvg: string | null): string {
  return documentBody({
    kind: "invoice",
    number: "FC2026072201",
    title: "Prestations",
    issueDate: "2026-07-22",
    logoText: "QWASAR",
    contact: "contact@qwasar.ch",
    sender: { name: "Qwasar", details: [] },
    client: { name: "Client", details: [] },
    lines: [item("Site internet")],
    showSignatures: false,
    qrSvg,
  });
}

describe("mise en page de la QR-facture", () => {
  it("réserve exactement la hauteur qui pousse la partie paiement en bas de page", () => {
    expect(qrFillMm(1)).toBe(CONTENT_BAND_MM - QR_PART_HEIGHT_MM);
    expect(qrFillMm(3)).toBe(3 * CONTENT_BAND_MM - QR_PART_HEIGHT_MM);
    // The content plus the payment part always fill a whole number of pages.
    for (const pages of [1, 2, 5]) {
      expect(qrFillMm(pages) + QR_PART_HEIGHT_MM).toBe(pages * CONTENT_BAND_MM);
    }
  });

  it("place la partie paiement après le contenu, hors du bloc étiré", () => {
    const html = invoiceBody("<svg id='qr'></svg>");
    expect(html).toContain('<div class="doc-content">');
    // The QR-bill follows the closing of the content: it alone gets stretched.
    expect(html.replace(/\s+/g, " ")).toContain('</div> <div class="qr-part">');
  });

  it("n'ouvre le bloc de calage que si la facture porte une QR-facture", () => {
    expect(invoiceBody(null)).not.toContain("with-qr");
    expect(invoiceBody("<svg></svg>")).toContain('class="page with-qr"');
  });

  it("ne réserve aucune hauteur au rendu de mesure", () => {
    // pages = 0: first print, the one used to count the pages.
    expect(qrFillMm(0, 221.5)).toBe(0);
  });
});

describe("en-tête répété", () => {
  it("sort logo, contact et parties du corps pour les mettre dans l'en-tête", () => {
    const header = documentHeader(VIEW);
    const body = invoiceBody(null);

    expect(header).toContain('class="logo"');
    expect(header).toContain('class="parties"');
    expect(header).toContain("Rue Chautenatte 19");
    expect(header).toContain("1200 Genève");

    // The body must no longer carry them, otherwise they would appear twice on page 1.
    expect(body).not.toContain('class="logo"');
    expect(body).not.toContain('class="parties"');
    // It does keep the document title, which does not repeat.
    expect(body).toContain('class="doc-title"');
  });
});
