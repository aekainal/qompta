/**
 * Arrow year picker (‹ 2026 ›), same look as the invoice filter.
 * Plain navigation (no toggle): the arrows change the displayed year.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear() + 5;

export function YearStepper({ year, onChange, min = MIN_YEAR, max = MAX_YEAR }: {
  year: number;
  onChange: (year: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5">
      <button
        type="button"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
        title="Année précédente"
        disabled={year <= min}
        onClick={() => onChange(year - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="w-14 text-center text-sm font-medium tabular-nums">{year}</span>
      <button
        type="button"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
        title="Année suivante"
        disabled={year >= max}
        onClick={() => onChange(year + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
