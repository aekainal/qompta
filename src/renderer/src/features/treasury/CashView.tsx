/**
 * Treasury view: available cash KPIs + cash reconciliation (realigning the
 * actual balance) + receivables ageing. Fed by the company dashboard.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CompanyDashboardResult } from "@shared/dashboard.js";
import type { ObjectiveProgress } from "@shared/objectives.js";
import type { CashReconciliation } from "@shared/cashReconciliation.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Button, Card, Input, Modal } from "../../components/ui/primitives.js";
import { centsToInput, formatChf, formatDate, parseChf, todayIso } from "../../lib/format.js";
import { chfTooltip, Kpi, SectionTitle } from "../dashboard/parts.js";
import { bucketAging, InvoiceList, ObjectivesGrid, sumRefs } from "../dashboard/widgets.js";

export function CashView({ data, objectives, companyId, reload }: {
  data: CompanyDashboardResult;
  objectives: ObjectiveProgress[];
  companyId: string;
  reload: () => Promise<void> | void;
}) {
  const aging = useMemo(() => bucketAging(data.unpaid), [data.unpaid]);
  const actionBar = useActionBar();
  const [recs, setRecs] = useState<CashReconciliation[]>([]);
  const dlg = useFormDialog<null>("pointage de trésorerie");

  const loadRecs = useCallback(async () => {
    setRecs(await window.api.invoke("cashReconciliations:list", { companyId }));
  }, [companyId]);
  useEffect(() => { void loadRecs(); }, [loadRecs]);

  async function afterChange() {
    await Promise.all([loadRecs(), reload()]);
  }

  function removeRec(rec: CashReconciliation) {
    actionBar.defer(`Suppression du pointage du ${formatDate(rec.date)}`, async () => {
      await window.api.invoke("cashReconciliations:remove", { companyId, id: rec.id });
      await afterChange();
    });
  }

  const reconciledHint = data.cash.reconciledOn ? `recalé au ${formatDate(data.cash.reconciledOn)}` : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Disponible" value={formatChf(data.cash.available)} accent={data.cash.available >= data.cash.toPay ? "green" : "red"} hint={reconciledHint ?? (data.cash.toPay > 0 ? `${formatChf(data.cash.toPay)} à payer` : "rien à payer")} />
        <Kpi label="Encaissé (TTC)" value={formatChf(data.cash.collected)} accent="green" />
        <Kpi label="Payé (TTC)" value={formatChf(data.cash.spent)} accent="red" />
        <Kpi label="Apports associés" value={formatChf(data.cash.funding)} accent="blue" hint={data.funding.count > 0 ? `${data.funding.count} en ${data.year}` : "-"} />
        <Kpi label="Impayés (TTC)" value={formatChf(sumRefs(data.unpaid))} accent="amber" hint={`${data.unpaid.length} facture${data.unpaid.length > 1 ? "s" : ""}`} />
        <Kpi label="Taux d'encaissement" value={`${(data.metrics.collection_rate / 100).toFixed(0)} %`} accent="blue" />
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        {reconciledHint
          ? `Trésorerie recalée sur le solde réel constaté au ${formatDate(data.cash.reconciledOn!)} (${formatChf(data.cash.reconciledBalance ?? 0)}) : seuls les flux postérieurs s'y ajoutent. Une écriture antérieure ajoutée après coup ne bouge plus ce solde.`
          : "Trésorerie cumulée depuis l'origine : apports nets + ventes encaissées − achats payés − TVA nette versée à l'AFC (décomptes payés). Un apport n'est pas du chiffre d'affaires."}
      </p>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Pointage de trésorerie</SectionTitle>
          <Button variant="outline" className="h-8" onClick={() => dlg.open(null)}>Mettre à jour le solde</Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Recale la trésorerie sur le vrai solde bancaire à une date (prélèvements privés, cash, écarts non saisis…). N'affecte ni le résultat ni le décompte TVA.
        </p>
        {recs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucun pointage. La trésorerie est le cumul depuis l'origine.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1">Date</th><th className="py-1 text-right">Solde constaté</th><th className="py-1 pl-3">Note</th><th></th></tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5">{formatDate(r.date)}</td>
                  <td className="py-1.5 text-right font-medium">{formatChf(r.balance)}</td>
                  <td className="py-1.5 pl-3 text-muted-foreground">{r.note ?? "-"}</td>
                  <td className="py-1.5 text-right">
                    <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => removeRec(r)}>Supprimer</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal {...dlg.modalProps} title="Mettre à jour le solde de trésorerie">
        {dlg.mounted && (
          <ReconcileForm
            key={dlg.key}
            companyId={companyId}
            computed={data.cash.available}
            onSaved={async () => { dlg.done(); await afterChange(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>

      <ObjectivesGrid objectives={objectives} categories={["funds"]} title="Objectifs de fonds" />

      <Card className="p-4">
        <SectionTitle>Ancienneté des créances (impayés)</SectionTitle>
        {aging.every((b) => b.value === 0) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune créance en attente.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={aging}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={52} />
              <Tooltip formatter={(v: number) => chfTooltip(v)} />
              <Bar dataKey="value" name="Encours" radius={[3, 3, 0, 0]}>
                {aging.map((_, i) => <Cell key={i} fill={["#22c55e", "#f59e0b", "#f97316", "#ef4444"][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle>Factures impayées ({data.unpaid.length})</SectionTitle>
          <InvoiceList rows={data.unpaid} empty="Aucune facture impayée." />
        </Card>
        <Card className="p-4">
          <SectionTitle className="text-red-500">En retard ({data.overdue.length})</SectionTitle>
          <InvoiceList rows={data.overdue} empty="Aucune facture en retard." />
        </Card>
      </div>
    </div>
  );
}

/** Entry of an actual balance observed on a date → realigns the cash position. */
function ReconcileForm({ companyId, computed, onSaved, onCancel }: {
  companyId: string;
  computed: number;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [balanceStr, setBalanceStr] = useState(centsToInput(computed));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!balanceStr.trim()) { setError("Indiquez le solde réel constaté."); return; }
    try {
      await window.api.invoke("cashReconciliations:create", {
        companyId,
        data: { date, balance: parseChf(balanceStr), note: note.trim() || null },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  const delta = parseChf(balanceStr) - computed;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Date du pointage</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Solde réel (CHF)</span>
          <Input value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} placeholder="0.00" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Note (facultatif)</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prélèvement privé, cash…" />
      </label>
      <p className="text-xs text-muted-foreground">
        Trésorerie calculée : {formatChf(computed)} · écart appliqué : {delta >= 0 ? "+" : ""}{formatChf(delta)}.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()}>Enregistrer</Button>
      </div>
    </div>
  );
}
