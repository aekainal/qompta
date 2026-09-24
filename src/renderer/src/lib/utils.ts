import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats cents as CHF for display (shared formatter). */
export { formatChf } from "../../../shared/money.js";
