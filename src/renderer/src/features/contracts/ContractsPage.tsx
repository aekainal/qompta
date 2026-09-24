/**
 * Contracts page: list filterable by status, two-step creation (template then
 * building), editing, and template management (reusable structures).
 */

import { useCallback, useEffect, useState } from "react";
import { CopyPlus, Eye, FileDown, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Contract, ContractStatus, ContractTemplate, Quote, ThirdParty } from "@shared/types.js";
import { contentCount } from "@shared/documents/contract-blocks.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Modal, Select } from "../../components/ui/primitives.js";
import { formatChf, formatDate, todayIso } from "../../lib/format.js";
import { ContractForm } from "./ContractForm.js";
import { ContractCreator } from "./ContractCreator.js";
import { TemplateEditor } from "./TemplateEditor.js";

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  signed: "Signé",
  terminated: "Résilié",
};

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  signed: "bg-green-500/15 text-green-600 dark:text-green-400",
  terminated: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function ContractsPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";

  const [tab, setTab] = useState<"contracts" | "templates">("contracts");
  const [rows, setRows] = useState<Contract[]>([]);
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [tpMap, setTpMap] = useState<Record<string, string>>({});
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const dlg = useFormDialog<Contract>("contrat");
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await window.api.invoke("contracts:list", { companyId, status: status || undefined }));
  }, [companyId, status]);

  const loadRefs = useCallback(async () => {
    if (!companyId) return;
    const [tp, qs] = await Promise.all([
      window.api.invoke("thirdParties:list", { companyId }),
      window.api.invoke("quotes:list", { companyId }),
    ]);
    setThirdParties(tp);
    setTpMap(Object.fromEntries(tp.map((t) => [t.id, t.name])));
    setQuotes(qs);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRefs(); }, [loadRefs]);

  /** Centralises the calls to the main: any business error surfaces in the banner. */
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function remove(c: Contract) {
    actionBar.defer(`Suppression du contrat ${c.number}`, () =>
      run(() => window.api.invoke("contracts:delete", { companyId, id: c.id })),
    );
  }

  function setContractStatus(c: Contract, next: ContractStatus) {
    // Signing and termination carry a date: it is asked for, today by default.
    let date: string | undefined;
    if (next === "signed" || next === "terminated") {
      const answer = prompt(
        next === "signed" ? "Date de signature (AAAA-MM-JJ)" : "Date de résiliation (AAAA-MM-JJ)",
        c.signedDate ?? todayIso(),
      );
      if (!answer) return;
      date = answer;
    }
    void run(() =>
      actionBar.track(
        `Contrat ${c.number} : ${STATUS_LABELS[next].toLowerCase()}`,
        () => window.api.invoke("contracts:setStatus", { companyId, id: c.id, status: next, date }),
        load,
      ),
    );
  }

  function pdf(c: Contract, kind: "preview" | "export") {
    void run(() =>
      window.api.invoke(kind === "preview" ? "contracts:previewPdf" : "contracts:exportPdf", {
        companyId,
        id: c.id,
      }),
    );
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contrats</h1>
          <p className="text-sm text-muted-foreground">{rows.length} contrat(s) — {active.name}</p>
        </div>
        {tab === "contracts" && (
          <Button onClick={() => dlg.open(null)}>
            <Plus size={16} /> Nouveau contrat
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "contracts" ? "default" : "outline"} onClick={() => setTab("contracts")}>
          Contrats
        </Button>
        <Button variant={tab === "templates" ? "default" : "outline"} onClick={() => setTab("templates")}>
          Modèles
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {tab === "contracts" ? (
        <>
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Statut</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | "")}>
                <option value="">Tous</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Objet</th>
                  <th className="px-3 py-2 text-right">Mensuel HT</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Aucun contrat.</td></tr>
                )}
                {rows.map((c) => {
                  const signed = c.status === "signed";
                  return (
                    <tr key={c.id} className="border-t hover:bg-accent/40">
                      <td className="px-3 py-2 font-mono text-xs">{c.number}</td>
                      <td className="px-3 py-2">{formatDate(c.issueDate)}</td>
                      <td className="px-3 py-2">{c.thirdPartyId ? tpMap[c.thirdPartyId] ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{c.title ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.monthlyAmountHt != null ? formatChf(c.monthlyAmountHt) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={STATUS_COLORS[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          {c.status === "draft" && (
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setContractStatus(c, "sent")}>
                              Envoyé
                            </Button>
                          )}
                          {(c.status === "draft" || c.status === "sent") && (
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setContractStatus(c, "signed")}>
                              Signer
                            </Button>
                          )}
                          {c.status !== "terminated" && (
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setContractStatus(c, "terminated")}>
                              Résilier
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => dlg.open(c)}
                            title={signed ? "Contrat signé : son contenu n'est plus modifiable." : "Modifier"}
                            aria-label="Modifier"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" className="h-7 px-2" onClick={() => pdf(c, "preview")} title="Aperçu PDF" aria-label="Aperçu PDF">
                            <Eye size={14} />
                          </Button>
                          <Button variant="ghost" className="h-7 px-2" onClick={() => pdf(c, "export")} title="Exporter en PDF" aria-label="Exporter en PDF">
                            <FileDown size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            onClick={() => remove(c)}
                            disabled={signed}
                            title={signed ? "Un contrat signé ne peut pas être supprimé ; il peut être résilié." : "Supprimer"}
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <TemplatesSection companyId={companyId} />
      )}

      <Modal
        {...dlg.modalProps}
        title={dlg.item ? `Modifier le contrat ${dlg.item.number}` : "Nouveau contrat"}
        wide
      >
        {dlg.mounted &&
          (dlg.item ? (
            <ContractForm
              key={dlg.key}
              companyId={companyId}
              initial={dlg.item}
              thirdParties={thirdParties}
              quotes={quotes}
              onSaved={() => { dlg.done(); void load(); }}
              onCancel={dlg.cancel}
            />
          ) : (
            <ContractCreator
              key={dlg.key}
              companyId={companyId}
              thirdParties={thirdParties}
              quotes={quotes}
              onSaved={() => { dlg.done(); void load(); }}
              onCancel={dlg.cancel}
            />
          ))}
      </Modal>
    </div>
  );
}

/** "Modèles" tab: reusable structures, default template. */
function TemplatesSection({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();
  const dlg = useFormDialog<ContractTemplate>("modèle de contrat");

  const load = useCallback(async () => {
    if (!companyId) return;
    setTemplates(await window.api.invoke("contracts:templates", { companyId }));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  function makeDefault(t: ContractTemplate) {
    void run(() =>
      actionBar.track(
        `« ${t.name} » est le modèle par défaut`,
        () => window.api.invoke("contracts:saveTemplate", { companyId, id: t.id, name: t.name, blocks: t.blocks, isDefault: true }),
        load,
      ),
    );
  }

  function duplicate(t: ContractTemplate) {
    void run(() =>
      window.api.invoke("contracts:saveTemplate", { companyId, id: null, name: `${t.name} (copie)`, blocks: t.blocks }),
    );
  }

  function remove(t: ContractTemplate) {
    actionBar.defer(`Suppression du modèle « ${t.name} »`, () =>
      run(() => window.api.invoke("contracts:deleteTemplate", { companyId, id: t.id })),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Un modèle est une structure de contrat (articles, listes, tableaux, signatures…) réutilisée à chaque nouveau contrat.
        </p>
        <Button onClick={() => dlg.open(null)}><Plus size={16} /> Nouveau modèle</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Sections</th>
              <th className="px-3 py-2">Par défaut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Aucun modèle.</td></tr>
            )}
            {templates.map((t) => (
              <tr key={t.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">{contentCount(t.blocks)}</td>
                <td className="px-3 py-2">
                  {t.isDefault ? <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Par défaut</Badge> : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(t)} aria-label="Modifier" title="Modifier">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" className="h-7 px-2" onClick={() => duplicate(t)} aria-label="Dupliquer" title="Dupliquer">
                      <CopyPlus size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => makeDefault(t)}
                      disabled={t.isDefault}
                      title="Définir comme modèle par défaut"
                      aria-label="Définir par défaut"
                    >
                      <Star size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-destructive"
                      onClick={() => remove(t)}
                      disabled={t.isDefault}
                      title={t.isDefault ? "Le modèle par défaut ne peut pas être supprimé." : "Supprimer"}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal {...dlg.modalProps} title={dlg.item ? `Modifier le modèle « ${dlg.item.name} »` : "Nouveau modèle"} wide>
        {dlg.mounted && (
          <TemplateEditor
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            templates={templates}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}
