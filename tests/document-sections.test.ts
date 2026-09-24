/**
 * Rendering of the sections of a quote / an invoice.
 *
 * A `section` line is NOT a table row: it closes the current table and opens a
 * new one, its label serving as the heading. It must never appear with a
 * quantity or a price.
 */

import { describe, expect, it } from "vitest";
import { groupIntoSections } from "../src/main/export/pdf/documentHtml.js";
import type { DocumentLine } from "../src/shared/documents/totals.js";

const item = (label: string, unitPriceHt = 50000): DocumentLine => ({
  kind: "item",
  label,
  qtyMilli: 1000,
  unitPriceHt,
  vatRateBps: 810,
});
const detail = (label: string): DocumentLine => ({
  kind: "detail",
  label,
  qtyMilli: 0,
  unitPriceHt: 0,
  vatRateBps: 0,
});
const section = (label: string): DocumentLine => ({
  kind: "section",
  label,
  qtyMilli: 0,
  unitPriceHt: 0,
  vatRateBps: 0,
});

describe("découpage en tableaux", () => {
  it("produit deux tableaux séparés quand une section est présente", () => {
    const sections = groupIntoSections([
      item("Site internet"),
      detail("Développement"),
      section("Abonnement mensuel avec durée minimale de 18 mois"),
      item("Gestion du site", 4500),
      detail("Hébergement"),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].note).toBeNull();
    expect(sections[0].lines.map((l) => l.label)).toEqual(["Site internet", "Développement"]);
    expect(sections[1].note).toBe("Abonnement mensuel avec durée minimale de 18 mois");
    expect(sections[1].lines.map((l) => l.label)).toEqual(["Gestion du site", "Hébergement"]);
  });

  it("ne laisse aucune ligne section dans les tableaux", () => {
    const sections = groupIntoSections([
      item("A"),
      section("Bloc 2"),
      item("B"),
      section("Bloc 3"),
      item("C"),
    ]);
    for (const s of sections) {
      expect(s.lines.some((l) => l.kind === "section")).toBe(false);
    }
    expect(sections).toHaveLength(3);
  });

  it("gère une section placée en tête sans produire de tableau vide", () => {
    const sections = groupIntoSections([section("Prestations"), item("A")]);
    expect(sections).toHaveLength(1);
    expect(sections[0].note).toBe("Prestations");
    expect(sections[0].lines.map((l) => l.label)).toEqual(["A"]);
  });

  it("ignore une section en fin de document", () => {
    const sections = groupIntoSections([item("A"), section("Vide")]);
    expect(sections).toHaveLength(1);
    expect(sections[0].lines.map((l) => l.label)).toEqual(["A"]);
  });

  it("produit un tableau unique en l'absence de section", () => {
    const sections = groupIntoSections([item("A"), detail("a1"), item("B")]);
    expect(sections).toHaveLength(1);
    expect(sections[0].note).toBeNull();
  });

  it("ne rend jamais de montant pour une section", async () => {
    const { documentBody } = await import("../src/main/export/pdf/documentHtml.js");
    const html = documentBody({
      kind: "quote",
      number: "DC2026072201",
      title: "Test",
      issueDate: "2026-07-22",
      logoText: "QWASAR",
      contact: "contact@qwasar.ch",
      sender: { name: "Qwasar", details: [] },
      client: { name: "Client", details: [] },
      lines: [item("Site internet"), section("Abonnement mensuel"), item("Gestion", 4500)],
      showSignatures: true,
    });

    // Two tables, and the section heading outside the table rows.
    expect(html.match(/<table class="items">/g)).toHaveLength(2);
    expect(html).toContain('<div class="section-note">Abonnement mensuel</div>');
    expect(html).not.toMatch(/<tr class="item"><td>Abonnement mensuel<\/td>/);
    // No zero amount printed (the original bug displayed "0.00 CHF").
    expect(html).not.toContain("0.00 CHF");
  });
});
