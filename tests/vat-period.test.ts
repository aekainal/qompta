import { describe, expect, it } from "vitest";
import { periodRange } from "../src/shared/vat/period.js";
import { buildVatReturn, selectPeriodInvoices, type ReturnInvoice } from "../src/shared/vat/buildReturn.js";

const RATES = { normal: 810, reduced: 260, lodging: 380 };

describe("periodRange", () => {
  it("trimestres", () => {
    expect(periodRange("quarterly", 2026, 1)).toMatchObject({ startDate: "2026-01-01", endDate: "2026-03-31", label: "Q1 2026" });
    expect(periodRange("quarterly", 2026, 2)).toMatchObject({ startDate: "2026-04-01", endDate: "2026-06-30" });
    expect(periodRange("quarterly", 2026, 4)).toMatchObject({ startDate: "2026-10-01", endDate: "2026-12-31" });
  });
  it("semestres et année", () => {
    expect(periodRange("semestrial", 2026, 2)).toMatchObject({ startDate: "2026-07-01", endDate: "2026-12-31" });
    expect(periodRange("annual", 2026)).toMatchObject({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });
});

function inv(p: Partial<ReturnInvoice>): ReturnInvoice {
  return {
    type: "sale",
    treatment: "standard",
    vatRateBps: 810,
    amountChf: 100000,
    issueDate: "2026-02-01",
    paymentDate: null,
    status: "issued",
    ...p,
  };
}

describe("selectPeriodInvoices", () => {
  const range = periodRange("quarterly", 2026, 1);
  it("base convenu : filtre par date de facture", () => {
    const list = [inv({ issueDate: "2026-02-15" }), inv({ issueDate: "2026-05-01" })];
    expect(selectPeriodInvoices(list, "agreed", range)).toHaveLength(1);
  });
  it("base reçu : filtre par date de paiement, ignore non payées", () => {
    const list = [
      inv({ issueDate: "2026-02-15", paymentDate: "2026-03-20", status: "paid" }),
      inv({ issueDate: "2026-02-15", paymentDate: null, status: "issued" }),
    ];
    expect(selectPeriodInvoices(list, "received", range)).toHaveLength(1);
  });
  it("« Réglé (pour TVA) » entre au décompte (base convenu, par date d'émission)", () => {
    const list = [inv({ issueDate: "2026-02-15", status: "settled_vat" })];
    expect(selectPeriodInvoices(list, "agreed", range)).toHaveLength(1);
  });
});

describe("buildVatReturn — décompte de bout en bout sur factures", () => {
  const range = periodRange("quarterly", 2026, 1);
  it("ventes imposées + achat -> 500/510 cohérents", () => {
    const list: ReturnInvoice[] = [
      inv({ type: "sale", amountChf: 100000, vatRateBps: 810 }),
      inv({ type: "sale", amountChf: 50000, vatRateBps: 260 }),
      inv({ type: "purchase", treatment: "input_material", amountChf: 20000, vatRateBps: 810 }),
    ];
    const r = buildVatReturn(list, "agreed", range, RATES);
    expect(r.b200).toBe(150000);
    expect(r.b303).toBe(100000);
    expect(r.b313).toBe(50000);
    expect(r.b399).toBe(8100 + 1300);
    expect(r.b479).toBe(1620); // 8.10% de 20000
    expect(r.b500).toBe(8100 + 1300 - 1620);
    expect(r.coherenceWarning).toBe(false);
  });

  it("export exclu du CA imposable (220)", () => {
    const list: ReturnInvoice[] = [
      inv({ type: "sale", amountChf: 100000, vatRateBps: 810 }),
      inv({ type: "sale", treatment: "exempt_export", amountChf: 40000, vatRateBps: 0 }),
    ];
    const r = buildVatReturn(list, "agreed", range, RATES);
    expect(r.b200).toBe(140000);
    expect(r.b220).toBe(40000);
    expect(r.b299).toBe(100000);
    expect(r.b379).toBe(100000);
  });

  it("ne retient que les factures de la période", () => {
    const list: ReturnInvoice[] = [
      inv({ issueDate: "2026-02-01", amountChf: 100000 }),
      inv({ issueDate: "2026-07-01", amountChf: 999999 }),
    ];
    const r = buildVatReturn(list, "agreed", range, RATES);
    expect(r.b200).toBe(100000);
  });
});
