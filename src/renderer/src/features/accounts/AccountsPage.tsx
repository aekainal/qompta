/**
 * Chart of accounts page: list of categories per company, adding/editing.
 * The default chart (SME, suited to the legal form) is installed when the company is created.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { AccountCategory, AccountCategoryInput, AccountKind } from "@shared/types.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal, Select } from "../../components/ui/primitives.js";

const KIND_LABELS: Record<AccountKind, string> = {
  product: "Produit",
  expense: "Charge",
  asset: "Actif / investissement",
  liability: "Passif",
  equity: "Capitaux propres",
};

export function AccountsPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [rows, setRows] = useState<AccountCategory[]>([]);
  const dlg = useFormDialog<AccountCategory>("compte");

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await window.api.invoke("accounts:list", { companyId }));
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plan comptable</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} comptes · {active.name} (compta {active.accountingMode})
          </p>
        </div>
        <Button onClick={() => dlg.open(null)}><Plus size={16} /> Nouveau compte</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2">Nature</th>
              <th className="px-3 py-2">Code TVA défaut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                <td className="px-3 py-2">{a.label}</td>
                <td className="px-3 py-2"><Badge>{KIND_LABELS[a.kind]}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">{a.defaultVatCode ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(a)}><Pencil size={14} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier le compte" : "Nouveau compte"}>
        {dlg.mounted && (
          <AccountForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function AccountForm({ companyId, initial, onSaved, onCancel }: {
  companyId: string;
  initial: AccountCategory | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? "expense");
  const [vatCode, setVatCode] = useState(initial?.defaultVatCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  async function save() {
    setError(null);
    const data: AccountCategoryInput = { code: code.trim(), label: label.trim(), kind, defaultVatCode: vatCode.trim() || null };
    try {
      if (initial) {
        await actionBar.track(
          `Compte ${data.code} modifié`,
          () => window.api.invoke("accounts:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else {
        await window.api.invoke("accounts:create", { companyId, data });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="4000" /></Field>
        <Field label="Nature">
          <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className="w-full">
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Libellé"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Code TVA par défaut (303/400/405…)"><Input value={vatCode} onChange={(e) => setVatCode(e.target.value)} /></Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={!code.trim() || !label.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
