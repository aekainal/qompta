/**
 * Shared dashboard building blocks: KPI, target bar, formats.
 */

import type { ReactNode } from "react";
import type { MetricUnit, ObjectiveProgress } from "@shared/objectives.js";
import { objectiveName, objectivePeriodLabel } from "@shared/objectives.js";
import { Card } from "../../components/ui/primitives.js";
import { formatChf } from "../../lib/format.js";

export const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
export const chf = (cents: number) => cents / 100;
export const chfTooltip = (v: number) => `${v.toLocaleString("fr-CH", { minimumFractionDigits: 2 })} CHF`;

/** Formats a metric value according to its unit (money / count / rate). */
export function formatMetricValue(unit: MetricUnit, value: number): string {
  if (unit === "money") return `${formatChf(value)} CHF`;
  if (unit === "rate") return `${(value / 100).toFixed(Math.abs(value) % 100 === 0 ? 0 : 1)} %`;
  return value.toLocaleString("fr-CH");
}

type Accent = "green" | "red" | "blue" | "amber" | "violet";
const ACCENT: Record<Accent, string> = {
  green: "text-green-600 dark:text-green-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-primary",
  violet: "text-violet-600 dark:text-violet-400",
};

export function Kpi({ label, value, accent, hint, delta }: {
  label: string;
  value: string;
  accent?: Accent;
  hint?: string;
  /** Change in % vs the comparison period (previous year). */
  delta?: number | null;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ? ACCENT[accent] : ""}`}>{value}</div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
        {delta !== undefined && delta !== null && Number.isFinite(delta) && (
          <span className={delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`mb-2 text-sm font-semibold ${className ?? ""}`}>{children}</h2>;
}

/** Year-over-year change as a percentage (null if the base is zero). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Progress bar of a target: actual vs target, color depending on achievement. */
export function ObjectiveBar({ p, compact }: { p: ObjectiveProgress; compact?: boolean }) {
  const cap = p.direction === "at_most";
  const over = cap && p.actual > p.target;
  const pct = Math.max(0, Math.min(100, p.ratioBps / 100));
  const bar = cap ? (over ? "bg-red-500" : "bg-emerald-500") : p.met ? "bg-emerald-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{objectiveName(p.objective)}</span>
        {!compact && (
          <span className="shrink-0 text-xs text-muted-foreground">{objectivePeriodLabel(p.objective)}</span>
        )}
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className={p.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
          {formatMetricValue(p.unit, p.actual)} <span className="text-muted-foreground">/ {formatMetricValue(p.unit, p.target)}</span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {(p.ratioBps / 100).toFixed(0)} %{cap ? " conso." : ""}
        </span>
      </div>
    </div>
  );
}
