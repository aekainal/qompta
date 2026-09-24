/**
 * Computation of the period bounds of a VAT return (quarter / half-year / year).
 */

import type { PeriodType } from "../types.js";

export interface PeriodRange {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  label: string;
}

function lastDayOfMonth(year: number, month1: number): number {
  // month1: 1..12. Day 0 of the next month = last day of the current month.
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function iso(year: number, month1: number, day: number): string {
  const m = String(month1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/**
 * Returns the date range and the label of a period.
 * @param periodIndex quarter (1..4) or half-year (1..2); ignored for annual.
 */
export function periodRange(
  periodType: PeriodType,
  year: number,
  periodIndex?: number | null,
): PeriodRange {
  if (periodType === "annual") {
    return { startDate: iso(year, 1, 1), endDate: iso(year, 12, 31), label: `Année ${year}` };
  }
  if (periodType === "semestrial") {
    const idx = periodIndex ?? 1;
    const startMonth = idx === 2 ? 7 : 1;
    const endMonth = idx === 2 ? 12 : 6;
    return {
      startDate: iso(year, startMonth, 1),
      endDate: iso(year, endMonth, lastDayOfMonth(year, endMonth)),
      label: `S${idx} ${year}`,
    };
  }
  // quarterly
  const idx = periodIndex ?? 1;
  const startMonth = (idx - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    startDate: iso(year, startMonth, 1),
    endDate: iso(year, endMonth, lastDayOfMonth(year, endMonth)),
    label: `Q${idx} ${year}`,
  };
}

/** Number of sub-periods of a given type (4, 2 or 1). */
export function periodCount(periodType: PeriodType): number {
  return periodType === "quarterly" ? 4 : periodType === "semestrial" ? 2 : 1;
}
