import { describe, expect, it } from "vitest";
import {
  documentTotals,
  lineTotals,
  type DocumentLine,
} from "../src/shared/documents/totals.js";
import { quoteToInvoices, rateTypeOf } from "../src/shared/documents/convert.js";

const RATES = { normal: 810, reduced: 260, lodging: 380 };

const item = (label: string, unitPriceHt: number, vatRateBps = 810, qtyMilli = 1000): DocumentLine =>
  ({ kind: "item", label, qtyMilli, unitPriceHt, vatRateBps });
const detail = (label: string): DocumentLine =>
  ({ kind: "detail", label, qtyMilli: 0, unitPriceHt: 0, vatRateBps: 0 });
const section = (label: string): DocumentLine =>
  ({ kind: "section", label, qtyMilli: 0, unitPriceHt: 0, vatRateBps: 0 });

/** The lines of the reference Yasuragi quote (22.07.2026). */
const yasuragi: DocumentLine[] = [
  item("Site internet", 50000),
  detail("Développement"),
  detail("Mise en ligne"),
  section("Abonnement mensuel avec durée minimale de 18 mois"),
  item("Gestion du site internet", 4500),
  detail("Hébergement"),
  detail("Maintenance"),
];

describe("totaux d'un document", () => {
  it("reproduit au centime les montants du devis de référence", () => {
    // 500.00 net at 8.1 % -> 540.50 gross; 45.00 net -> 48.65 gross.
    expect(lineTotals(yasuragi[0]).ttc).toBe(54050);
    expect(lineTotals(yasuragi[4]).ttc).toBe(4865);
  });

  it("ignore les lignes section et detail dans les totaux", () => {
    const t = documentTotals(yasuragi);
    expect(t.ht).toBe(54500);
    expect(t.vat).toBe(4415);
    expect(t.ttc).toBe(58915);
  });

  it("ventile les totaux par taux de TVA", () => {
    const t = documentTotals([item("Conseil", 10000, 810), item("Repas", 5000, 260)]);
    expect(t.byRate).toEqual([
      { vatRateBps: 260, ht: 5000, vat: 130, ttc: 5130 },
      { vatRateBps: 810, ht: 10000, vat: 810, ttc: 10810 },
    ]);
  });

  it("gère les quantités fractionnaires sans float monétaire", () => {
    // 2.5 x 120.00 = 300.00 net
    expect(lineTotals(item("Heures", 12000, 810, 2500)).ht).toBe(30000);
  });
});

describe("conversion d'un devis en facture", () => {
  it("produit une facture de vente unique en brouillon pour un devis mono-taux", () => {
    const out = quoteToInvoices({
      issueDate: "2026-07-22",
      thirdPartyId: "tp-1",
      title: "Site internet et maintenance serveur",
      lines: yasuragi,
      rates: RATES,
    });

    expect(out).toHaveLength(1);
    expect(out[0].input).toMatchObject({
      type: "sale",
      status: "draft",
      rate: "normal",
      enteredAs: "ht",
      enteredAmount: 54500,
      thirdPartyId: "tp-1",
    });
  });

  it("reprend les lignes du devis, sections et détails compris", () => {
    const [converted] = quoteToInvoices({
      issueDate: "2026-07-22",
      lines: yasuragi,
      rates: RATES,
    });
    expect(converted.lines.map((l) => l.label)).toEqual(yasuragi.map((l) => l.label));
  });

  it("émet une facture par taux pour que la ventilation TVA reste juste", () => {
    const out = quoteToInvoices({
      issueDate: "2026-07-22",
      title: "Prestations",
      lines: [item("Conseil", 10000, 810), item("Repas", 5000, 260)],
      rates: RATES,
    });

    expect(out).toHaveLength(2);
    expect(out.map((o) => o.input.rate).sort()).toEqual(["normal", "reduced"]);
    expect(out.find((o) => o.input.rate === "normal")!.input.enteredAmount).toBe(10000);
    expect(out.find((o) => o.input.rate === "reduced")!.input.enteredAmount).toBe(5000);
    // The rate is repeated in the label to tell the two invoices apart.
    expect(out[0].input.description).toMatch(/TVA/);
  });

  it("rattache chaque détail à la prestation de son propre taux", () => {
    const out = quoteToInvoices({
      issueDate: "2026-07-22",
      lines: [
        item("Conseil", 10000, 810),
        detail("Analyse"),
        item("Repas", 5000, 260),
        detail("Boissons"),
      ],
      rates: RATES,
    });

    const normal = out.find((o) => o.input.rate === "normal")!;
    const reduced = out.find((o) => o.input.rate === "reduced")!;
    expect(normal.lines.map((l) => l.label)).toEqual(["Conseil", "Analyse"]);
    expect(reduced.lines.map((l) => l.label)).toEqual(["Repas", "Boissons"]);
  });

  it("refuse un devis sans ligne facturable", () => {
    expect(() =>
      quoteToInvoices({ issueDate: "2026-07-22", lines: [section("Vide")], rates: RATES }),
    ).toThrow(/aucune ligne facturable/);
  });

  it("nomme correctement le type de taux", () => {
    expect(rateTypeOf(810, RATES)).toBe("normal");
    expect(rateTypeOf(260, RATES)).toBe("reduced");
    expect(rateTypeOf(380, RATES)).toBe("lodging");
    expect(rateTypeOf(0, RATES)).toBe("zero");
  });
});
