/**
 * VAT return page: reproduction of the FTA form pre-filled from the invoices,
 * with consistency warnings, closing/locking, status and exports.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, FileDown, Lock, Unlock } from "lucide-react";
import { toReturnLines, sectionLabel } from "@shared/vat/returnLines.js";
import { periodCount } from "@shared/vat/period.js";
import type {
  CompanyVatSettings,
  PeriodType,
  VatReturnRecord,
} from "@shared/types.js";
import type { VatComputeOutput } from "@shared/ipc.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Badge, Button, Card } from "../../components/ui/primitives.js";
import { formatChf } from "../../lib/format.js";
import { cn } from "../../lib/utils.js";

const STATUS_LABELS: Record<VatReturnRecord["status"], string> = {
  in_progress: "En cours",
  closed: "Clôturée",
  filed: "Déposée",
  paid: "Payée",
};

const CURRENT_YEAR = new Date().getFullYear();
/**
 * Input bounds for the year. Wide (taking over an old set of books stays
 * possible) but closed: the arrows must not lead to year 0.
 */
const MIN_YEAR = 2000;
const MAX_YEAR = CURRENT_YEAR + 5;
/** Number of years per grid page (3 rows of 4). */
const YEARS_PER_PAGE = 12;

/**
 * Period in progress at today's date: Q3 in July, H1 in March…
 * That is the one we want to see when reaching the screen: in 99 % of cases, the
 * VAT return is opened for the current period.
 */
function currentPeriodIndex(count: number, date = new Date()): number {
  if (count <= 1) return 1;
  return Math.ceil((date.getMonth() + 1) / (12 / count));
}

/** Start of the 12-year page that contains `year`. */
function pageStart(year: number): number {
  return year - ((year - MIN_YEAR) % YEARS_PER_PAGE);
}

/**
 * Year picker: the current year in the middle, one arrow on each side, and a
 * grid on click to reach a distant year without hammering the arrow.
 */
