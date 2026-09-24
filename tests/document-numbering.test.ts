import { describe, expect, it } from "vitest";
import {
  DOCUMENT_PREFIX,
  isGeneratedNumber,
  nextDocumentNumber,
  parseDocumentNumber,
} from "../src/shared/documents/numbering.js";

describe("numérotation des documents", () => {
  it("préfixe DC les devis et FC les factures", () => {
    expect(DOCUMENT_PREFIX.quote).toBe("DC");
    expect(DOCUMENT_PREFIX.invoice).toBe("FC");
  });

  it("démarre à 01 le premier document du jour", () => {
    expect(nextDocumentNumber("quote", "2026-07-22", [])).toBe("DC2026072201");
    expect(nextDocumentNumber("invoice", "2026-07-22", [])).toBe("FC2026072201");
  });

  it("incrémente le compteur au sein d'une même journée", () => {
    const existing = ["DC2026072201", "DC2026072202"];
    expect(nextDocumentNumber("quote", "2026-07-22", existing)).toBe("DC2026072203");
  });

  it("repart à 01 le lendemain", () => {
    const existing = ["DC2026072201", "DC2026072207"];
    expect(nextDocumentNumber("quote", "2026-07-23", existing)).toBe("DC2026072301");
  });

  it("ne mélange pas les séries devis et factures", () => {
    const existing = ["FC2026072201", "FC2026072202", "FC2026072203"];
    expect(nextDocumentNumber("quote", "2026-07-22", existing)).toBe("DC2026072201");
  });

  it("ignore les numéros hors format sans échouer", () => {
    const existing = ["ancien-devis", "", null, "2026072205", "DC2026072204"];
    expect(nextDocumentNumber("quote", "2026-07-22", existing)).toBe("DC2026072205");
  });

  it("refuse de dépasser 99 documents par jour et par type", () => {
    const existing = ["DC2026072299"];
    expect(() => nextDocumentNumber("quote", "2026-07-22", existing)).toThrow(/saturée/);
  });

  it("reconnaît et décompose un numéro généré", () => {
    expect(isGeneratedNumber("quote", "DC2026072201")).toBe(true);
    expect(isGeneratedNumber("quote", "FC2026072201")).toBe(false);
    expect(parseDocumentNumber("invoice", "FC2026072212")).toEqual({
      date: "2026-07-22",
      seq: 12,
    });
    expect(parseDocumentNumber("invoice", "bricolé")).toBeNull();
  });
});
