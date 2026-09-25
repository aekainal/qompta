/**
 * Customizable dashboards: each company has a list of dashboards, and each
 * dashboard a list of widgets (KPI or chart) placed on a grid (x, y, width w,
 * height h in cells). Purely descriptive: the rendering and the computation of
 * the values live elsewhere (renderer + shared/dashboard).
 */

import type { ObjectiveMetric } from "./objectives.js";

export const GRID_COLS = 12;

export type WidgetKind = "kpi" | "chart";

/** Ready-made charts. `metric_monthly` plots a metric over 12 months; `custom` = built by hand. */
export type ChartKind =
  | "monthly_products_charges"
  | "monthly_pcr"
  | "result_cumulative"
  | "revenue_yoy"
  | "products_by_cat"
  | "expenses_by_cat"
  | "aging"
  | "quotes_pipeline"
  | "top_clients"
  | "unpaid_list"
  | "overdue_list"
  | "collected_vs_invoiced"
  | "result_waterfall"
  | "revenue_by_client"
  | "clients_cumulative"
  | "metric_monthly"
  | "custom";

// ── Custom chart: type x dimension x value ──

export type CustomChartType = "bar" | "line" | "pie";
export type CustomDim = "month" | "product_category" | "expense_category" | "client" | "quote_stage";

export interface CustomChart {
  type: CustomChartType;
  dim: CustomDim;
  /** Metric plotted when dim = "month" (the other dimensions have an implicit value: the amount). */
  metric?: ObjectiveMetric | null;
}

export const CUSTOM_TYPES: { type: CustomChartType; label: string }[] = [
  { type: "bar", label: "Barres" },
  { type: "line", label: "Ligne" },
  { type: "pie", label: "Camembert" },
];

export const CUSTOM_DIMS: { dim: CustomDim; label: string; needsMetric?: boolean }[] = [
  { dim: "month", label: "Par mois", needsMetric: true },
  { dim: "product_category", label: "Par catégorie de produits" },
  { dim: "expense_category", label: "Par catégorie de charges" },
  { dim: "client", label: "Par client" },
  { dim: "quote_stage", label: "Par étape de devis" },
];

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  /** kind="kpi": the metric displayed; chart="metric_monthly": the metric plotted. */
  metric?: ObjectiveMetric | null;
  /** kind="chart": the chart type (ready-made or "custom"). */
  chart?: ChartKind | null;
  /** Configuration of the custom chart (chart="custom"). */
  custom?: CustomChart | null;
  /** Position and size on the grid, in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: string;
  companyId: string;
  name: string;
  position: number;
  widgets: DashboardWidget[];
  createdAt: string;
}

export interface DashboardInput {
  name: string;
  position?: number;
  widgets?: DashboardWidget[];
}

export interface ChartDef {
  kind: ChartKind;
  label: string;
  w: number;
  h: number;
  needsMetric?: boolean;
}

/** Catalog of ready-made charts (the "custom" one is built by hand, outside the catalog). */
export const CHART_CATALOG: ChartDef[] = [
  { kind: "monthly_products_charges", label: "Produits / charges par mois (+ N-1)", w: 12, h: 7 },
  { kind: "monthly_pcr", label: "Produits, charges, résultat par mois", w: 6, h: 7 },
  { kind: "result_cumulative", label: "Résultat cumulé", w: 6, h: 7 },
  { kind: "revenue_yoy", label: "Chiffre d'affaires : N vs N-1", w: 12, h: 6 },
  { kind: "products_by_cat", label: "Produits par catégorie", w: 6, h: 7 },
  { kind: "expenses_by_cat", label: "Charges par catégorie", w: 6, h: 7 },
  { kind: "aging", label: "Ancienneté des créances", w: 6, h: 6 },
  { kind: "quotes_pipeline", label: "Pipeline des devis", w: 6, h: 7 },
  { kind: "top_clients", label: "Meilleurs clients", w: 6, h: 7 },
  { kind: "unpaid_list", label: "Factures impayées", w: 6, h: 5 },
  { kind: "overdue_list", label: "Factures en retard", w: 6, h: 5 },
  { kind: "collected_vs_invoiced", label: "Facturé vs encaissé par mois", w: 12, h: 7 },
  { kind: "result_waterfall", label: "Résultat : produits → charges", w: 6, h: 6 },
  { kind: "revenue_by_client", label: "CA par client", w: 6, h: 7 },
  { kind: "clients_cumulative", label: "Nouveaux clients cumulés", w: 6, h: 7 },
  { kind: "metric_monthly", label: "Métrique par mois (au choix)", w: 6, h: 7, needsMetric: true },
];

