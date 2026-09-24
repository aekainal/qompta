/**
 * The zod schemas are applied on the main side before writing, and `parse()`
 * **silently drops** any key absent from the schema. A field added to the type
 * but forgotten in the schema therefore vanishes without error — the form seems
 * to work and nothing is stored.
 *
 * These tests check that a complete object goes through the schema losing nothing.
 */

import { describe, expect, it } from "vitest";
import { companyInputSchema } from "../src/shared/schemas/company.js";
import { thirdPartyInputSchema } from "../src/shared/schemas/invoice.js";
import type { CompanyInput, ThirdPartyInput } from "../src/shared/types.js";

describe("schémas — aucun champ perdu au passage", () => {
  it("conserve l'adresse structurée d'un tiers", () => {
    const input: Required<ThirdPartyInput> = {
      kind: "client",
      name: "YASURAGI",
      email: "contact@yasuragi.ch",
      phone: "032 000 00 00",
      vatNumber: "CHE-179.114.532",
      rcNumber: "CH-036-1102819-0",
      notes: "Client fidèle",
      addressLine2: "titulaire Umahara",
      street: "Rue Albert-Gobat",
      buildingNumber: "2",
      zip: "2720",
      city: "Tramelan",
      country: "CH",
    };

    const parsed = thirdPartyInputSchema.parse(input);
    expect(parsed).toEqual(input);
    // Fields essential to the QR-bill and to carrying over onto the documents.
    for (const key of ["street", "buildingNumber", "zip", "city", "country"] as const) {
      expect(parsed[key], `le champ ${key} est supprimé par le schéma`).toBe(input[key]);
    }
  });

  it("conserve les coordonnées de document d'une société", () => {
    const input: Required<CompanyInput> = {
      name: "Qwasar Gerber RI",
      legalForm: "raison_individuelle",
      ideNumber: "CHE-220.801.205",
      vatNumber: "CHE-220.801.205 TVA",
      rcRegistered: true,
      accountingMode: "simple",
      shareCapital: null,
      defaultCurrency: "CHF",
      color: "#3b82f6",
      rcNumber: "CH-036-1107245-4",
      email: "contact@qwasar.ch",
      phone: "032 000 00 00",
      website: "https://qwasar.ch",
      street: "Rue Chautenatte",
      buildingNumber: "19",
      zip: "2720",
      city: "Tramelan",
      country: "CH",
      logoText: "QWASAR",
    };

    expect(companyInputSchema.parse(input)).toEqual(input);
  });
});
