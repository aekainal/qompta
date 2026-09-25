import { describe, expect, it } from "vitest";
import {
  chfToCents,
  centsToChf,
  formatChf,
  resolveAmounts,
  splitGross,
  toChf,
  vatFromNet,
} from "../src/shared/money.js";

describe("money : conversions", () => {
  it("chfToCents gère les formats suisses", () => {
    expect(chfToCents("1'234.55")).toBe(123455);
    expect(chfToCents("1234,55")).toBe(123455);
    expect(chfToCents(1234.55)).toBe(123455);
    expect(chfToCents("0")).toBe(0);
  });

  it("chfToCents rejette les montants invalides", () => {
    expect(() => chfToCents("abc")).toThrow();
  });

  it("centsToChf et formatChf", () => {
    expect(centsToChf(123455)).toBe(1234.55);
    expect(formatChf(123455)).toMatch(/1.234.55/);
    expect(formatChf(123455, true)).toMatch(/^CHF /);
  });
});

describe("money : TVA", () => {
  it("vatFromNet applique le taux et arrondit au centime", () => {
    // 1000.00 @ 8.10% = 81.00
    expect(vatFromNet(100000, 810)).toBe(8100);
    // 333.35 @ 2.60% = 8.6671 -> 8.67
    expect(vatFromNet(33335, 260)).toBe(867);
  });

  it("splitGross décompose un TTC en HT + TVA exacts", () => {
    const { net, vat } = splitGross(108100, 810);
    expect(net).toBe(100000);
    expect(vat).toBe(8100);
    expect(net + vat).toBe(108100);
  });

  it("splitGross avec taux 0 renvoie tout en HT", () => {
    expect(splitGross(50000, 0)).toEqual({ net: 50000, vat: 0 });
  });

  it("resolveAmounts cohérent que la saisie soit HT ou TTC", () => {
    const fromHt = resolveAmounts(100000, "ht", 810);
    expect(fromHt).toEqual({ ht: 100000, vat: 8100, ttc: 108100 });

    const fromTtc = resolveAmounts(108100, "ttc", 810);
    expect(fromTtc.ht).toBe(100000);
    expect(fromTtc.vat).toBe(8100);
    expect(fromTtc.ttc).toBe(108100);

    // ht + tva === ttc dans les deux cas
    expect(fromHt.ht + fromHt.vat).toBe(fromHt.ttc);
    expect(fromTtc.ht + fromTtc.vat).toBe(fromTtc.ttc);
  });
});

describe("money : conversion de devise", () => {
  it("toChf applique le taux ×10000", () => {
    // 100.00 EUR @ 0.95 -> 95.00 CHF
    expect(toChf(10000, 9500)).toBe(9500);
  });
});
