/**
 * Rendering of a dashboard widget (KPI or chart), **adaptive to its size**: each
 * widget measures its box (ResizeObserver) and shows more or less information.
 * Charts fill the grid cell. `custom` builds a chart from a type
 * (bar/line/pie) x a dimension x a value.
 */

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CompanyDashboardResult } from "@shared/dashboard.js";
import type { MetricUnit, ObjectiveCategory, ObjectiveMetric, ObjectiveProgress } from "@shared/objectives.js";
import { metricDef } from "@shared/objectives.js";
import type { ChartKind, CustomChart, DashboardWidget } from "@shared/dashboards.js";
import { CUSTOM_DIMS } from "@shared/dashboards.js";
import { Card } from "../../components/ui/primitives.js";
import { cn } from "../../lib/utils.js";
import { formatChf, formatDate } from "../../lib/format.js";
import { chf, chfTooltip, formatMetricValue, MONTHS, ObjectiveBar, PIE_COLORS, SectionTitle } from "./parts.js";

type Size = { w: number; h: number };

function useSize(): [React.RefObject<HTMLDivElement>, Size] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

const unitTooltip = (unit: MetricUnit) => (v: number) =>
  unit === "money" ? chfTooltip(v) : unit === "rate" ? `${v.toFixed(1)} %` : String(v);
const scaleFor = (unit: MetricUnit) => (v: number) => (unit === "money" || unit === "rate" ? v / 100 : v);

function kpiColor(metric: ObjectiveMetric, raw: number): string {
  if (metric === "result") return raw >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  const unit = metricDef(metric).unit;
  return unit === "money" ? "text-primary" : unit === "rate" ? "text-violet-600 dark:text-violet-400" : "";
}

// ── Adaptive KPI ──

function KpiWidget({ data, metric, size }: { data: CompanyDashboardResult; metric: ObjectiveMetric; size: Size }) {
  const def = metricDef(metric);
  const raw = data.metrics[metric];
  const value = formatMetricValue(def.unit, raw);
  const showLabel = size.h >= 46;
  const showHint = size.h >= 128 && !!def.hint;
  // The value grows with the widget, bounded by its height AND its width (no clipping).
  const valuePx = Math.max(15, Math.round(Math.min(size.h * 0.34, size.w * 0.3, 48)));
  const pad = size.h < 72 ? "p-2" : "p-3";
  return (
    <Card className={cn("flex h-full flex-col justify-center gap-1 overflow-hidden", pad)}>
      {showLabel && <div className="truncate text-xs leading-tight text-muted-foreground">{def.label}</div>}
      <div className={cn("truncate font-semibold leading-none tabular-nums", kpiColor(metric, raw))} style={{ fontSize: `${valuePx}px` }}>
        {value}
      </div>
      {showHint && <div className="truncate text-xs text-muted-foreground">{def.hint}</div>}
    </Card>
  );
}

// ── Chart frame (fills the height, title hidden when too small) ──

