/**
 * Numbering of commercial documents (quotes, invoices, contracts).
 *
 * Format: `<prefix><YYYYMMDD><NN>`, the `NN` counter (00-99) resetting to zero
 * every day and per document type.
 *   DC2026072201 = 1st customer quote of 22.07.2026
 *   FC2026072201 = 1st customer invoice of the same day
 *
 * PURE functions: the counter is derived from the numbers already assigned,
 * which avoids maintaining any sequence table.
 */

export type DocumentKind = "quote" | "invoice" | "contract";

/** Numbering prefix per document type. */
export const DOCUMENT_PREFIX: Record<DocumentKind, string> = {
  quote: "DC", // customer quote
  invoice: "FC", // customer invoice
  contract: "CC", // customer contract
};

/** Label shown before the number on the printed document. */
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  quote: "Devis",
  invoice: "Facture",
  contract: "Contrat",
};

/** Date part (YYYYMMDD) of an ISO date `YYYY-MM-DD`. */
export function datePart(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

/** Pattern of a generated number, for a given prefix. */
function numberPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}(\\d{8})(\\d{2})$`);
}

/**
 * Next number for a given document type and date, taking into account the
 * numbers already used.
 *
 * Only numbers with the same prefix and the same day enter the computation;
 * off-format numbers (typed by hand, imported from an older tool…) are ignored
 * rather than making the assignment fail.
 */
export function nextDocumentNumber(
  kind: DocumentKind,
  isoDate: string,
  existingNumbers: readonly (string | null)[],
): string {
  const prefix = DOCUMENT_PREFIX[kind];
  const day = datePart(isoDate);
  const re = numberPattern(prefix);

  // The counter starts at 01, like the existing Qwasar quotes (…2201).
  let max = 0;
  for (const n of existingNumbers) {
    const m = re.exec(n ?? "");
    if (m && m[1] === day) max = Math.max(max, Number(m[2]));
  }

  const seq = max + 1;
  if (seq > 99) {
    throw new Error(
      `Numérotation saturée : plus de 100 documents « ${prefix} » pour le ${isoDate}.`,
    );
  }
  return `${prefix}${day}${String(seq).padStart(2, "0")}`;
}

/** True if the number follows the generated format for this document type. */
export function isGeneratedNumber(kind: DocumentKind, n: string): boolean {
  return numberPattern(DOCUMENT_PREFIX[kind]).test(n);
}

/** Breaks down a generated number, or `null` if it is off-format. */
export function parseDocumentNumber(
  kind: DocumentKind,
  n: string,
): { date: string; seq: number } | null {
  const m = numberPattern(DOCUMENT_PREFIX[kind]).exec(n);
  if (!m) return null;
  return {
    date: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`,
    seq: Number(m[2]),
  };
}
