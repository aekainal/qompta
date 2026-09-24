/**
 * Official codes of the Swiss VAT return (FTA/ESTV).
 * See docs/VAT-LOGIC.md for the regulatory detail.
 */

/** Identifiers of the return codes (strings, to stay faithful to the form). */
export type VatCode =
  // I. Considerations
  | "200"
  | "205"
  // II. Deductions
  | "220"
  | "221"
  | "225"
  | "230"
  | "235"
  | "280"
  | "289"
  | "299"
  // Tax computation
  | "303"
  | "313"
  | "343"
  | "379"
  | "383"
  | "399"
  // Input tax
  | "400"
  | "405"
  | "410"
  | "415"
  | "420"
  | "479"
  // Balance
  | "500"
  | "510"
  // III. Other cash movements
  | "900"
  | "910";

export interface VatCodeDef {
  code: VatCode;
  label: string;
  section: "contre_prestations" | "deductions" | "impot" | "impot_prealable" | "solde" | "autres";
  /** true if the line has an «Impôt CHF» column. */
  hasTax: boolean;
  /** true if the value is computed (total), false if entered/aggregated from the invoices. */
  computed: boolean;
}

export const VAT_CODES: Record<VatCode, VatCodeDef> = {
  "200": { code: "200", label: "Total des contre-prestations convenues/reçues", section: "contre_prestations", hasTax: false, computed: false },
  "205": { code: "205", label: "Part du ch. 200 : prestations exclues optées (art. 22)", section: "contre_prestations", hasTax: false, computed: false },

  "220": { code: "220", label: "Prestations exonérées (exportations art. 23 ; art. 107)", section: "deductions", hasTax: false, computed: false },
  "221": { code: "221", label: "Prestations fournies à l'étranger", section: "deductions", hasTax: false, computed: false },
  "225": { code: "225", label: "Transferts avec procédure de déclaration (art. 38)", section: "deductions", hasTax: false, computed: false },
  "230": { code: "230", label: "Prestations exclues du champ (art. 21), sans option", section: "deductions", hasTax: false, computed: false },
  "235": { code: "235", label: "Diminutions de la contre-prestation (rabais, escomptes)", section: "deductions", hasTax: false, computed: false },
  "280": { code: "280", label: "Divers (p. ex. valeur du terrain)", section: "deductions", hasTax: false, computed: false },
  "289": { code: "289", label: "Total des déductions", section: "deductions", hasTax: false, computed: true },
  "299": { code: "299", label: "Total du chiffre d'affaires imposable", section: "deductions", hasTax: false, computed: true },

  "303": { code: "303", label: "Prestations au taux normal", section: "impot", hasTax: true, computed: false },
  "313": { code: "313", label: "Prestations au taux réduit", section: "impot", hasTax: true, computed: false },
  "343": { code: "343", label: "Prestations au taux spécial (hébergement)", section: "impot", hasTax: true, computed: false },
  "379": { code: "379", label: "Total du chiffre d'affaires imposable", section: "impot", hasTax: false, computed: true },
  "383": { code: "383", label: "Impôt sur les acquisitions", section: "impot", hasTax: true, computed: false },
  "399": { code: "399", label: "Total de l'impôt dû", section: "impot", hasTax: true, computed: true },

  "400": { code: "400", label: "Impôt préalable sur coûts en matériel et services", section: "impot_prealable", hasTax: true, computed: false },
  "405": { code: "405", label: "Impôt préalable sur investissements et charges d'exploitation", section: "impot_prealable", hasTax: true, computed: false },
  "410": { code: "410", label: "Dégrèvement ultérieur de l'impôt préalable (art. 32)", section: "impot_prealable", hasTax: true, computed: false },
  "415": { code: "415", label: "Corrections de l'impôt préalable (art. 30, 31)", section: "impot_prealable", hasTax: true, computed: false },
  "420": { code: "420", label: "Réduction de la déduction (art. 33 al. 2)", section: "impot_prealable", hasTax: true, computed: false },
  "479": { code: "479", label: "Total de l'impôt préalable", section: "impot_prealable", hasTax: true, computed: true },

  "500": { code: "500", label: "Montant à payer", section: "solde", hasTax: true, computed: true },
  "510": { code: "510", label: "Solde en faveur de l'assujetti", section: "solde", hasTax: true, computed: true },

  "900": { code: "900", label: "Subventions, taxes touristiques, contributions", section: "autres", hasTax: false, computed: false },
  "910": { code: "910", label: "Dons, dividendes, dédommagements, etc.", section: "autres", hasTax: false, computed: false },
};
