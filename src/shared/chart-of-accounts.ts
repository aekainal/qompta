/**
 * Default chart of accounts inspired by the Swiss SME chart (Sterchi).
 * Adapted to the legal form: single-entry accounting does not expose the capital
 * accounts; the Sàrl/SA adds capital, reserves and shareholder loan account.
 */

import type { LegalForm } from "./legal-form.js";
import { rulesFor } from "./legal-form.js";

export interface AccountSeed {
  code: string;
  label: string;
  kind: "product" | "expense" | "asset" | "liability" | "equity";
  defaultVatCode?: string;
  isInvestment?: boolean;
}

/** Revenue accounts (common to all legal forms). */
const PRODUCTS: AccountSeed[] = [
  { code: "3000", label: "Ventes de prestations", kind: "product", defaultVatCode: "303" },
  { code: "3200", label: "Ventes de marchandises", kind: "product", defaultVatCode: "303" },
  { code: "3600", label: "Autres produits d'exploitation", kind: "product", defaultVatCode: "303" },
  { code: "3700", label: "Produits exonérés / export", kind: "product", defaultVatCode: "220" },
];

/** Expenses (common). The default VAT code steers the input tax 400/405. */
const EXPENSES: AccountSeed[] = [
  { code: "4000", label: "Achats de marchandises / matériel", kind: "expense", defaultVatCode: "400" },
  { code: "4400", label: "Sous-traitance", kind: "expense", defaultVatCode: "400" },
  { code: "5000", label: "Salaires", kind: "expense" },
  { code: "5700", label: "Charges sociales", kind: "expense" },
  { code: "6000", label: "Loyer", kind: "expense", defaultVatCode: "400" },
  { code: "6300", label: "Assurances", kind: "expense" },
  { code: "6200", label: "Frais de véhicule", kind: "expense", defaultVatCode: "400" },
  { code: "6500", label: "Frais administratifs", kind: "expense", defaultVatCode: "400" },
  { code: "6600", label: "Marketing / publicité", kind: "expense", defaultVatCode: "400" },
  { code: "6700", label: "Honoraires", kind: "expense", defaultVatCode: "400" },
  { code: "6800", label: "Amortissements", kind: "expense" },
  { code: "1500", label: "Investissements / équipements", kind: "asset", defaultVatCode: "405", isInvestment: true },
  { code: "6900", label: "Autres charges", kind: "expense", defaultVatCode: "400" },
];

/** Equity accounts (Sàrl/SA only). */
const EQUITY: AccountSeed[] = [
  { code: "2800", label: "Capital social", kind: "equity" },
  { code: "2900", label: "Réserve légale", kind: "equity" },
  { code: "2950", label: "Réserves volontaires", kind: "equity" },
  { code: "2850", label: "Compte courant associé", kind: "liability" },
  { code: "2990", label: "Report à nouveau / bénéfice reporté", kind: "equity" },
];

/**
 * Returns the default chart of accounts adapted to the legal form.
 */
export function defaultChartOfAccounts(form: LegalForm): AccountSeed[] {
  const rules = rulesFor(form);
  const accounts = [...PRODUCTS, ...EXPENSES];
  if (rules.usesEquityCapital) {
    accounts.push(...EQUITY);
  }
  return accounts;
}
