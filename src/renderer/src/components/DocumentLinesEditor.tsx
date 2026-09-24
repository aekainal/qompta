/**
 * Editor for the lines of a commercial document (quote or invoice):
 * service lines, included service lines and sections, with reordering.
 *
 * Shared between the quote and the invoice: both print the same template
 * (`document_lines`), so there must be only one possible data entry form.
 *
 * The form reproduces the PDF layout: each `section` line opens a
 * **separate table**, with its own header — on screen as when printed.
 */

import { useMemo, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, Heading, Plus, Trash2 } from "lucide-react";
import type { DocumentLine } from "@shared/documents/totals.js";
import type { DocumentLineInput, DocumentLineKind, DocumentLineRecord } from "@shared/types.js";
import { Button, Input, Select } from "./ui/primitives.js";
import { centsToInput, formatChf, parseChf } from "../lib/format.js";

/** Rates offered in the line selector, in basis points. */
const VAT_RATES: { bps: number; label: string }[] = [
  { bps: 810, label: "8.1 %" },
  { bps: 260, label: "2.6 %" },
  { bps: 380, label: "3.8 %" },
  { bps: 0, label: "0 %" },
];

/** Types offered within a table: the section itself has its own header. */
const ROW_KINDS: DocumentLineKind[] = ["item", "detail"];

const KIND_LABELS: Record<DocumentLineKind, string> = {
  item: "Prestation",
  detail: "Prestation comprise",
  section: "Nouveau tableau",
};

/** Line as edited: amounts and quantities stay strings while typing. */
export interface LineDraft {
  key: string;
  kind: DocumentLineKind;
  label: string;
  qtyStr: string;
  priceStr: string;
  vatRateBps: number;
}

let seq = 0;
export function emptyLine(kind: DocumentLineKind, vatRateBps = 810): LineDraft {
  seq += 1;
  return { key: `l${seq}`, kind, label: "", qtyStr: "1", priceStr: "", vatRateBps };
}

export function toDraft(line: DocumentLineRecord): LineDraft {
  return {
    key: line.id,
    kind: line.kind,
    label: line.label,
    qtyStr: milliToInput(line.qtyMilli),
    priceStr: centsToInput(line.unitPriceHt),
    vatRateBps: line.vatRateBps,
  };
}

/** Quantity in thousandths -> readable input ("1500" -> "1.5", "2000" -> "2"). */
function milliToInput(qtyMilli: number): string {
  return String(qtyMilli / 1000);
}