function YearPicker({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(() => pageStart(year));

  // The grid always opens on the page of the displayed year.
  useEffect(() => { if (open) setPage(pageStart(year)); }, [open, year]);

  // Esc closes it: an open grid must not trap the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const step = (delta: number) => {
    const next = year + delta;
    if (next >= MIN_YEAR && next <= MAX_YEAR) onChange(next);
  };

  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => page + i).filter(
    (y) => y >= MIN_YEAR && y <= MAX_YEAR,
  );

  return (
    <div className="relative">
      <div className="flex items-center rounded-lg border p-0.5">
        <button
          onClick={() => step(-1)}
          disabled={year <= MIN_YEAR}
          aria-label="Année précédente"
          className="rounded-md px-2 py-1.5 transition-colors hover:bg-accent disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Choisir une année"
          className={cn(
            "min-w-[4.5rem] rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors",
            open ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {year}
        </button>
        <button
          onClick={() => step(1)}
          disabled={year >= MAX_YEAR}
          aria-label="Année suivante"
          className="rounded-md px-2 py-1.5 transition-colors hover:bg-accent disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {open && (
        <>
          {/* Catches the outside click: the grid closes without a dedicated button. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border bg-card p-2 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(MIN_YEAR, p - YEARS_PER_PAGE))}
                disabled={page <= MIN_YEAR}
                aria-label="Page précédente"
                className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-30"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {years[0]} – {years[years.length - 1]}
              </span>
              <button
                onClick={() => setPage((p) => p + YEARS_PER_PAGE)}
                disabled={page + YEARS_PER_PAGE > MAX_YEAR}
                aria-label="Page suivante"
                className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => { onChange(y); setOpen(false); }}
                  className={cn(
                    "rounded-md py-1.5 text-sm tabular-nums transition-colors",
                    y === year
                      ? "bg-primary font-medium text-primary-foreground"
                      : y === CURRENT_YEAR
                        ? "font-medium text-primary hover:bg-accent"
                        : "hover:bg-accent",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function VatReturnPage() {
  const { active } = useCompany();
  const actionBar = useActionBar();
  const companyId = active?.id ?? "";

  const [settings, setSettings] = useState<CompanyVatSettings | null>(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  // The period in progress by default (the type comes from the settings: quarterly by default).
  const [periodIndex, setPeriodIndex] = useState(() => currentPeriodIndex(periodCount("quarterly")));
  const [data, setData] = useState<VatComputeOutput | null>(null);
  const [history, setHistory] = useState<VatReturnRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const periodType: PeriodType = settings?.periodType ?? "quarterly";
  const count = periodCount(periodType);

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    setSettings(await window.api.invoke("vatSettings:get", { companyId }));
  }, [companyId]);

  const compute = useCallback(async () => {
    if (!companyId) return;
    const [res, hist] = await Promise.all([
      window.api.invoke("vat:compute", { companyId, periodType, year, periodIndex: count > 1 ? periodIndex : null }),
      window.api.invoke("vat:list", { companyId }),
    ]);
    setData(res);
    setHistory(hist);
  }, [companyId, periodType, year, periodIndex, count]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { void compute(); }, [compute]);
  // The settings arrive after the first render: if the company files half-yearly
  // (or yearly), we realign on the current period of that split.
  useEffect(() => { setPeriodIndex(currentPeriodIndex(count)); }, [count]);

  const lines = useMemo(() => (data ? toReturnLines(data.result) : []), [data]);
  const grouped = useMemo(() => groupBySection(lines), [lines]);

  async function lock() {
    setBusy(true);
    try {
      await actionBar.track(
        "Décompte TVA clôturé",
        () => window.api.invoke("vat:lock", { companyId, periodType, year, periodIndex: count > 1 ? periodIndex : null }),
        compute,
      );
      await compute();
    } finally { setBusy(false); }
  }
  async function reopen(id: string) {
    await actionBar.track("Décompte TVA rouvert", () => window.api.invoke("vat:reopen", { companyId, id }), compute);
    await compute();
  }
  async function setStatus(id: string, status: VatReturnRecord["status"]) {
    await actionBar.track(`Décompte TVA : ${STATUS_LABELS[status].toLowerCase()}`, () => window.api.invoke("vat:setStatus", { companyId, id, status }), compute);
    await compute();
  }
  async function exportFile(kind: "Excel" | "Pdf") {
    setBusy(true);
    try {
      await window.api.invoke(kind === "Excel" ? "vat:exportExcel" : "vat:exportPdf", {
        companyId, periodType, year, periodIndex: count > 1 ? periodIndex : null,
      });
    } finally { setBusy(false); }
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;
  if (settings && !settings.isVatSubject) {
    return (
      <Card className="p-8 text-center">
        <p className="text-lg font-medium">{active.name} n'est pas assujettie à la TVA</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Activez l'assujettissement dans les réglages TVA pour générer un décompte.
        </p>
      </Card>
    );
  }

  const record = data?.record ?? null;
  const locked = record?.locked ?? false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Décompte TVA</h1>
          <p className="text-sm text-muted-foreground">
            {active.name} · {data?.label ?? ""} {data ? `(${data.startDate} → ${data.endDate})` : ""}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Année</label>
            <YearPicker year={year} onChange={setYear} />
          </div>
          {count > 1 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Période</label>
              {/* Four buttons rather than a dropdown: the quarter is changed often,
                  and a list takes two clicks just to see the choices. */}
              <div className="flex rounded-lg border p-0.5">
                {Array.from({ length: count }, (_, i) => i + 1).map((i) => {
                  const label = `${periodType === "quarterly" ? "T" : "S"}${i}`;
                  const isCurrent = year === CURRENT_YEAR && i === currentPeriodIndex(count);
                  return (
                    <button
                      key={i}
                      onClick={() => setPeriodIndex(i)}
                      title={isCurrent ? `${label} · période en cours` : label}
                      className={cn(
                        "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        periodIndex === i ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      {label}
                      {/* Discreet marker on the period in progress, to get one's bearings. */}
                      {isCurrent && periodIndex !== i && (
                        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {data?.result.coherenceWarning && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} />
          Incohérence : le total imposable (379) diffère du chiffre d'affaires imposable (299).
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {record && <Badge className="bg-primary/15 text-primary">{STATUS_LABELS[record.status]}</Badge>}
        {locked ? (
          <Button variant="outline" onClick={() => record && void reopen(record.id)}><Unlock size={16} /> Rouvrir</Button>
        ) : (
          <Button onClick={() => void lock()} disabled={busy}><Lock size={16} /> Clôturer la période</Button>
        )}
        {record?.status === "closed" && <Button variant="outline" onClick={() => void setStatus(record.id, "filed")}>Marquer déposée</Button>}
        {record?.status === "filed" && <Button variant="outline" onClick={() => void setStatus(record.id, "paid")}>Marquer payée</Button>}
        <div className="flex-1" />
        <Button variant="outline" onClick={() => void exportFile("Excel")} disabled={busy}><FileDown size={16} /> Excel</Button>
        <Button variant="outline" onClick={() => void exportFile("Pdf")} disabled={busy}><FileDown size={16} /> PDF</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-16">Code</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2 text-right w-40">Prestations CHF</th>
              <th className="px-3 py-2 text-right w-36">Impôt CHF</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <FragmentSection key={g.section} title={sectionLabel(g.section)} rows={g.rows} />
            ))}
          </tbody>
        </table>
      </Card>

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">À payer (code 500)</div>
            <div className="text-2xl font-semibold">{formatChf(data.result.b500)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Crédit (code 510)</div>
            <div className="text-2xl font-semibold">{formatChf(data.result.b510)}</div>
          </Card>
        </div>
      )}

      {history.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Historique des décomptes</h2>
          <div className="divide-y text-sm">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2">
                <span>{h.periodType === "annual" ? `Année ${h.year}` : `${h.periodType === "quarterly" ? "T" : "S"}${h.periodIndex} ${h.year}`}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {h.totalPayable ? `À payer ${formatChf(h.totalPayable)}` : h.totalCredit ? `Crédit ${formatChf(h.totalCredit)}` : "-"}
                  </span>
                  <Badge>{STATUS_LABELS[h.status]}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function groupBySection(lines: ReturnType<typeof toReturnLines>) {
  const order: string[] = [];
  const map = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!map.has(l.section)) { map.set(l.section, []); order.push(l.section); }
    map.get(l.section)!.push(l);
  }
  return order.map((section) => ({ section, rows: map.get(section)! }));
}

function FragmentSection({ title, rows }: { title: string; rows: ReturnType<typeof toReturnLines> }) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</td>
      </tr>
      {rows.map((l) => (
        <tr key={l.code} className={`border-t ${l.total ? "bg-secondary/40 font-medium" : ""}`}>
          <td className="px-3 py-1.5 font-mono text-xs">{l.code}</td>
          <td className="px-3 py-1.5">{l.label}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{l.base !== null ? formatChf(l.base) : ""}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{l.tax !== null ? formatChf(l.tax) : ""}</td>
        </tr>
      ))}
    </>
  );
}
