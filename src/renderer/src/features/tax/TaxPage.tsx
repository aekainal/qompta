/**
 * Tax module: year-end tax file, adapted to the legal form.
 * Preparation / tax-return help mode (no computation of the final tax amount).
 */

import { useCallback, useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import type { TaxDossier } from "@shared/tax/dossier.js";
import type { CompanyEquity } from "@shared/equity.js";
import { LEGAL_FORM_LABELS } from "@shared/legal-form.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Card, Field, Input } from "../../components/ui/primitives.js";
import { centsToInput, formatChf, formatDate, parseChf } from "../../lib/format.js";

const CURRENT_YEAR = new Date().getFullYear();

export function TaxPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [year, setYear] = useState(CURRENT_YEAR);
  const [d, setD] = useState<TaxDossier | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setD(await window.api.invoke("tax:dossier", { companyId, year }));
  }, [companyId, year]);
  useEffect(() => { void load(); }, [load]);

  async function exportFile(kind: "Pdf" | "Excel") {
    setBusy(true);
    try {
      await window.api.invoke(kind === "Pdf" ? "tax:exportPdf" : "tax:exportExcel", { companyId, year });
    } finally { setBusy(false); }
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dossier fiscal {year}</h1>
          <p className="text-sm text-muted-foreground">{active.name} · {LEGAL_FORM_LABELS[d.form]} · aide à la déclaration</p>
        </div>
        <div className="flex items-end gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {[CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button variant="outline" onClick={() => void exportFile("Pdf")} disabled={busy}><FileDown size={16} /> PDF</Button>
          <Button variant="outline" onClick={() => void exportFile("Excel")} disabled={busy}><FileDown size={16} /> Excel</Button>
        </div>
      </div>

      {/* Income statement */}
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Compte de résultat</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Produits</div>
            <Lines lines={d.incomeStatement.productsByCategory} total={d.incomeStatement.totalProducts} totalLabel="Total produits" />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Charges</div>
            <Lines lines={d.incomeStatement.expensesByCategory} total={d.incomeStatement.totalExpenses} totalLabel="Total charges" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <span className="font-medium">{d.incomeStatement.result >= 0 ? "Bénéfice" : "Perte"}</span>
          <span className={`text-xl font-semibold tabular-nums ${d.incomeStatement.result >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {formatChf(d.incomeStatement.result)}
          </span>
        </div>
      </Card>

      {/* VAT summary */}
      {d.vat.subject && (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">Récapitulatif TVA {year}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="TVA collectée" value={formatChf(d.vat.collected)} />
            <Stat label="Impôt préalable" value={formatChf(d.vat.inputTax)} />
            <Stat label="TVA nette due (année)" value={formatChf(d.vat.netDue)} />
            <Stat label="Autres fonds (900/910)" value={formatChf(d.vat.otherFunds900 + d.vat.otherFunds910)} />
          </div>
        </Card>
      )}

      {/* Part depending on the legal form */}
      {d.taxModule === "independent_income" && (
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-medium">Revenu de l'activité indépendante</h2>
          <p className="text-sm text-muted-foreground">À reporter dans ta déclaration privée et comme base pour l'AVS.</p>
          <div className="mt-3 text-2xl font-semibold tabular-nums">{formatChf(d.independentIncome ?? 0)}</div>
        </Card>
      )}

      {d.taxModule === "association" && (
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-medium">Bénéfice imposable (association)</h2>
          <p className="text-sm text-muted-foreground">Résultat de l'exercice, à reporter dans la déclaration de l'association. Une association n'a pas de capital-actions.</p>
          <div className="mt-3 text-2xl font-semibold tabular-nums">{formatChf(d.associationProfit ?? 0)}</div>
        </Card>
      )}

      {d.taxModule === "partner_allocation" && (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">Répartition du résultat par associé</h2>
          {d.allocationWarning ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">⚠ {d.allocationWarning}</p>
          ) : (
            <div className="divide-y text-sm">
              {(d.allocation ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <span>{a.name} <span className="text-muted-foreground">({(a.shareBps / 100).toFixed(2)} %)</span></span>
                  <span className="font-medium tabular-nums">{formatChf(a.amount)}</span>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">Chaque associé reporte sa part dans sa déclaration privée.</p>
            </div>
          )}
        </Card>
      )}

      {d.taxModule === "corporate" && <EquityForm companyId={companyId} onSaved={() => void load()} />}

      {d.taxModule === "corporate" && d.corporate && (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">Impôt sur le bénéfice et le capital</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <Stat label="Bénéfice imposable" value={formatChf(d.corporate.taxableProfit)} big />
            <Stat label="Capital propre imposable" value={formatChf(d.corporate.equityCapital)} big />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Stat label="Capital social" value={formatChf(d.corporate.shareCapital)} />
            <Stat label="Réserves" value={formatChf(d.corporate.reserves)} />
            <Stat label="Salaire gérant" value={formatChf(d.corporate.managerSalary)} />
            <Stat label="Dividendes" value={formatChf(d.corporate.dividends)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Distinction salaire du gérant / dividendes à reporter dans la déclaration de la société.</p>
        </Card>
      )}

      {/* Investments */}
      {d.investments.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">Investissements (code 405)</h2>
          <div className="divide-y text-sm">
            {d.investments.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1.5">
                <span>{formatDate(i.date)} · {i.number ?? ""} {i.label}</span>
                <span className="tabular-nums">{formatChf(i.amountChf)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const EQUITY_FIELDS: { key: keyof CompanyEquity; label: string }[] = [
  { key: "shareCapital", label: "Capital social" },
  { key: "reserves", label: "Réserves" },
  { key: "retainedEarnings", label: "Report à nouveau" },
  { key: "managerSalary", label: "Salaire du gérant" },
  { key: "dividends", label: "Dividendes" },
  { key: "nonDeductibleCharges", label: "Charges non déductibles" },
];

/** Equity entry for a Sàrl/SA → feeds the profit tax + capital tax. */
function EquityForm({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const actionBar = useActionBar();
  const loadVals = useCallback(async () => {
    const e = await window.api.invoke("companyEquity:get", { companyId });
    setVals(Object.fromEntries(EQUITY_FIELDS.map((f) => [f.key, centsToInput(e[f.key])])));
  }, [companyId]);
  useEffect(() => { void loadVals(); }, [loadVals]);

  async function save() {
    const data = Object.fromEntries(
      EQUITY_FIELDS.map((f) => [f.key, parseChf(vals[f.key] ?? "")]),
    ) as unknown as CompanyEquity;
    await actionBar.track(
      "Fonds propres enregistrés",
      () => window.api.invoke("companyEquity:set", { companyId, data }),
      async () => {
        await loadVals();
        onSaved();
      },
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-medium">Fonds propres</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Montants (CHF) repris dans l'impôt sur le bénéfice et le capital ci-dessous.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {EQUITY_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} placeholder="0.00" />
          </Field>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()}>Enregistrer</Button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Enregistré ✓</span>}
      </div>
    </Card>
  );
}

function Lines({ lines, total, totalLabel }: { lines: { categoryId: string | null; categoryLabel: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <div className="text-sm">
      {lines.length === 0 && <p className="py-1 text-muted-foreground">—</p>}
      {lines.map((l) => (
        <div key={l.categoryId ?? l.categoryLabel} className="flex justify-between py-1">
          <span className="text-muted-foreground">{l.categoryLabel}</span>
          <span className="tabular-nums">{formatChf(l.amount)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t pt-1 font-medium">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatChf(total)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${big ? "text-xl" : ""}`}>{value}</div>
    </div>
  );
}
