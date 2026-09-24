/**
 * Business rules depending on the legal form of the company.
 * See the specification §2.
 */

export type LegalForm =
  | "raison_individuelle"
  | "societe_simple"
  | "snc"
  | "sarl"
  | "sa"
  | "association";

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  raison_individuelle: "Raison individuelle",
  societe_simple: "Société simple",
  snc: "Société en nom collectif (SNC)",
  sarl: "Société à responsabilité limitée (Sàrl)",
  sa: "Société anonyme (SA)",
  association: "Association",
};

export const LEGAL_FORM_SHORT: Record<LegalForm, string> = {
  raison_individuelle: "RI",
  societe_simple: "SS",
  snc: "SNC",
  sarl: "Sàrl",
  sa: "SA",
  association: "Assoc.",
};

export interface LegalFormRules {
  /** Legal entity (separate tax entity)? */
  hasLegalPersonality: boolean;
  /** Is the Shareholders module (shares) relevant? */
  usesAssociates: boolean;
  /** Notion of share capital / reserves / equity accounts? */
  usesEquityCapital: boolean;
  /** Is double-entry accounting mandatory? */
  doubleEntryRequired: boolean;
  /** Transparent taxation (result reported by the shareholders)? */
  transparentTaxation: boolean;
  /** Type of tax file produced. */
  taxModule: "independent_income" | "partner_allocation" | "corporate" | "association";
}

/**
 * Legal threshold for single-entry accounting (receipts/payments): revenue < 500'000 CHF.
 */
export const SIMPLE_ACCOUNTING_THRESHOLD_CHF_CENTS = 500_000_00;

const RULES: Record<LegalForm, LegalFormRules> = {
  raison_individuelle: {
    hasLegalPersonality: false,
    usesAssociates: false,
    usesEquityCapital: false,
    doubleEntryRequired: false,
    transparentTaxation: true,
    taxModule: "independent_income",
  },
  societe_simple: {
    hasLegalPersonality: false,
    usesAssociates: true,
    usesEquityCapital: false,
    doubleEntryRequired: false,
    transparentTaxation: true,
    taxModule: "partner_allocation",
  },
  snc: {
    hasLegalPersonality: false,
    usesAssociates: true,
    usesEquityCapital: false,
    doubleEntryRequired: true,
    transparentTaxation: true,
    taxModule: "partner_allocation",
  },
  sarl: {
    hasLegalPersonality: true,
    usesAssociates: false,
    usesEquityCapital: true,
    doubleEntryRequired: true,
    transparentTaxation: false,
    taxModule: "corporate",
  },
  sa: {
    hasLegalPersonality: true,
    usesAssociates: false,
    usesEquityCapital: true,
    doubleEntryRequired: true,
    transparentTaxation: false,
    taxModule: "corporate",
  },
  association: {
    hasLegalPersonality: true,
    usesAssociates: false,
    usesEquityCapital: false,
    doubleEntryRequired: false,
    transparentTaxation: false,
    // An association has no share capital: taxed on the profit only.
    taxModule: "association",
  },
};

export function rulesFor(form: LegalForm): LegalFormRules {
  return RULES[form];
}

/**
 * Determines the accounting mode proposed by default from the legal form and yearly revenue.
 * @param annualRevenueCents yearly revenue in cents
 */
export function suggestedAccountingMode(
  form: LegalForm,
  annualRevenueCents: number,
): "simple" | "double" {
  const rules = rulesFor(form);
  if (rules.doubleEntryRequired) return "double";
  if (annualRevenueCents >= SIMPLE_ACCOUNTING_THRESHOLD_CHF_CENTS) return "double";
  return "simple";
}
