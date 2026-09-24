/**
 * Shareholders module (simple partnership / SNC): shares in %, sum checked at 100 %.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import type { AssociateInput, AssociateRecord } from "@shared/types.js";
import { rulesFor } from "@shared/legal-form.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal } from "../../components/ui/primitives.js";

export function AssociatesPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [rows, setRows] = useState<AssociateRecord[]>([]);
  const dlg = useFormDialog<AssociateRecord>("associé");
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await window.api.invoke("associates:list", { companyId }));
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  const usesAssociates = rulesFor(active.legalForm).usesAssociates;
  const totalBps = rows.reduce((s, r) => s + r.shareBps, 0);
  const totalOk = totalBps === 10000;

  function remove(id: string) {
    const name = rows.find((r) => r.id === id)?.name ?? "";
    actionBar.defer(`Suppression de l'associé ${name}`, async () => {
      await window.api.invoke("associates:remove", { companyId, id });
      await load();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Associés</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <Button onClick={() => dlg.open(null)}><Plus size={16} /> Nouvel associé</Button>
      </div>

      {!usesAssociates && (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Users size={16} />
          Le module Associés concerne surtout la société simple et la SNC. La forme actuelle
          ({active.legalForm === "sarl" || active.legalForm === "sa" ? "personne morale" : "—"})
          n'en a pas besoin, mais tu peux quand même en saisir.
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2 text-right">Part</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Aucun associé.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2 font-medium">{a.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.role ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(a.shareBps / 100).toFixed(2)} %</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(a)}><Pencil size={14} /></Button>
                  <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void remove(a.id)}><Trash2 size={14} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="px-3 py-2 font-medium" colSpan={2}>Total des parts</td>
                <td className="px-3 py-2 text-right">
                  <Badge className={totalOk ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>
                    {(totalBps / 100).toFixed(2)} %
                  </Badge>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      {!totalOk && rows.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚠ La somme des parts doit valoir 100 % pour répartir le résultat (actuellement {(totalBps / 100).toFixed(2)} %).
        </p>
      )}

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier l'associé" : "Nouvel associé"}>
        {dlg.mounted && (
          <AssociateForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            suggestedShare={dlg.item ? null : Math.max(0, 10000 - totalBps)}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function AssociateForm({ companyId, initial, suggestedShare, onSaved, onCancel }: {
  companyId: string;
  initial: AssociateRecord | null;
  suggestedShare: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [shareStr, setShareStr] = useState(
    initial ? (initial.shareBps / 100).toFixed(2) : suggestedShare != null ? (suggestedShare / 100).toFixed(2) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  async function save() {
    setError(null);
    const pct = Number.parseFloat(shareStr.replace(",", "."));
    if (Number.isNaN(pct)) { setError("Part invalide"); return; }
    const data: AssociateInput = { name: name.trim(), shareBps: Math.round(pct * 100), role: role.trim() || null };
    try {
      if (initial) {
        await actionBar.track(
          `Associé ${data.name} modifié`,
          () => window.api.invoke("associates:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else {
        await window.api.invoke("associates:create", { companyId, data });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Rôle (optionnel)"><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Gérant, associé…" /></Field>
      <Field label="Part (%)"><Input value={shareStr} onChange={(e) => setShareStr(e.target.value)} placeholder="50.00" inputMode="decimal" /></Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={!name.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
