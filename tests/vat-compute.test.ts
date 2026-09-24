import { describe, expect, it } from "vitest";
import {
  computeTdfnReturn,
  computeVatReturn,
  emptyVatInput,
  type VatReturnInput,
} from "../src/shared/vat/compute.js";

const RATES_2026 = { normal: 810, reduced: 260, lodging: 380 };

function base(): VatReturnInput {
  return emptyVatInput(RATES_2026);
}

describe("computeVatReturn — cas de référence VAT-LOGIC §6", () => {
  it("1) vente unique 1000.00 @ 8.10% -> 500 = 8100", () => {
    const input = base();
    input.b200 = 100000;
    input.b303 = 100000;
    const r = computeVatReturn(input);
    expect(r.b289).toBe(0);
    expect(r.b299).toBe(100000);
    expect(r.b379).toBe(100000);
    expect(r.tax303).toBe(8100);
    expect(r.b399).toBe(8100);
    expect(r.b479).toBe(0);
    expect(r.b500).toBe(8100);
    expect(r.b510).toBe(0);
    expect(r.coherenceWarning).toBe(false);
  });

  it("2) mix des trois taux -> 379 = somme des bases, 399 cohérent", () => {
    const input = base();
    input.b200 = 300000;
    input.b303 = 100000; // 8100
    input.b313 = 100000; // 2600
    input.b343 = 100000; // 3800
    const r = computeVatReturn(input);
    expect(r.b379).toBe(300000);
    expect(r.b299).toBe(300000);
    expect(r.tax303).toBe(8100);
    expect(r.tax313).toBe(2600);
    expect(r.tax343).toBe(3800);
    expect(r.b399).toBe(8100 + 2600 + 3800);
    expect(r.coherenceWarning).toBe(false);
  });

  it("3) export (220) + vente normale -> 299 exclut l'export, 379 = 299", () => {
    const input = base();
    input.b200 = 150000; // 100000 imposé + 50000 export
    input.b220 = 50000;
    input.b303 = 100000;
    const r = computeVatReturn(input);
    expect(r.b289).toBe(50000);
    expect(r.b299).toBe(100000);
    expect(r.b379).toBe(100000);
    expect(r.coherenceWarning).toBe(false);
  });

  it("4) impôt préalable > impôt dû -> crédit (510)", () => {
    const input = base();
    input.b200 = 100000;
    input.b303 = 100000; // impôt dû 8100
    input.t400 = 5000;
    input.t405 = 6000; // préalable 11000
    const r = computeVatReturn(input);
    expect(r.b399).toBe(8100);
    expect(r.b479).toBe(11000);
    expect(r.b500).toBe(0);
    expect(r.b510).toBe(2900);
  });

  it("5) écart 379 ≠ 299 -> coherenceWarning", () => {
    const input = base();
    input.b200 = 100000;
    input.b303 = 90000; // base imposable < CA
    const r = computeVatReturn(input);
    expect(r.b299).toBe(100000);
    expect(r.b379).toBe(90000);
    expect(r.coherenceWarning).toBe(true);
  });

  it("479 = 400 + 405 + 410 - 415 - 420", () => {
    const input = base();
    input.t400 = 1000;
    input.t405 = 2000;
    input.t410 = 500;
    input.t415 = 300;
    input.t420 = 200;
    const r = computeVatReturn(input);
    expect(r.b479).toBe(1000 + 2000 + 500 - 300 - 200);
  });

  it("383 (impôt sur acquisitions) entre dans 399", () => {
    const input = base();
    input.b303 = 100000; // 8100
    input.tax383 = 1900;
    const r = computeVatReturn(input);
    expect(r.b399).toBe(8100 + 1900);
  });

  it("autres mouvements de fonds 900/910 sont reportés mais hors solde", () => {
    const input = base();
    input.b200 = 100000;
    input.b303 = 100000;
    input.b900 = 5000;
    input.b910 = 3000;
    const r = computeVatReturn(input);
    expect(r.b900).toBe(5000);
    expect(r.b910).toBe(3000);
    expect(r.b500).toBe(8100); // inchangé
  });
});

describe("computeTdfnReturn — méthode des taux de la dette fiscale nette", () => {
  it("8) impôt = CA TTC × taux forfaitaire, sans impôt préalable", () => {
    const r = computeTdfnReturn([{ grossTtcCents: 1080000, rateBps: 610 }]);
    expect(r.totalGross).toBe(1080000);
    // 10800.00 × 6.10% = 658.80
    expect(r.taxDue).toBe(65880);
  });

  it("plusieurs secteurs s'additionnent", () => {
    const r = computeTdfnReturn([
      { grossTtcCents: 1000000, rateBps: 610 },
      { grossTtcCents: 500000, rateBps: 200 },
    ]);
    expect(r.taxDue).toBe(61000 + 10000);
  });
});
