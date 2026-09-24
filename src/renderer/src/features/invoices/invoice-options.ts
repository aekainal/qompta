/** Invoice labels and options (UI). */

import type { InvoiceStatus, RateType, VatTreatment } from "@shared/types.js";

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  paid: "Payée",
  partial: "Partiellement payée",
  overdue: "En retard",
  settled_vat: "Réglé (pour TVA)",
};

export const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  issued: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  paid: "bg-green-500/15 text-green-600 dark:text-green-400",
  partial: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  overdue: "bg-red-500/15 text-red-600 dark:text-red-400",
  settled_vat: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
};

export const TREATMENT_LABELS: Record<VatTreatment, string> = {
  standard: "Imposée (taux)",
  exempt_export: "Exonérée / export (220)",
  foreign: "Prestation à l'étranger (221)",
  excluded: "Exclue art. 21 (230)",
  discount: "Rabais / escompte (235)",
  input_material: "Achat matériel/services (400)",
  input_investment: "Investissement / charge (405)",
  subsidy: "Subvention (900)",
  donation: "Don / dividende (910)",
};

export const SALE_TREATMENTS: VatTreatment[] = [
  "standard",
  "exempt_export",
  "foreign",
  "excluded",
  "discount",
  "subsidy",
  "donation",
];

export const PURCHASE_TREATMENTS: VatTreatment[] = [
  "input_material",
  "input_investment",
  "subsidy",
  "donation",
];

export const RATE_LABELS: Record<RateType, string> = {
  normal: "Normal 8.10 %",
  reduced: "Réduit 2.60 %",
  lodging: "Hébergement 3.80 %",
  zero: "Aucun (0 %)",
};

/** The treatments that force a zero rate (no VAT). */
export function forcesZeroRate(t: VatTreatment): boolean {
  return ["exempt_export", "foreign", "excluded", "discount", "subsidy", "donation"].includes(t);
}