function ChartFrame({ title, size, children }: { title: string; size: Size; children: React.ReactNode }) {
  const showTitle = size.h >= 96;
  return (
    <Card className="flex h-full flex-col overflow-hidden p-3">
      {showTitle && <SectionTitle className="shrink-0 truncate">{title}</SectionTitle>}
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

const axisProps = { fontSize: 11, tickLine: false, axisLine: false } as const;

/** A generic bar/line/pie chart over a {name,value} series. */
function SimpleChart({ type, rows, name, fmt, size }: {
  type: "bar" | "line" | "pie";
  rows: { name: string; value: number }[];
  name: string;
  fmt: (v: number) => string;
  size: Size;
}) {
  const legend = size.h >= 170 && type === "pie";
  const showAxis = size.h >= 120;
  if (rows.length === 0) return <p className="grid h-full place-items-center text-sm text-muted-foreground">Aucune donnée.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "pie" ? (
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%">
            {rows.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => fmt(v)} />
          {legend && <Legend />}
        </PieChart>
      ) : type === "line" ? (
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          {showAxis && <XAxis dataKey="name" {...axisProps} />}
          {showAxis && <YAxis {...axisProps} width={48} />}
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Line type="monotone" dataKey="value" name={name} stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          {showAxis && <XAxis dataKey="name" {...axisProps} />}
          {showAxis && <YAxis {...axisProps} width={48} />}
          <Tooltip formatter={(v: number) => fmt(v)} />
          <Bar dataKey="value" name={name} fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// ── Series of the dimensions (ready-made + custom) ──

function seriesForDim(data: CompanyDashboardResult, custom: CustomChart): { rows: { name: string; value: number }[]; name: string; fmt: (v: number) => string; title: string } {
  const dimLabel = CUSTOM_DIMS.find((d) => d.dim === custom.dim)?.label ?? "";
  switch (custom.dim) {
    case "month": {
      const m = custom.metric ?? "revenue_invoiced";
      const def = metricDef(m);
      const scale = scaleFor(def.unit);
      return {
        rows: data.monthlyMetrics.map((mm, i) => ({ name: MONTHS[i], value: scale(mm.values[m]) })),
        name: def.label, fmt: unitTooltip(def.unit), title: `${def.label} — par mois`,
      };
    }
    case "product_category":
      return { rows: data.productsByCategory.map((c) => ({ name: c.label, value: chf(c.amount) })), name: "Produits", fmt: chfTooltip, title: dimLabel };
    case "expense_category":
      return { rows: data.expensesByCategory.map((c) => ({ name: c.label, value: chf(c.amount) })), name: "Charges", fmt: chfTooltip, title: dimLabel };
    case "client":
      return { rows: data.topClients.map((c) => ({ name: c.name, value: chf(c.invoicedHt) })), name: "CA HT", fmt: chfTooltip, title: dimLabel };
    case "quote_stage":
      return {
        rows: [
          { name: "Potentiel", value: chf(data.quotes.pending) },
          { name: "Accepté", value: chf(data.quotes.accepted) },
          { name: "Gagné", value: chf(data.quotes.won) },
          { name: "Perdu", value: chf(data.quotes.lost) },
        ], name: "Montant HT", fmt: chfTooltip, title: dimLabel,
      };
  }
}

// ── Lists ──

export function InvoiceList({ rows, empty }: { rows: CompanyDashboardResult["unpaid"]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="h-full divide-y overflow-auto text-sm">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-1.5">
          <span className="truncate">{r.number ?? "—"} · {r.thirdPartyName ?? "—"}</span>
          <span className="flex items-center gap-2">
            {r.dueDate && <span className="text-xs text-muted-foreground">{formatDate(r.dueDate)}</span>}
            <span className="tabular-nums">{formatChf(r.amountTtc)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function sumRefs(rows: CompanyDashboardResult["unpaid"]): number {
  return rows.reduce((a, r) => a + r.amountTtc, 0);
}

/** Splits the unpaid invoices by due-date age (in days overdue). */
export function bucketAging(rows: CompanyDashboardResult["unpaid"]): { name: string; value: number }[] {
  const today = new Date();
  const buckets = [
    { name: "À échoir", value: 0 },
    { name: "1–30 j", value: 0 },
    { name: "31–60 j", value: 0 },
    { name: "60+ j", value: 0 },
  ];
  for (const r of rows) {
    const amount = r.amountTtc / 100;
    if (!r.dueDate) { buckets[0].value += amount; continue; }
    const days = Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86_400_000);
    if (days <= 0) buckets[0].value += amount;
    else if (days <= 30) buckets[1].value += amount;
    else if (days <= 60) buckets[2].value += amount;
    else buckets[3].value += amount;
  }
  return buckets;
}

/** Targets of one (or several) category, in a grid (reused by the cash position). */
export function ObjectivesGrid({ objectives, categories, title }: {
  objectives: ObjectiveProgress[];
  categories?: ObjectiveCategory[];
  title?: string;
}) {
  const shown = categories
    ? objectives.filter((p) => categories.includes(metricDef(p.objective.metric).category))
    : objectives;
  if (shown.length === 0) return null;
  return (
    <div>
      <SectionTitle>{title ?? "Objectifs"}</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <Card key={p.objective.id} className="p-4"><ObjectiveBar p={p} /></Card>
        ))}
      </div>
    </div>
  );
}

// ── Ready-made charts ──

function PresetChart({ data, chart, metric, size }: { data: CompanyDashboardResult; chart: ChartKind; metric: ObjectiveMetric | null; size: Size }) {
  const showLegend = size.h >= 170;
  const showAxis = size.h >= 120;
  switch (chart) {
    case "monthly_products_charges":
    case "monthly_pcr": {
      const withPrev = chart === "monthly_products_charges";
      const rows = data.monthly.map((m, i) => withPrev
        ? { name: MONTHS[i], Produits: chf(m.products), Charges: chf(m.expenses), "N-1": chf(data.prevYearMonthly[i].products) }
        : { name: MONTHS[i], Produits: chf(m.products), Charges: chf(m.expenses), Résultat: chf(m.result) });
      return (
        <ChartFrame title={withPrev ? "Produits vs charges par mois (et N-1)" : "Produits, charges, résultat par mois"} size={size}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              {showAxis && <XAxis dataKey="name" {...axisProps} />}
              {showAxis && <YAxis {...axisProps} width={48} />}
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              {showLegend && <Legend />}
              <Bar dataKey="Produits" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Charges" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey={withPrev ? "N-1" : "Résultat"} stroke={withPrev ? "#8b5cf6" : "#3b82f6"} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      );
    }
    case "result_cumulative": {
      let running = 0;
      const rows = data.monthly.map((m, i) => { running += m.result; return { name: MONTHS[i], value: chf(running) }; });
      return <ChartFrame title="Résultat cumulé" size={size}><SimpleChart type="line" rows={rows} name="Résultat" fmt={chfTooltip} size={size} /></ChartFrame>;
    }
    case "revenue_yoy": {
      const rows = data.monthly.map((m, i) => ({ name: MONTHS[i], [String(data.year)]: chf(m.products), [String(data.year - 1)]: chf(data.prevYearMonthly[i].products) }));
      return (
        <ChartFrame title={`Chiffre d'affaires : ${data.year} vs ${data.year - 1}`} size={size}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              {showAxis && <XAxis dataKey="name" {...axisProps} />}
              {showAxis && <YAxis {...axisProps} width={48} />}
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              {showLegend && <Legend />}
              <Line type="monotone" dataKey={String(data.year)} stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey={String(data.year - 1)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      );
    }
    case "products_by_cat":
      return <ChartFrame title="Produits par catégorie" size={size}><SimpleChart type="pie" rows={data.productsByCategory.slice(0, 8).map((c) => ({ name: c.label, value: chf(c.amount) }))} name="Produits" fmt={chfTooltip} size={size} /></ChartFrame>;
    case "expenses_by_cat":
      return <ChartFrame title="Charges par catégorie" size={size}><SimpleChart type="pie" rows={data.expensesByCategory.slice(0, 8).map((c) => ({ name: c.label, value: chf(c.amount) }))} name="Charges" fmt={chfTooltip} size={size} /></ChartFrame>;
    case "aging": {
      const rows = bucketAging(data.unpaid);
      return (
        <ChartFrame title="Ancienneté des créances" size={size}>
          {rows.every((b) => b.value === 0) ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">Aucune créance.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                {showAxis && <XAxis dataKey="name" {...axisProps} />}
                {showAxis && <YAxis {...axisProps} width={48} />}
                <Tooltip formatter={(v: number) => chfTooltip(v)} />
                <Bar dataKey="value" name="Encours" radius={[3, 3, 0, 0]}>
                  {rows.map((_, i) => <Cell key={i} fill={["#22c55e", "#f59e0b", "#f97316", "#ef4444"][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      );
    }
    case "quotes_pipeline": {
      const q = data.quotes;
      const rows = [
        { name: "Potentiel", value: chf(q.pending) },
        { name: "Accepté", value: chf(q.accepted) },
        { name: "Gagné", value: chf(q.won) },
        { name: "Perdu", value: chf(q.lost) },
      ];
      return (
        <ChartFrame title={`Pipeline des devis ${data.year}`} size={size}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              {showAxis && <XAxis dataKey="name" {...axisProps} />}
              {showAxis && <YAxis {...axisProps} width={48} />}
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              <Bar dataKey="value" name="Montant HT" radius={[3, 3, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={["#3b82f6", "#22c55e", "#16a34a", "#ef4444"][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      );
    }
    case "top_clients": {
      const rows = data.topClients.map((c) => ({ name: c.name, value: chf(c.invoicedHt) }));
      return (
        <ChartFrame title="Meilleurs clients (CA facturé)" size={size}>
          {rows.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">Aucune vente.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" {...axisProps} />
                <YAxis type="category" dataKey="name" {...axisProps} width={100} />
                <Tooltip formatter={(v: number) => chfTooltip(v)} />
                <Bar dataKey="value" name="CA HT" fill="#3b82f6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      );
    }
    case "unpaid_list":
      return <ChartFrame title={`Factures impayées (${data.unpaid.length})`} size={size}><InvoiceList rows={data.unpaid} empty="Aucune facture impayée." /></ChartFrame>;
    case "overdue_list":
      return <ChartFrame title={`En retard (${data.overdue.length})`} size={size}><InvoiceList rows={data.overdue} empty="Aucune facture en retard." /></ChartFrame>;
    case "collected_vs_invoiced": {
      const rows = data.monthlyMetrics.map((mm, i) => ({ name: MONTHS[i], Facturé: chf(mm.values.revenue_invoiced), Encaissé: chf(mm.values.revenue_collected) }));
      return (
        <ChartFrame title="Facturé vs encaissé par mois" size={size}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              {showAxis && <XAxis dataKey="name" {...axisProps} />}
              {showAxis && <YAxis {...axisProps} width={48} />}
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              {showLegend && <Legend />}
              <Bar dataKey="Facturé" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Encaissé" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      );
    }
    case "result_waterfall": {
      const rows = [
        { name: "Produits", value: chf(data.totalProductsInvoiced) },
        { name: "Charges", value: chf(data.totalCharges) },
        { name: "Résultat", value: chf(data.result) },
      ];
      return (
        <ChartFrame title="Produits → charges → résultat" size={size}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              {showAxis && <XAxis dataKey="name" {...axisProps} />}
              {showAxis && <YAxis {...axisProps} width={48} />}
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              <Bar dataKey="value" name="Montant" radius={[3, 3, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={["#22c55e", "#ef4444", "#3b82f6"][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      );
    }
    case "revenue_by_client":
      return <ChartFrame title="CA par client" size={size}><SimpleChart type="pie" rows={data.topClients.map((c) => ({ name: c.name, value: chf(c.invoicedHt) }))} name="CA HT" fmt={chfTooltip} size={size} /></ChartFrame>;
    case "clients_cumulative": {
      let run = 0;
      const rows = data.monthlyMetrics.map((mm, i) => { run += mm.values.new_clients_count; return { name: MONTHS[i], value: run }; });
      return <ChartFrame title="Nouveaux clients cumulés" size={size}><SimpleChart type="line" rows={rows} name="Clients" fmt={(v: number) => String(v)} size={size} /></ChartFrame>;
    }
    case "metric_monthly": {
      if (!metric) return <ChartFrame title="Métrique par mois" size={size}><p className="grid h-full place-items-center text-sm text-muted-foreground">Choisissez une métrique.</p></ChartFrame>;
      const def = metricDef(metric);
      const scale = scaleFor(def.unit);
      const rows = data.monthlyMetrics.map((mm, i) => ({ name: MONTHS[i], value: scale(mm.values[metric]) }));
      return <ChartFrame title={`Par mois — ${def.label}`} size={size}><SimpleChart type="line" rows={rows} name={def.label} fmt={unitTooltip(def.unit)} size={size} /></ChartFrame>;
    }
    default:
      return null;
  }
}

function CustomChartWidget({ data, custom, size }: { data: CompanyDashboardResult; custom: CustomChart; size: Size }) {
  const s = seriesForDim(data, custom);
  return <ChartFrame title={s.title} size={size}><SimpleChart type={custom.type} rows={s.rows} name={s.name} fmt={s.fmt} size={size} /></ChartFrame>;
}

function Inner({ widget, data, size }: { widget: DashboardWidget; data: CompanyDashboardResult; size: Size }) {
  if (widget.kind === "kpi" && widget.metric) return <KpiWidget data={data} metric={widget.metric} size={size} />;
  if (widget.kind === "chart" && widget.chart === "custom" && widget.custom) return <CustomChartWidget data={data} custom={widget.custom} size={size} />;
  if (widget.kind === "chart" && widget.chart) return <PresetChart data={data} chart={widget.chart} metric={widget.metric ?? null} size={size} />;
  return null;
}

/** Renders a widget (KPI or chart) that fills its cell and adapts to its size. */
export function WidgetRenderer({ widget, data }: { widget: DashboardWidget; data: CompanyDashboardResult }) {
  const [ref, size] = useSize();
  return <div ref={ref} className="h-full w-full"><Inner widget={widget} data={data} size={size} /></div>;
}
