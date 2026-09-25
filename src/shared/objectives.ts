/**
 * Management targets: metric catalogue, types, and **pure** computation of the
 * progress (actual vs target). Tested, with no DB dependency.
 *
 * A metric has a **unit** (money in cents, count, or rate in basis points) and
 * a **default direction**: aim for a floor (`at_least`, e.g. revenue) or a
 * ceiling (`at_most`, e.g. expenses). The actual value is never stored: it is
 * recomputed from the data (see `src/shared/metrics`).
 */

export type MetricUnit = "money" | "count" | "rate";
export type ObjectiveDirection = "at_least" | "at_most";
export type ObjectiveCategory = "finance" | "sales" | "clients" | "cash" | "funds";
export type ObjectivePeriodType = "year" | "quarter" | "month";

/** Catalogue keys, one per tracked metric. */
export type ObjectiveMetric =
  // Finance
  | "revenue_invoiced"
  | "revenue_collected"
  | "result"
  | "charges"
  | "margin_rate"
  | "collection_rate"
  | "expense_ratio"
  // Cash position & receivables
  | "receivables"
  | "payables"
  | "overdue_amount"
  | "dso"
  // Sales
  | "quotes_won_amount"
  | "quotes_won_count"
  | "quotes_created_count"
  | "win_rate"
  | "invoices_sales_count"
  | "avg_invoice"
  // Customers / contracts
  | "new_clients_count"
  | "contracts_signed_count"
  | "recurring_monthly"
  | "recurring_yearly"
  // Funds
  | "funding_amount";

export interface MetricDef {
  key: ObjectiveMetric;
  label: string;
  category: ObjectiveCategory;
  unit: MetricUnit;
  /** Natural direction of the metric (revenue is a floor, expenses a ceiling). */
  defaultDirection: ObjectiveDirection;
  /** Detail shown when creating a target. */
  hint?: string;
  /**
   * Point-in-time metric (state at the end of the period) rather than cumulated
   * over the period: the recurring revenue of the contracts is worth what it is
   * worth today, it does not "add up" month after month.
   */
  snapshot?: boolean;
}

export const CATEGORY_LABELS: Record<ObjectiveCategory, string> = {
  finance: "Finance",
  sales: "Commercial",
  clients: "Clients & contrats",
  cash: "Trésorerie & créances",
  funds: "Fonds propres",
};

/** The catalogue, in display order. */
export const METRIC_CATALOG: MetricDef[] = [
  { key: "revenue_invoiced", label: "Chiffre d'affaires facturé", category: "finance", unit: "money", defaultDirection: "at_least", hint: "Ventes HT émises sur la période." },
  { key: "revenue_collected", label: "Chiffre d'affaires encaissé", category: "finance", unit: "money", defaultDirection: "at_least", hint: "Ventes HT payées sur la période." },
  { key: "result", label: "Résultat (bénéfice)", category: "finance", unit: "money", defaultDirection: "at_least", hint: "Produits − charges (HT)." },
  { key: "charges", label: "Charges (plafond)", category: "finance", unit: "money", defaultDirection: "at_most", hint: "Achats HT à ne pas dépasser." },
  { key: "margin_rate", label: "Marge", category: "finance", unit: "rate", defaultDirection: "at_least", hint: "Résultat / CA facturé." },
  { key: "collection_rate", label: "Taux d'encaissement", category: "finance", unit: "rate", defaultDirection: "at_least", hint: "Encaissé / facturé." },
  { key: "expense_ratio", label: "Taux de charges", category: "finance", unit: "rate", defaultDirection: "at_most", hint: "Charges / CA facturé (plus bas = mieux)." },

  { key: "receivables", label: "Créances clients en cours", category: "cash", unit: "money", defaultDirection: "at_most", hint: "Ventes émises non encore encaissées (TTC).", snapshot: true },
  { key: "payables", label: "Dettes fournisseurs", category: "cash", unit: "money", defaultDirection: "at_most", hint: "Achats reçus non encore payés (TTC).", snapshot: true },
  { key: "overdue_amount", label: "Montant en retard", category: "cash", unit: "money", defaultDirection: "at_most", hint: "Factures de vente échues impayées (TTC).", snapshot: true },
  { key: "dso", label: "Délai moyen d'encaissement (j)", category: "cash", unit: "count", defaultDirection: "at_most", hint: "Jours moyens entre émission et paiement d'une vente." },

  { key: "quotes_won_amount", label: "Devis gagnés (montant)", category: "sales", unit: "money", defaultDirection: "at_least", hint: "Montant HT des devis convertis." },
  { key: "quotes_won_count", label: "Devis gagnés (nombre)", category: "sales", unit: "count", defaultDirection: "at_least" },
  { key: "quotes_created_count", label: "Devis créés (nombre)", category: "sales", unit: "count", defaultDirection: "at_least" },
  { key: "win_rate", label: "Taux de transformation", category: "sales", unit: "rate", defaultDirection: "at_least", hint: "Gagnés / (gagnés + perdus)." },
  { key: "invoices_sales_count", label: "Factures de vente (nombre)", category: "sales", unit: "count", defaultDirection: "at_least" },
  { key: "avg_invoice", label: "Panier moyen", category: "sales", unit: "money", defaultDirection: "at_least", hint: "CA facturé / nombre de ventes." },

  { key: "new_clients_count", label: "Nouveaux clients", category: "clients", unit: "count", defaultDirection: "at_least", hint: "Clients dont la première facture tombe sur la période." },
  { key: "contracts_signed_count", label: "Contrats signés", category: "clients", unit: "count", defaultDirection: "at_least" },
  { key: "recurring_monthly", label: "Revenu récurrent mensuel (MRR)", category: "clients", unit: "money", defaultDirection: "at_least", hint: "Somme des abonnements des contrats signés.", snapshot: true },
  { key: "recurring_yearly", label: "Revenu récurrent annuel (ARR)", category: "clients", unit: "money", defaultDirection: "at_least", hint: "MRR × 12.", snapshot: true },

  { key: "funding_amount", label: "Apports des associés", category: "funds", unit: "money", defaultDirection: "at_least", hint: "Apports nets sur la période." },
];

const BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRIC_CATALOG.map((m) => [m.key, m]));

export function metricDef(key: ObjectiveMetric): MetricDef {
  const def = BY_KEY[key];
  if (!def) throw new Error(`Métrique inconnue : ${key}`);
  return def;
}

/** Computed actual values, one per metric, for a given period. */
export type MetricValues = Record<ObjectiveMetric, number>;

// ── Objects exposed by the repository / IPC ──

export interface Objective {
  id: string;
  companyId: string;
  metric: ObjectiveMetric;
  periodType: ObjectivePeriodType;
  periodYear: number;
  periodQuarter: number | null;
  periodMonth: number | null;
  targetValue: number;
  direction: ObjectiveDirection;
  label: string | null;
  createdAt: string;
}

export interface ObjectiveInput {
  metric: ObjectiveMetric;
  periodType: ObjectivePeriodType;
  periodYear: number;
  periodQuarter?: number | null;
  periodMonth?: number | null;
  targetValue: number;
  direction?: ObjectiveDirection;
  label?: string | null;
}

export interface ObjectiveProgress {
  objective: Objective;
  /** Actual value reached (cents / count / bps depending on the unit). */
  actual: number;
  target: number;
  /** Actual / target in basis points: 10000 = target reached. May exceed it. */
  ratioBps: number;
  /** Is the target met? (≥ target for a floor, ≤ target for a ceiling.) */
  met: boolean;
  unit: MetricUnit;
  direction: ObjectiveDirection;
}

/** Readable label of a target period. */
export function objectivePeriodLabel(o: Pick<Objective, "periodType" | "periodYear" | "periodQuarter" | "periodMonth">): string {
  if (o.periodType === "quarter" && o.periodQuarter) return `T${o.periodQuarter} ${o.periodYear}`;
  if (o.periodType === "month" && o.periodMonth) {
    const m = String(o.periodMonth).padStart(2, "0");
    return `${m}/${o.periodYear}`;
  }
  return `Année ${o.periodYear}`;
}

/** Displayed name of a target: its custom label, otherwise the catalogue one. */
export function objectiveName(o: Pick<Objective, "metric" | "label">): string {
  return o.label?.trim() || metricDef(o.metric).label;
}

/**
 * Progress of a target against its actual value.
 *
 * For a floor (`at_least`), `ratioBps = actual / target` and the target is met
 * from 100 % on. For a ceiling (`at_most`), the ratio measures the **usage**
 * (actual / target): met as long as it stays ≤ 100 %, exceeded beyond that.
 */
export function computeObjectiveProgress(objective: Objective, actual: number): ObjectiveProgress {
  const target = objective.targetValue;
  const unit = metricDef(objective.metric).unit;
  const ratioBps =
    target !== 0 ? Math.round((actual * 10000) / target) : actual > 0 ? 10000 : 0;
  const met = objective.direction === "at_most" ? actual <= target : actual >= target;
  return { objective, actual, target, ratioBps, met, unit, direction: objective.direction };
}

/**
 * Progress as a percentage **when it means something**, otherwise `null`.
 *
 * The actual/target ratio loses all meaning as soon as the reached value is
 * negative or the target tiny: a result of −971 CHF against a target of 1 CHF
 * gives "−97 135 %", an exact and absurd figure, which we saw displayed as is.
 * In those cases, showing nothing beats showing nonsense.
 */
export function objectiveRatioLabel(p: Pick<ObjectiveProgress, "actual" | "target" | "ratioBps">): string | null {
  if (p.target <= 0 || p.actual < 0) return null;
  const pct = p.ratioBps / 100;
  if (pct > 1000) return "cible largement dépassée";
  return `${pct.toFixed(0)} %`;
}

/** Target value converted from a human input (CHF, %, count). */
export function targetFromInput(unit: MetricUnit, raw: number): number {
  if (unit === "money") return Math.round(raw * 100); // CHF -> cents
  if (unit === "rate") return Math.round(raw * 100); // % -> basis points
  return Math.round(raw); // count
}

/** Inverse of `targetFromInput`, to prefill an edit form. */
export function targetToInput(unit: MetricUnit, stored: number): number {
  if (unit === "money") return stored / 100;
  if (unit === "rate") return stored / 100;
  return stored;
}
