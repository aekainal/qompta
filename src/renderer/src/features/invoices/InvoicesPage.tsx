/**
 * Invoices page: filterable/sortable/paginated list + creation/editing via a modal.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Eye, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  AccountCategory,
  Invoice,
  InvoiceFilters,
  InvoiceKind,
  InvoiceStatus,
  PeriodType,
  ThirdParty,
} from "@shared/types.js";
import { periodCount, periodRange } from "@shared/vat/period.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Input, Modal, Select } from "../../components/ui/primitives.js";
import { cn } from "../../lib/utils.js";
import { formatChf, formatDate } from "../../lib/format.js";
import { InvoiceForm } from "./InvoiceForm.js";
import { STATUS_COLORS, STATUS_LABELS } from "./invoice-options.js";

const PAGE_SIZE = 50;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = CURRENT_YEAR + 5;

export function InvoicesPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";

  const [rows, setRows] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<InvoiceFilters>({ sortBy: "issueDate", sortDir: "desc" });
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [accounts, setAccounts] = useState<AccountCategory[]>([]);
  const [tpMap, setTpMap] = useState<Record<string, string>>({});
  const dlg = useFormDialog<Invoice>("facture");
  // Quick filters by VAT period (adapted to the company's period type).
  const [periodType, setPeriodType] = useState<PeriodType>("quarterly");
  const [vatSubject, setVatSubject] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [periods, setPeriods] = useState<Set<number>>(new Set());
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    const res = await window.api.invoke("invoices:list", {
      companyId,
      filters: { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    });
    setRows(res.rows);
    setTotal(res.total);
  }, [companyId, filters, page]);

  const loadRefs = useCallback(async () => {
    if (!companyId) return;
    const [tp, acc] = await Promise.all([
      window.api.invoke("thirdParties:list", { companyId }),
      window.api.invoke("accounts:list", { companyId }),
    ]);
    setThirdParties(tp);
    setAccounts(acc);
    setTpMap(Object.fromEntries(tp.map((t) => [t.id, t.name])));
  }, [companyId]);

  useEffect(() => {
    void window.api
      .invoke("invoices:refreshOverdue", { companyId, today: new Date().toISOString().slice(0, 10) })
      .then(load);
  }, [companyId, load]);
  useEffect(() => { void loadRefs(); }, [loadRefs]);

  // VAT period type of the company → number/nature of the buttons (Q1..Q4 / S1..S2 / year).
  // The selection starts empty again on every company change.
  useEffect(() => {
    if (!companyId) return;
    setPeriods(new Set());
    setYear(CURRENT_YEAR);
    setFilters((f) => ({ ...f, issueRanges: undefined }));
    void window.api
      .invoke("vatSettings:get", { companyId })
      .then((s) => { setPeriodType(s?.periodType ?? "quarterly"); setVatSubject(s?.isVatSubject ?? false); });
  }, [companyId]);

  function updateFilter(patch: Partial<InvoiceFilters>) {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  }

  /**
   * Date ranges of the selected periods (undefined = no active button).
   * Index 0 = the whole year; 1..4 = quarters, 1..2 = half-years.
   */
  function rangesFor(sel: Set<number>, y: number): InvoiceFilters["issueRanges"] {
    if (sel.size === 0) return undefined;
    return [...sel]
      .sort((a, b) => a - b)
      .map((i) => {
        const r = i === 0 ? periodRange("annual", y) : periodRange(periodType, y, i);
        return { from: r.startDate, to: r.endDate };
      });
  }

  function applyPeriods(next: Set<number>, y: number) {
    setPeriods(next);
    updateFilter({ issueRanges: rangesFor(next, y) });
  }

  function togglePeriod(idx: number) {
    let next: Set<number>;
    if (idx === 0) {
      // "Année entière": exclusive of the quarters (a plain on/off).
      next = periods.has(0) ? new Set() : new Set([0]);
    } else {
      next = new Set(periods);
      next.delete(0); // picking a quarter cancels "année entière"
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
    }
    applyPeriods(next, year);
  }

  function changeYear(delta: number) {
    const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, year + delta));
    if (y === year) return;
    setYear(y);
    // Changing the year filters on that year; if nothing is selected, the whole
    // year is activated (otherwise the quarters already picked are re-framed).
    applyPeriods(periods.size > 0 ? periods : new Set([0]), y);
  }

  function remove(id: string) {
    const number = rows.find((r) => r.id === id)?.number ?? "";
    actionBar.defer(`Suppression de la facture ${number}`.trim(), async () => {
      await window.api.invoke("invoices:delete", { companyId, id });
      await load();
    });
  }
  async function duplicate(id: string) {
    await window.api.invoke("invoices:duplicate", { companyId, id });
    await load();
  }

  /**
   * The invoice stays printable even if the QR-bill could not be produced
   * (missing bank account or address): a warning is shown without blocking.
   */
  async function previewPdf(id: string) {
    const res = await window.api.invoke("invoices:previewPdf", { companyId, id });
    if (res.qrError) actionBar.notify(`PDF généré sans QR-facture : ${res.qrError}`);
  }
  async function exportPdf(id: string) {
    const res = await window.api.invoke("invoices:exportPdf", { companyId, id });
    if (res.saved && res.qrError) actionBar.notify(`PDF enregistré sans QR-facture : ${res.qrError}`);
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Factures</h1>
          <p className="text-sm text-muted-foreground">{total} facture(s) · {active.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick filters by VAT period: stackable, additive to the other filters. */}
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
              title="Année précédente"
              disabled={year <= MIN_YEAR}
              onClick={() => changeYear(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => togglePeriod(0)}
              title="Filtrer toute l'année"
              className={cn(
                "w-14 rounded-md py-1.5 text-center text-sm font-medium tabular-nums transition-colors",
                periods.has(0) ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {year}
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
              title="Année suivante"
              disabled={year >= MAX_YEAR}
              onClick={() => changeYear(1)}
            >
              <ChevronRight size={16} />
            </button>
            {periodType !== "annual" && (
              <>
                <div className="mx-1 h-5 w-px bg-border" />
                {Array.from({ length: periodCount(periodType) }, (_, i) => i + 1).map((i) => {
                  const label = `${periodType === "quarterly" ? "Q" : "S"}${i}`;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => togglePeriod(i)}
                      title={periodRange(periodType, year, i).label}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        periods.has(i) ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <Button onClick={() => dlg.open(null)}>
            <Plus size={16} /> Nouvelle facture
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={filters.type ?? ""} onChange={(e) => updateFilter({ type: (e.target.value || undefined) as InvoiceKind | undefined })}>
            <option value="">Tous</option>
            <option value="sale">Ventes</option>
            <option value="purchase">Achats</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Statut</label>
          <Select value={filters.status ?? ""} onChange={(e) => updateFilter({ status: (e.target.value || undefined) as InvoiceStatus | undefined })}>
            <option value="">Tous</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" value={filters.from ?? ""} onChange={(e) => updateFilter({ from: e.target.value || undefined })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" value={filters.to ?? ""} onChange={(e) => updateFilter({ to: e.target.value || undefined })} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Recherche</label>
          <Input placeholder="N° ou description…" value={filters.search ?? ""} onChange={(e) => updateFilter({ search: e.target.value || undefined })} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <Th label="Date" col="issueDate" filters={filters} onSort={updateFilter} />
              <Th label="N°" col="number" filters={filters} onSort={updateFilter} />
              <th className="px-3 py-2">Tiers</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2 text-right">HT</th>
              <th className="px-3 py-2 text-right">TVA</th>
              <Th label="TTC" col="amountTtc" filters={filters} onSort={updateFilter} align="right" />
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Aucune facture.</td></tr>
            )}
            {rows.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2">{formatDate(inv.issueDate)}</td>
                <td className="px-3 py-2">{inv.number ?? "-"}</td>
                <td className="px-3 py-2">{inv.thirdPartyId ? tpMap[inv.thirdPartyId] ?? "-" : "-"}</td>
                <td className="px-3 py-2">{inv.type === "sale" ? "Vente" : "Achat"}</td>
                <td className="px-3 py-2 font-mono text-xs">{inv.vatCode ?? "-"}</td>
                <td className="px-3 py-2 text-right">{formatChf(inv.amountHt)}</td>
                <td className="px-3 py-2 text-right">{formatChf(inv.vatAmount)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatChf(inv.amountTtc)}</td>
                <td className="px-3 py-2">
                  <Badge className={STATUS_COLORS[inv.status]}>{STATUS_LABELS[inv.status]}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {inv.type === "sale" && (
                      <>
                        <Button variant="ghost" className="h-7 px-2" title="Aperçu PDF" onClick={() => void previewPdf(inv.id)}><Eye size={14} /></Button>
                        <Button variant="ghost" className="h-7 px-2" title="Exporter en PDF (avec QR-facture)" onClick={() => void exportPdf(inv.id)}><FileDown size={14} /></Button>
                      </>
                    )}
                    <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(inv)}><Pencil size={14} /></Button>
                    <Button variant="ghost" className="h-7 px-2" onClick={() => void duplicate(inv.id)}><Copy size={14} /></Button>
                    <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void remove(inv.id)}><Trash2 size={14} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
          <span>Page {page + 1} / {pages}</span>
          <Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
        </div>
      )}

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier la facture" : "Nouvelle facture"} wide>
        {dlg.mounted && (
          <InvoiceForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            vatSubject={vatSubject}
            thirdParties={thirdParties}
            accounts={accounts}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function Th({
  label,
  col,
  filters,
  onSort,
  align,
}: {
  label: string;
  col: NonNullable<InvoiceFilters["sortBy"]>;
  filters: InvoiceFilters;
  onSort: (p: Partial<InvoiceFilters>) => void;
  align?: "right";
}) {
  const active = filters.sortBy === col;
  const dir = active && filters.sortDir === "asc" ? "asc" : "desc";
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 ${align === "right" ? "text-right" : ""}`}
      onClick={() => onSort({ sortBy: col, sortDir: active && dir === "desc" ? "asc" : "desc" })}
    >
      {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}
