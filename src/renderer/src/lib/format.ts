/** Formatting and money-input helpers (renderer). */

/**
 * Formats cents as Swiss CHF: 123455 -> "1’234.55".
 * Reuses the shared formatter so that the screen and the PDF display
 * strictly the same amount.
 */
export { formatChf } from "../../../shared/money.js";

/** Parses a CHF input ("1'234.55", "1234,55") into cents. Returns 0 if empty. */
export function parseChf(input: string): number {
  if (!input.trim()) return 0;
  const normalized = input.replace(/['’\s]/g, "").replace(",", ".");
  const v = Number.parseFloat(normalized);
  if (Number.isNaN(v)) return 0;
  return Math.round(v * 100);
}

/** Cents -> editable string "1234.55" (without thousands separator). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** ISO date -> "01.02.2026". */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Today's date in ISO format YYYY-MM-DD. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
