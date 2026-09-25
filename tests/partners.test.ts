/**
 * Partners: company customers under contract.
 * The list is derived, never entered; these tests pin the rule down.
 */

import { describe, expect, it } from "vitest";
import {
  buildPartners,
  summarizePartners,
  type PartnerContract,
  type PartnerInvoice,
  type PartnerThirdParty,
} from "../src/shared/partners.js";

const tp = (over: Partial<PartnerThirdParty> & { id: string }): PartnerThirdParty => ({
  name: over.id,
  kind: "client",
  entityType: "company",
  city: null,
  email: null,
  archived: false,
  ...over,
});

const contract = (over: Partial<PartnerContract> & { id: string; thirdPartyId: string }): PartnerContract => ({
  number: `CC${over.id}`,
  status: "signed",
  title: null,
  startDate: null,
  endDate: null,
  minDurationMonths: null,
  oneOffAmountHt: null,
  monthlyAmountHt: null,
  ...over,
});

const sale = (thirdPartyId: string, amountHt: number, status = "issued", issueDate = "2026-03-01"): PartnerInvoice => ({
  thirdPartyId,
  type: "sale",
  status,
  issueDate,
  amountHt,
  amountTtc: Math.round(amountHt * 1.081),
});

describe("qui est partenaire", () => {
  it("un client entreprise sous contrat, oui", () => {
    const p = buildPartners([tp({ id: "a" })], [contract({ id: "1", thirdPartyId: "a" })], []);
    expect(p.map((x) => x.id)).toEqual(["a"]);
  });

  it("une personne physique, non, même sous contrat", () => {
    const p = buildPartners(
      [tp({ id: "a", entityType: "person" })],
      [contract({ id: "1", thirdPartyId: "a" })],
      [],
    );
    expect(p).toEqual([]);
  });

  it("une entreprise cliente sans contrat, non", () => {
    expect(buildPartners([tp({ id: "a" })], [], [])).toEqual([]);
  });

  it("un fournisseur, non ; un « client & fournisseur », oui", () => {
    const contrats = [contract({ id: "1", thirdPartyId: "f" }), contract({ id: "2", thirdPartyId: "b" })];
    const p = buildPartners(
      [tp({ id: "f", kind: "supplier" }), tp({ id: "b", kind: "both" })],
      contrats,
      [],
    );
    expect(p.map((x) => x.id)).toEqual(["b"]);
  });

  it("un tiers archivé reste partenaire : l'archivage n'annule pas un engagement", () => {
    const p = buildPartners(
      [tp({ id: "a", archived: true })],
      [contract({ id: "1", thirdPartyId: "a" })],
      [],
    );
    expect(p).toHaveLength(1);
  });
});

describe("ce que porte la relation", () => {
  it("ne compte que les contrats signés dans le récurrent", () => {
    const p = buildPartners(
      [tp({ id: "a" })],
      [
        contract({ id: "1", thirdPartyId: "a", status: "signed", monthlyAmountHt: 50000, oneOffAmountHt: 300000 }),
        contract({ id: "2", thirdPartyId: "a", status: "draft", monthlyAmountHt: 999900 }),
        contract({ id: "3", thirdPartyId: "a", status: "terminated", monthlyAmountHt: 700000 }),
      ],
      [],
    );
    expect(p[0].activeContracts).toBe(1);
    expect(p[0].monthlyRecurringHt).toBe(50000);
    expect(p[0].oneOffHt).toBe(300000);
    // The three contracts stay visible: history counts.
    expect(p[0].contracts).toHaveLength(3);
  });

  it("sépare facturé, encaissé et reste dû", () => {
    const p = buildPartners(
      [tp({ id: "a" })],
      [contract({ id: "1", thirdPartyId: "a" })],
      [
        sale("a", 100000, "paid", "2026-01-10"),
        sale("a", 200000, "issued", "2026-05-10"),
        sale("a", 50000, "draft", "2026-06-01"),
        // Invoice of another customer: must not pollute.
        sale("z", 900000, "paid"),
      ],
    );
    expect(p[0].invoicedHt).toBe(350000);
    expect(p[0].collectedHt).toBe(100000);
    // The draft is not due: it was never issued.
    expect(p[0].outstandingTtc).toBe(Math.round(200000 * 1.081));
    expect(p[0].lastInvoiceDate).toBe("2026-06-01");
  });

  it("classe les contrats vivants d'abord, puis par récurrent décroissant", () => {
    const p = buildPartners(
      [tp({ id: "petit" }), tp({ id: "gros" }), tp({ id: "dormant" })],
      [
        contract({ id: "1", thirdPartyId: "petit", monthlyAmountHt: 10000 }),
        contract({ id: "2", thirdPartyId: "gros", monthlyAmountHt: 90000 }),
        contract({ id: "3", thirdPartyId: "dormant", status: "terminated", monthlyAmountHt: 500000 }),
      ],
      [],
    );
    expect(p.map((x) => x.id)).toEqual(["gros", "petit", "dormant"]);
  });
});

describe("totaux", () => {
  it("annualise le récurrent et compte les partenaires actifs", () => {
    const partners = buildPartners(
      [tp({ id: "a" }), tp({ id: "b" })],
      [
        contract({ id: "1", thirdPartyId: "a", monthlyAmountHt: 50000 }),
        contract({ id: "2", thirdPartyId: "b", status: "draft", monthlyAmountHt: 30000 }),
      ],
      [sale("a", 100000, "issued")],
    );
    const s = summarizePartners(partners);
    expect(s.count).toBe(2);
    expect(s.activeCount).toBe(1);
    expect(s.monthlyRecurringHt).toBe(50000);
    expect(s.yearlyRecurringHt).toBe(600000);
    expect(s.invoicedHt).toBe(100000);
  });
});
