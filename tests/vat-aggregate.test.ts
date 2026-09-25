import { describe, expect, it } from "vitest";
import { aggregateInvoices, type AggregatableInvoice } from "../src/shared/vat/aggregate.js";
import { computeVatReturn } from "../src/shared/vat/compute.js";
import { resolveRate } from "../src/shared/vat/rates.js";

const OPTS = { rateNormalBps: 810, rateReducedBps: 260, rateLodgingBps: 380 };

function sale(net: number, rate: AggregatableInvoice["rate"], treatment: AggregatableInvoice["treatment"] = "standard", rateBps = 810): AggregatableInvoice {
  return { type: "sale", treatment, rate, rateBps, netChf: net, vatChf: Math.round((net * rateBps) / 10000) };
}
function purchase(net: number, treatment: AggregatableInvoice["treatment"], rateBps = 810): AggregatableInvoice {
  return { type: "purchase", treatment, rate: "normal", rateBps, netChf: net, vatChf: Math.round((net * rateBps) / 10000) };
}

describe("aggregateInvoices : factures -> bases du décompte", () => {
  it("ventes par taux alimentent 200 et 303/313/343", () => {
    const input = aggregateInvoices(
      [sale(100000, "normal"), sale(50000, "reduced", "standard", 260), sale(20000, "lodging", "standard", 380)],
      OPTS,
    );
    expect(input.b200).toBe(170000);
    expect(input.b303).toBe(100000);
    expect(input.b313).toBe(50000);
    expect(input.b343).toBe(20000);

    const r = computeVatReturn(input);
    expect(r.b299).toBe(170000);
    expect(r.b379).toBe(170000);
    expect(r.coherenceWarning).toBe(false);
  });

  it("export et étranger alimentent 200 puis 220/221", () => {
    const input = aggregateInvoices(
      [sale(100000, "normal"), sale(40000, "zero", "exempt_export"), sale(10000, "zero", "foreign")],
      OPTS,
    );
    expect(input.b200).toBe(150000);
    expect(input.b220).toBe(40000);
    expect(input.b221).toBe(10000);
    const r = computeVatReturn(input);
    expect(r.b289).toBe(50000);
    expect(r.b299).toBe(100000);
    expect(r.b379).toBe(100000);
  });

  it("rabais accordé alimente 235", () => {
    const input = aggregateInvoices([sale(5000, "normal", "discount")], OPTS);
    expect(input.b235).toBe(5000);
    expect(input.b200).toBe(0);
  });

  it("achats alimentent l'impôt préalable 400/405 par la TVA", () => {
    const input = aggregateInvoices(
      [purchase(100000, "input_material"), purchase(200000, "input_investment")],
      OPTS,
    );
    expect(input.t400).toBe(8100);
    expect(input.t405).toBe(16200);
    const r = computeVatReturn(input);
    expect(r.b479).toBe(8100 + 16200);
  });

  it("subventions et dons alimentent 900/910", () => {
    const input = aggregateInvoices(
      [sale(3000, "zero", "subsidy"), sale(2000, "zero", "donation")],
      OPTS,
    );
    expect(input.b900).toBe(3000);
    expect(input.b910).toBe(2000);
  });

  it("6) saisie TTC vs HT donne les mêmes bases (via rateBps cohérent)", () => {
    // Two equivalent invoices (1000 net @ 8.10%): base 303 must be identical.
    const fromHt = aggregateInvoices([sale(100000, "normal")], OPTS);
    expect(fromHt.b303).toBe(100000);
  });
});

describe("rates : historisation", () => {
  it("résout les taux 2024+ et les taux antérieurs", () => {
    expect(resolveRate("normal", "2026-03-15")).toBe(810);
    expect(resolveRate("reduced", "2026-03-15")).toBe(260);
    expect(resolveRate("lodging", "2026-03-15")).toBe(380);
    expect(resolveRate("normal", "2022-06-01")).toBe(770);
  });

  it("lève une erreur hors plage", () => {
    expect(() => resolveRate("normal", "2000-01-01")).toThrow();
  });
});