const CHART_KINDS = new Set<string>([...CHART_CATALOG.map((c) => c.kind), "custom"]);
export function isChartKind(v: string): v is ChartKind {
  return CHART_KINDS.has(v);
}

export function chartDef(kind: ChartKind): ChartDef {
  return CHART_CATALOG.find((c) => c.kind === kind) ?? { kind, label: "Graphe", w: 6, h: 6 };
}

/** Do two grid rectangles overlap? (touching edges = no overlap) */
export function widgetsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Minimum size of a widget by type (a KPI shrinks further than a chart). */
export function widgetMin(w: DashboardWidget): { minW: number; minH: number } {
  return w.kind === "kpi" ? { minW: 2, minH: 2 } : { minW: 3, minH: 3 };
}

/** Packs the widgets from left to right (used to lay out an initial arrangement). */
export function packWidgets(widgets: DashboardWidget[], cols = GRID_COLS): DashboardWidget[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return widgets.map((w) => {
    if (x + w.w > cols) { x = 0; y += rowH; rowH = 0; }
    const placed = { ...w, x, y };
    x += w.w;
    rowH = Math.max(rowH, w.h);
    return placed;
  });
}

/**
 * Completes the widgets of old dashboards (without coordinates/size): gives a
 * default size then packs those without a position. Idempotent once the
 * positions are laid out.
 */
export function normalizeWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  const sized = widgets.map((w) => {
    const d = w.kind === "kpi" ? { w: 3, h: 2 } : chartDef(w.chart ?? "custom");
    return {
      ...w,
      w: typeof w.w === "number" && w.w > 0 ? w.w : d.w,
      h: typeof w.h === "number" && w.h > 0 ? w.h : d.h,
    };
  });
  const needsPack = sized.some((w) => typeof w.x !== "number" || typeof w.y !== "number");
  return needsPack ? packWidgets(sized) : sized;
}

// ── Default dashboards (recreated on first launch, editable) ──

function kpi(id: string, metric: ObjectiveMetric, x: number, y: number, w: number, h: number): DashboardWidget {
  return { id, kind: "kpi", metric, chart: null, custom: null, x, y, w, h };
}
function graph(id: string, chart: ChartKind, x: number, y: number, w: number, h: number): DashboardWidget {
  return { id, kind: "chart", metric: null, chart, custom: null, x, y, w, h };
}
function custom(id: string, type: CustomChartType, dim: CustomDim, metric: ObjectiveMetric, x: number, y: number, w: number, h: number): DashboardWidget {
  return { id, kind: "chart", chart: "custom", metric: null, custom: { type, dim, metric }, x, y, w, h };
}

export interface DashboardTemplate {
  name: string;
  widgets: DashboardWidget[];
}

/** Dashboard templates: the first 3 are created automatically for a new company;
 * all are offered under the "+" button to add a ready-made one. */
