import { describe, expect, it } from "vitest";
import { computeInvoice, isOverdue } from "../src/shared/invoice.js";

const RATES = { normal: 810, reduced: 260, lodging: 380 };

describe("computeInvoice : calcul d'une facture", () => {
  it("vente normale saisie en HT", () => {
    const r = computeInvoice(
      { type: "sale", treatment: "standard", rate: "normal", enteredAmount: 100000, enteredAs: "ht", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.rateBps).toBe(810);
    expect(r.amountHt).toBe(100000);
    expect(r.vatAmount).toBe(8100);
    expect(r.amountTtc).toBe(108100);
    expect(r.amountChf).toBe(100000);
    expect(r.vatCode).toBe("303");
  });

  it("vente saisie en TTC -> retrouve le HT", () => {
    const r = computeInvoice(
      { type: "sale", treatment: "standard", rate: "normal", enteredAmount: 108100, enteredAs: "ttc", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.amountHt).toBe(100000);
    expect(r.vatAmount).toBe(8100);
  });

  it("taux réduit -> code 313", () => {
    const r = computeInvoice(
      { type: "sale", treatment: "standard", rate: "reduced", enteredAmount: 100000, enteredAs: "ht", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.rateBps).toBe(260);
    expect(r.vatCode).toBe("313");
  });

  it("export -> taux zéro, code 220", () => {
    const r = computeInvoice(
      { type: "sale", treatment: "exempt_export", rate: "zero", enteredAmount: 100000, enteredAs: "ht", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.rateBps).toBe(0);
    expect(r.vatAmount).toBe(0);
    expect(r.vatCode).toBe("220");
  });

  it("achat investissement -> code 405", () => {
    const r = computeInvoice(
      { type: "purchase", treatment: "input_investment", rate: "normal", enteredAmount: 200000, enteredAs: "ht", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.vatCode).toBe("405");
    expect(r.vatAmount).toBe(16200);
  });

  it("conversion devise -> amountChf via fxRate", () => {
    const r = computeInvoice(
      {
        type: "purchase",
        treatment: "input_material",
        rate: "normal",
        enteredAmount: 10000,
        enteredAs: "ht",
        issueDate: "2026-02-01",
        currency: "EUR",
        fxRate: 9500,
      },
      RATES,
    );
    expect(r.amountHt).toBe(10000); // EUR
    expect(r.amountChf).toBe(9500); // converti
  });

  it("TVA réelle saisie prime sur le calcul auto (cas 9.66 @ 7.7% = 0.74)", () => {
    const r = computeInvoice(
      {
        type: "purchase",
        treatment: "input_material",
        rate: "normal",
        enteredAmount: 966, // 9.66 HT
        enteredAs: "ht",
        issueDate: "2026-02-01",
        vatAmountOverride: 74, // 0.74 réel (au lieu de 0.78 calculé à 8.10 %)
      },
      RATES,
    );
    expect(r.vatAmount).toBe(74);
    expect(r.amountHt).toBe(966);
    expect(r.amountTtc).toBe(966 + 74);
    expect(r.vatChf).toBe(74);
  });

  it("sans override, 9.66 HT @ 8.10 % = 0.78", () => {
    const r = computeInvoice(
      { type: "purchase", treatment: "input_material", rate: "normal", enteredAmount: 966, enteredAs: "ht", issueDate: "2026-02-01" },
      RATES,
    );
    expect(r.vatAmount).toBe(78);
  });

  it("résout le taux historisé à la date sans table fournie", () => {
    const r2026 = computeInvoice(
      { type: "sale", treatment: "standard", rate: "normal", enteredAmount: 100000, enteredAs: "ht", issueDate: "2026-02-01" },
    );
    const r2022 = computeInvoice(
      { type: "sale", treatment: "standard", rate: "normal", enteredAmount: 100000, enteredAs: "ht", issueDate: "2022-02-01" },
    );
    expect(r2026.rateBps).toBe(810);
    expect(r2022.rateBps).toBe(770);
  });
});

describe("isOverdue", () => {
  it("échue et non payée -> en retard", () => {
    expect(isOverdue("issued", "2026-01-01", "2026-02-01")).toBe(true);
  });
  it("payée -> jamais en retard", () => {
    expect(isOverdue("paid", "2026-01-01", "2026-02-01")).toBe(false);
  });
  it("sans échéance -> pas en retard", () => {
    expect(isOverdue("issued", null, "2026-02-01")).toBe(false);
  });
});