/** Decimal input -> thousandths ("1.5" or "1,5" -> 1500). */
function parseQtyMilli(input: string): number {
  const normalized = input.replace(/['’\s]/g, "").replace(",", ".");
  const v = Number.parseFloat(normalized);
  if (Number.isNaN(v)) return 0;
  return Math.round(v * 1000);
}

export function toDocumentLine(line: LineDraft): DocumentLine {
  const billable = line.kind === "item";
  return {
    kind: line.kind,
    label: line.label,
    qtyMilli: billable ? parseQtyMilli(line.qtyStr) : 0,
    unitPriceHt: billable ? parseChf(line.priceStr) : 0,
    vatRateBps: billable ? line.vatRateBps : 0,
  };
}

export function toLineInput(line: LineDraft): DocumentLineInput {
  const d = toDocumentLine(line);
  return {
    kind: d.kind,
    label: d.label,
    qtyMilli: d.qtyMilli,
    unitPriceHt: d.unitPriceHt,
    vatRateBps: d.vatRateBps,
  };
}

export function lineHtOf(line: LineDraft): number {
  const d = toDocumentLine(line);
  return Math.round((d.qtyMilli * d.unitPriceHt) / 1000);
}

/** A line together with its position in the flat list (the only source of truth). */
interface Positioned {
  line: LineDraft;
  index: number;
}

/** A printed table: its section heading (optional) and its lines. */
interface Block {
  section: Positioned | null;
  rows: Positioned[];
  /** Insertion position for a new line at the end of this table. */
  insertAt: number;
}

/**
 * Splits the flat list into tables, exactly as `groupIntoSections` does when
 * printing: a `section` line closes the current table and opens another one.
 */
export function groupDrafts(lines: LineDraft[]): Block[] {
  const blocks: Block[] = [];
  let current: Block = { section: null, rows: [], insertAt: 0 };

  lines.forEach((line, index) => {
    if (line.kind === "section") {
      if (current.section || current.rows.length) blocks.push(current);
      current = { section: { line, index }, rows: [], insertAt: index + 1 };
      return;
    }
    current.rows.push({ line, index });
    current.insertAt = index + 1;
  });
  if (current.section || current.rows.length) blocks.push(current);

  return blocks;
}

interface Props {
  title: string;
  lines: LineDraft[];
  onChange: (next: LineDraft[]) => void;
  /** Rate applied to new service lines. */
  defaultVatRateBps?: number;
  /** Hides the rate selector (invoice: a single rate, carried by the header). */
  hideVatColumn?: boolean;
  /** Help shown below the toolbar. */
  help?: ReactNode;
}

export function DocumentLinesEditor({
  title,
  lines,
  onChange,
  defaultVatRateBps = 810,
  hideVatColumn = false,
  help,
}: Props) {
  const blocks = useMemo(() => groupDrafts(lines), [lines]);

  function patchLine(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function insertLine(at: number, kind: DocumentLineKind) {
    const next = [...lines];
    next.splice(at, 0, emptyLine(kind, defaultVatRateBps));
    onChange(next);
  }
  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }
  function moveLine(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  /** Move up / move down / delete, shared by a table heading and a line. */
  function rowActions(index: number, key: string, label: string) {
    return (
      <div className="flex shrink-0 justify-end gap-0.5">
        <Button
          variant="ghost"
          className="h-8 px-1.5"
          disabled={index === 0}
          onClick={() => moveLine(index, -1)}
          aria-label={`Monter ${label}`}
        >
          <ArrowUp size={14} />
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-1.5"
          disabled={index === lines.length - 1}
          onClick={() => moveLine(index, 1)}
          aria-label={`Descendre ${label}`}
        >
          <ArrowDown size={14} />
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-1.5 text-destructive"
          onClick={() => removeLine(key)}
          aria-label={`Supprimer ${label}`}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="outline"
            className="h-8"
            title="Ligne facturée : quantité × prix unitaire HT."
            onClick={() => insertLine(lines.length, "item")}
          >
            <Plus size={14} /> Prestation
          </Button>
          <Button
            variant="outline"
            className="h-8"
            title="Détail rattaché à la prestation du dessus, imprimé avec un tiret, sans montant."
            onClick={() => insertLine(lines.length, "detail")}
          >
            <CornerDownRight size={14} /> Prestation comprise
          </Button>
          <Button
            variant="outline"
            className="h-8"
            title="Ouvre un tableau supplémentaire, précédé de cet intitulé. Sans montant."
            onClick={() => insertLine(lines.length, "section")}
          >
            <Heading size={14} /> Nouveau tableau
          </Button>
        </div>
      </div>

      <p className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {help ?? (
          <>
            <strong>Prestation</strong> : ligne facturée (quantité × prix HT). ·{" "}
            <strong>Prestation comprise</strong> : détail sans montant, imprimé avec un tiret sous
            la prestation qui la précède. · <strong>Nouveau tableau</strong> : son intitulé
            introduit un tableau supplémentaire sur le PDF — utile pour séparer une prestation
            ponctuelle d'un abonnement.
          </>
        )}
      </p>

      {blocks.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Aucune ligne. Ajoutez au moins une prestation.
        </p>
      ) : (
        blocks.map((block, b) => (
          <div key={block.section?.line.key ?? `block-${b}`} className="border-t first:border-t-0">
            {/* Table header: it is what materializes the break when printing. */}
            <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
              <Heading size={14} className="shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tableau {b + 1}
              </span>
              {block.section ? (
                <>
                  <Input
                    className="h-8 flex-1"
                    value={block.section.line.label}
                    onChange={(e) =>
                      patchLine(block.section!.line.key, { label: e.target.value })
                    }
                    placeholder="Intitulé imprimé au-dessus de ce tableau…"
                  />
                  {rowActions(block.section.index, block.section.line.key, "l'intitulé du tableau")}
                </>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground">
                  Sans intitulé — premier tableau du document.
                </span>
              )}
            </div>

            {block.rows.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Tableau vide : ajoutez-y une prestation.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-44 px-2 py-2">Type</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="w-16 px-2 py-2 text-right">Qté</th>
                    <th className="w-24 px-2 py-2 text-right">P.U. HT</th>
                    {!hideVatColumn && <th className="w-20 px-2 py-2">TVA</th>}
                    <th className="w-24 px-2 py-2 text-right">Total HT</th>
                    <th className="w-24 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map(({ line, index }) => {
                    const billable = line.kind === "item";
                    return (
                      <tr key={line.key} className="border-t align-top">
                        <td className="px-2 py-1.5">
                          <Select
                            value={line.kind}
                            onChange={(e) =>
                              patchLine(line.key, { kind: e.target.value as DocumentLineKind })
                            }
                            className="h-8 w-full"
                          >
                            {ROW_KINDS.map((k) => (
                              <option key={k} value={k}>{KIND_LABELS[k]}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8"
                            value={line.label}
                            onChange={(e) => patchLine(line.key, { label: e.target.value })}
                            placeholder="Libellé de la prestation"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {billable ? (
                            <Input
                              className="h-8 text-right"
                              value={line.qtyStr}
                              onChange={(e) => patchLine(line.key, { qtyStr: e.target.value })}
                              inputMode="decimal"
                              placeholder="1"
                            />
                          ) : (
                            <div className="py-1.5 text-right text-muted-foreground">—</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {billable ? (
                            <Input
                              className="h-8 text-right"
                              value={line.priceStr}
                              onChange={(e) => patchLine(line.key, { priceStr: e.target.value })}
                              inputMode="decimal"
                              placeholder="0.00"
                            />
                          ) : (
                            <div className="py-1.5 text-right text-muted-foreground">—</div>
                          )}
                        </td>
                        {!hideVatColumn && (
                          <td className="px-2 py-1.5">
                            {billable ? (
                              <Select
                                value={String(line.vatRateBps)}
                                onChange={(e) =>
                                  patchLine(line.key, { vatRateBps: Number(e.target.value) })
                                }
                                className="h-8 w-full"
                              >
                                {VAT_RATES.map((r) => (
                                  <option key={r.bps} value={r.bps}>{r.label}</option>
                                ))}
                              </Select>
                            ) : (
                              <div className="py-1.5 text-muted-foreground">—</div>
                            )}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-right font-medium">
                          {billable ? formatChf(lineHtOf(line)) : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {rowActions(index, line.key, "la ligne")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Adding in the right place: at the end of THIS table, not of the document. */}
            <div className="flex gap-1 px-3 py-2">
              <Button
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => insertLine(block.insertAt, "item")}
              >
                <Plus size={13} /> Prestation
              </Button>
              <Button
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => insertLine(block.insertAt, "detail")}
              >
                <CornerDownRight size={13} /> Prestation comprise
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
