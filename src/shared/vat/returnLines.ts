/**
 * Formats a VatReturnResult into ordered lines for display and export,
 * faithful to the structure of the FTA form.
 */

import { VAT_CODES, type VatCode } from "./codes.js";
import type { VatReturnResult } from "./compute.js";

export interface ReturnLine {
  code: VatCode;
  label: string;
  section: string;
  /** Base («Prestations CHF»), in cents, or null if not applicable. */
  base: number | null;
  /** Tax («Impôt CHF»), in cents, or null. */
  tax: number | null;
  /** Total line (highlighted). */
  total: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  contre_prestations: "I. Chiffre d'affaires",
  deductions: "Déductions",
  impot: "Calcul de l'impôt",
  impot_prealable: "Impôt préalable",
  solde: "Solde",
  autres: "III. Autres mouvements de fonds",
};

export function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}

/** Order of the codes as shown in the VAT return. */
const ORDER: VatCode[] = [
  "200", "205",
  "220", "221", "225", "230", "235", "280", "289", "299",
  "303", "313", "343", "379", "383", "399",
  "400", "405", "410", "415", "420", "479",
  "500", "510",
  "900", "910",
];

export function toReturnLines(r: VatReturnResult): ReturnLine[] {
  const base: Record<VatCode, number | null> = {
    "200": r.b200, "205": r.b205,
    "220": r.b220, "221": r.b221, "225": r.b225, "230": r.b230, "235": r.b235, "280": r.b280,
    "289": r.b289, "299": r.b299,
    "303": r.b303, "313": r.b313, "343": r.b343, "379": r.b379, "383": null, "399": null,
    "400": null, "405": null, "410": null, "415": null, "420": null, "479": null,
    "500": null, "510": null,
    "900": r.b900, "910": r.b910,
  };
  const tax: Record<VatCode, number | null> = {
    "200": null, "205": null,
    "220": null, "221": null, "225": null, "230": null, "235": null, "280": null,
    "289": null, "299": null,
    "303": r.tax303, "313": r.tax313, "343": r.tax343, "379": null, "383": r.tax383, "399": r.b399,
    "400": r.t400, "405": r.t405, "410": r.t410, "415": r.t415, "420": r.t420, "479": r.b479,
    "500": r.b500, "510": r.b510,
    "900": null, "910": null,
  };

  return ORDER.map((code) => ({
    code,
    label: VAT_CODES[code].label,
    section: VAT_CODES[code].section,
    base: base[code],
    tax: tax[code],
    total: VAT_CODES[code].computed,
  }));
}
