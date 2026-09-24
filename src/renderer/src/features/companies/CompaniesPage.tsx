/**
 * Companies page: list, creation, legal form conversion.
 * Demonstrates the IPC end to end (M1).
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Copy, FlaskConical, Trash2 } from "lucide-react";
import { useCompany } from "../../app/CompanyContext.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { LEGAL_FORM_LABELS, type LegalForm } from "@shared/legal-form.js";
import type { Company } from "@shared/types.js";
import { Button, Card, Field, Input, Modal, Select } from "../../components/ui/primitives.js";
import { cn } from "../../lib/utils.js";

const FORMS: LegalForm[] = [
  "raison_individuelle",
  "societe_simple",
  "snc",
  "sarl",
  "sa",
  "association",
];

export function CompaniesPage() {
  const { reload, setActive } = useCompany();
  const actionBar = useActionBar();
  const [name, setName] = useState("");
  const [form, setForm] = useState<LegalForm>("raison_individuelle");
  const [ide, setIde] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convertDlg = useFormDialog<Company>("changement de forme juridique");
  // The page lists ALL companies (inactive ones included), to manage/reactivate them.
  const [all, setAll] = useState<Company[]>([]);
  const loadAll = useCallback(async () => {
    setAll(await window.api.invoke("companies:list", { includeArchived: true }));
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await window.api.invoke("companies:create", {
        name: name.trim(),
        legalForm: form,
        ideNumber: ide.trim() || null,
      });
      setName("");
      setIde("");
      await reload();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  async function createTest() {
    const c = await window.api.invoke("companies:createTest", { name: name.trim() || null, legalForm: form });
    setName("");
    setIde("");
    await reload();
    await loadAll();
    await setActive(c.id);
  }
  function deleteTest(c: Company) {
    actionBar.defer(`Suppression de « ${c.name} »`, async () => {
      await window.api.invoke("companies:deleteTest", { id: c.id });
      await reload();
      await loadAll();
    });
  }
  async function duplicate(c: Company) {
    await window.api.invoke("companies:duplicate", { id: c.id, name: `${c.name} (copie)` });
    await reload();
    await loadAll();
  }
  async function refresh() {
    await reload();
    await loadAll();
  }
  async function setStatus(c: Company, status: string) {
    await actionBar.track(
      `« ${c.name} » ${status === "active" ? "réactivée" : "passée inactive"}`,
      () => window.api.invoke("companies:setStatus", { id: c.id, status }),
      refresh,
    );
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sociétés</h1>
        <p className="text-sm text-muted-foreground">
          Gérez vos entités. Chaque société a sa comptabilité, sa TVA et son dossier
          fiscal, strictement séparés.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-medium">Nouvelle société</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Raison sociale</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Atelier Dupont" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Forme juridique</label>
            <Select value={form} onChange={(e) => setForm(e.target.value as LegalForm)} className="w-full">
              {FORMS.map((f) => (
                <option key={f} value={f}>
                  {LEGAL_FORM_LABELS[f]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">N° IDE (optionnel)</label>
            <Input value={ide} onChange={(e) => setIde(e.target.value)} placeholder="CHE-123.456.789" />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? "Création…" : "Créer la société"}
          </Button>
          <Button variant="outline" onClick={() => void createTest()} title="Société jetable préfixée TEST_, supprimable">
            <FlaskConical size={16} /> Créer en société de test
          </Button>
        </div>
      </Card>

      <Card className="divide-y">
        {all.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">Aucune société pour l'instant.</p>
        )}
        {all.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {LEGAL_FORM_LABELS[c.legalForm]}
                {c.ideNumber ? ` · ${c.ideNumber}` : ""} · compta {c.accountingMode}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={c.status === "active" ? "active" : "inactive"}
                onChange={(e) => void setStatus(c, e.target.value)}
                title="Statut de la société"
                className={cn(
                  "h-8 rounded-md border border-input bg-background px-2 text-xs font-medium",
                  c.status === "active" ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                )}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <Button variant="ghost" className="h-8 px-2" title="Dupliquer" onClick={() => void duplicate(c)}><Copy size={15} /></Button>
              <Button variant="ghost" className="h-8 px-2" title="Convertir la forme" onClick={() => convertDlg.open(c)}><ArrowLeftRight size={15} /></Button>
              {c.name.startsWith("TEST_") && (
                <Button variant="ghost" className="h-8 px-2 text-destructive" title="Supprimer" onClick={() => deleteTest(c)}><Trash2 size={15} /></Button>
              )}
            </div>
          </div>
        ))}
      </Card>

      <Modal {...convertDlg.modalProps} title="Changer la forme juridique">
        {convertDlg.mounted && convertDlg.item && (
          <ConvertForm
            key={convertDlg.key}
            company={convertDlg.item}
            onDone={() => { convertDlg.done(); void refresh(); }}
            onUndone={refresh}
            onCancel={convertDlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function ConvertForm({ company, onDone, onUndone, onCancel }: {
  company: Company;
  onDone: () => void;
  onUndone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const actionBar = useActionBar();
  const [toForm, setToForm] = useState<LegalForm>(company.legalForm);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    setError(null);
    try {
      await actionBar.track(
        `« ${company.name} » convertie en ${LEGAL_FORM_LABELS[toForm]}`,
        () =>
          window.api.invoke("companies:convertLegalForm", {
            companyId: company.id,
            toForm,
            effectiveDate,
            note: note.trim() || null,
          }),
        onUndone,
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Forme actuelle : <strong>{LEGAL_FORM_LABELS[company.legalForm]}</strong>. L'historique
        antérieur reste consultable sous l'ancienne forme ; les nouveaux exercices suivent la
        nouvelle forme à partir de la date d'effet.
      </p>
      <Field label="Nouvelle forme">
        <Select value={toForm} onChange={(e) => setToForm(e.target.value as LegalForm)} className="w-full">
          {FORMS.map((f) => <option key={f} value={f}>{LEGAL_FORM_LABELS[f]}</option>)}
        </Select>
      </Field>
      <Field label="Date d'effet">
        <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </Field>
      <Field label="Note (optionnel)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. passage en Sàrl" />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void convert()} disabled={toForm === company.legalForm}>Convertir</Button>
      </div>
    </div>
  );
}