export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    name: "Vue d'ensemble",
    widgets: [
      kpi("ov1", "revenue_invoiced", 0, 0, 3, 3),
      kpi("ov2", "result", 3, 0, 3, 3),
      kpi("ov3", "charges", 6, 0, 3, 3),
      kpi("ov4", "recurring_monthly", 9, 0, 3, 3),
      kpi("ov5", "new_clients_count", 0, 3, 2, 2),
      kpi("ov6", "collection_rate", 2, 3, 2, 2),
      graph("ov7", "monthly_products_charges", 0, 5, 12, 11),
      graph("ov8", "unpaid_list", 0, 16, 6, 5),
      graph("ov9", "overdue_list", 6, 16, 6, 5),
    ],
  },
  {
    name: "Finances",
    widgets: [
      kpi("fi1", "revenue_invoiced", 0, 0, 3, 3),
      kpi("fi2", "revenue_collected", 3, 0, 3, 3),
      kpi("fi3", "charges", 6, 0, 3, 3),
      kpi("fi4", "result", 9, 0, 3, 3),
      kpi("fi5", "margin_rate", 0, 3, 3, 2),
      kpi("fi6", "collection_rate", 3, 3, 3, 2),
      graph("fi7", "monthly_pcr", 6, 5, 6, 7),
      graph("fi8", "result_cumulative", 0, 5, 6, 7),
      graph("fi9", "revenue_yoy", 0, 12, 12, 6),
      graph("fi10", "products_by_cat", 0, 18, 6, 7),
      graph("fi11", "expenses_by_cat", 6, 18, 6, 7),
    ],
  },
  {
    name: "Commercial",
    widgets: [
      kpi("co1", "quotes_won_amount", 0, 0, 3, 2),
      kpi("co2", "win_rate", 3, 0, 3, 2),
      kpi("co3", "avg_invoice", 6, 0, 3, 2),
      kpi("co4", "new_clients_count", 9, 0, 3, 2),
      kpi("co5", "contracts_signed_count", 0, 2, 3, 2),
      kpi("co6", "recurring_yearly", 3, 2, 3, 2),
      graph("co7", "quotes_pipeline", 6, 4, 6, 7),
      graph("co8", "top_clients", 0, 4, 6, 7),
    ],
  },
  {
    name: "Rentabilité",
    widgets: [
      kpi("re1", "result", 0, 0, 3, 2),
      kpi("re2", "margin_rate", 3, 0, 3, 2),
      kpi("re3", "expense_ratio", 6, 0, 3, 2),
      kpi("re4", "revenue_invoiced", 9, 0, 3, 2),
      kpi("re5", "charges", 0, 2, 3, 2),
      kpi("re6", "avg_invoice", 3, 2, 3, 2),
      graph("re7", "result_waterfall", 6, 2, 3, 20),
      graph("re8", "monthly_pcr", 0, 4, 6, 11),
      graph("re9", "result_cumulative", 9, 2, 3, 10),
      graph("re10", "expenses_by_cat", 0, 15, 6, 7),
      custom("re11", "line", "month", "margin_rate", 9, 12, 3, 10),
    ],
  },
  {
    name: "Clients & pipeline",
    widgets: [
      kpi("cl1", "new_clients_count", 0, 0, 3, 2),
      kpi("cl2", "quotes_created_count", 3, 0, 3, 2),
      kpi("cl3", "quotes_won_amount", 6, 0, 3, 2),
      kpi("cl4", "win_rate", 9, 0, 3, 2),
      kpi("cl5", "recurring_monthly", 0, 2, 3, 2),
      kpi("cl6", "recurring_yearly", 3, 2, 3, 2),
      graph("cl7", "quotes_pipeline", 6, 2, 6, 7),
      graph("cl8", "top_clients", 0, 4, 6, 7),
      graph("cl9", "revenue_by_client", 6, 9, 6, 7),
      graph("cl10", "clients_cumulative", 0, 11, 6, 5),
    ],
  },
  {
    name: "Encaissement & créances",
    widgets: [
      kpi("en1", "revenue_collected", 0, 0, 3, 2),
      kpi("en2", "collection_rate", 3, 0, 3, 2),
      kpi("en3", "dso", 6, 0, 3, 2),
      kpi("en4", "receivables", 9, 0, 3, 2),
      kpi("en5", "overdue_amount", 0, 2, 3, 2),
      kpi("en6", "payables", 3, 2, 3, 2),
      graph("en7", "collected_vs_invoiced", 0, 4, 12, 7),
      graph("en8", "aging", 0, 11, 12, 6),
      graph("en9", "unpaid_list", 6, 17, 6, 5),
      graph("en10", "overdue_list", 0, 17, 6, 5),
    ],
  },
];

/** Dashboards created automatically for a company with none (the first 3). */
export function defaultDashboards(): DashboardTemplate[] {
  return DASHBOARD_TEMPLATES.slice(0, 3);
}
