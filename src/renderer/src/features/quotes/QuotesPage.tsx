/**
 * Quotes page: filterable list, status actions, conversion into an invoice
 * and creation of the related contract. Editing through a modal.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  FileDown,
  FileSignature,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { Quote, QuoteFilters, QuoteStatus, ThirdParty, BankAccount, QuoteWithLines } from "@shared/types.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { ContractCreator } from "../contracts/ContractCreator.js";
import { Badge, Button, Card, Input, Modal, Select } from "../../components/ui/primitives.js";
import { formatChf, formatDate, todayIso } from "../../lib/format.js";
import { QuoteForm } from "./QuoteForm.js";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  invoiced: "Facturé",
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  accepted: "bg-green-500/15 text-green-600 dark:text-green-400",
  refused: "bg-red-500/15 text-red-600 dark:text-red-400",
  expired: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  invoiced: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

export function QuotesPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";

  const [rows, setRows] = useState<Quote[]>([]);
  const [filters, setFilters] = useState<QuoteFilters>({});
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [tpMap, setTpMap] = useState<Record<string, string>>({});
  const dlg = useFormDialog<QuoteWithLines>("devis");
  const contractDlg = useFormDialog<Quote>("contrat depuis le devis");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    const list = await window.api.invoke("quotes:list", { companyId, filters });
    // Descending sort on the issue date, then on the number when dates are equal.
    setRows(
      [...list].sort((a, b) =>
        a.issueDate === b.issueDate
          ? b.number.localeCompare(a.number)
          : b.issueDate.localeCompare(a.issueDate),
      ),
    );
  }, [companyId, filters]);

  const loadRefs = useCallback(async () => {
    if (!companyId) return;
    const [tp, banks] = await Promise.all([
      window.api.invoke("thirdParties:list", { companyId }),
      window.api.invoke("bankAccounts:list", { companyId }),
    ]);
    setThirdParties(tp);
    setBankAccounts(banks);
    setTpMap(Object.fromEntries(tp.map((t) => [t.id, t.name])));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRefs(); }, [loadRefs]);

  // Status refresh on opening: expired validity, and « invoiced » quotes whose
  // invoice has been deleted (they go back to « accepted »).
  useEffect(() => {
    if (!companyId) return;
    void window.api
      .invoke("quotes:refreshExpired", { companyId, today: todayIso() })
      .then(({ updated }) => {
        if (updated > 0) void load();
      });
  }, [companyId, load]);

  function updateFilter(patch: Partial<QuoteFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  /** Common wrapper: surfaces the main's error (zod) instead of losing it. */
  async function run(fn: () => Promise<void>) {
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function openEdit(id: string) {
    const quote = await window.api.invoke("quotes:get", { companyId, id });
    if (!quote) return;
    dlg.open(quote);
  }

  function remove(id: string) {
    const number = rows.find((r) => r.id === id)?.number ?? "";
    actionBar.defer(`Suppression du devis ${number}`.trim(), () => run(async () => {
      await window.api.invoke("quotes:delete", { companyId, id });
      await load();
    }));
  }

  function duplicate(id: string) {
    void run(async () => {
      const copy = await window.api.invoke("quotes:duplicate", { companyId, id });
      setMessage(`Devis dupliqué : ${copy.number}.`);
      await load();
    });
  }

  /**
   * Creates a revised offer after a rejection. The original quote stays on
   * record but leaves the lost deals on the dashboard: the new version now
   * carries the stake.
   */
  function revise(id: string) {
    void run(async () => {
      const revision = await window.api.invoke("quotes:revise", { companyId, id });
      setMessage(
        `Devis adapté : ${revision.number}. L'original n'est plus compté comme perdu.`,
      );
      await load();
    });
  }

  function setStatus(id: string, status: QuoteStatus) {
    void run(async () => {
      const number = rows.find((r) => r.id === id)?.number ?? "";
      await actionBar.track(
        `Devis ${number} : ${STATUS_LABELS[status].toLowerCase()}`,
        () => window.api.invoke("quotes:setStatus", { companyId, id, status }),
        load,
      );
      await load();
    });
  }

  function exportPdf(id: string) {
    void run(async () => {
      const res = await window.api.invoke("quotes:exportPdf", { companyId, id });
      if (res.saved) setMessage(`PDF enregistré : ${res.path ?? ""}`);
    });
  }

  function previewPdf(id: string) {
    void run(async () => {
      await window.api.invoke("quotes:previewPdf", { companyId, id });
    });
  }

  function convert(quote: Quote) {
    actionBar.defer(
      `Conversion du devis ${quote.number} en facture (il ne sera plus modifiable)`,
      () => run(async () => {
        const res = await window.api.invoke("quotes:convertToInvoice", {
          companyId,
          id: quote.id,
          issueDate: todayIso(),
        });
        const n = res.invoices.length;
        setMessage(`${n} facture(s) créée(s) — une par taux de TVA.`);
        await load();
      }),
    );
  }

  /** Contract from a quote: pick the model, then a pre-filled builder. */
  function createContract(quote: Quote) {
    contractDlg.open(quote);
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Devis</h1>
          <p className="text-sm text-muted-foreground">{rows.length} devis — {active.name}</p>
        </div>
        <Button onClick={() => dlg.open(null)}>
          <Plus size={16} /> Nouveau devis
        </Button>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Statut</label>
          <Select
            value={filters.status ?? ""}
            onChange={(e) => updateFilter({ status: (e.target.value || undefined) as QuoteStatus | undefined })}
          >
            <option value="">Tous</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client</label>
          <Select
            value={filters.thirdPartyId ?? ""}
            onChange={(e) => updateFilter({ thirdPartyId: e.target.value || undefined })}
          >
            <option value="">Tous</option>
            {thirdParties.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Recherche</label>
          <Input
            placeholder="N° ou objet…"
            value={filters.search ?? ""}
            onChange={(e) => updateFilter({ search: e.target.value || undefined })}
          />
        </div>
      </Card>

      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Objet</th>
              <th className="px-3 py-2 text-right">TTC</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Aucun devis.</td></tr>
            )}
            {rows.map((q) => {
              const locked = q.status === "invoiced";
              const lockTitle =
                "Devis facturé : modifiable seulement si sa facture a été supprimée.";
              return (
                <tr key={q.id} className="border-t hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono text-xs">{q.number}</td>
                  <td className="px-3 py-2">{formatDate(q.issueDate)}</td>
                  <td className="px-3 py-2">{q.thirdPartyId ? tpMap[q.thirdPartyId] ?? "—" : "—"}</td>
                  <td className="px-3 py-2">{q.title ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatChf(q.amountTtc)}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                    {q.supersededByQuoteId && (
                      <div
                        className="mt-0.5 text-xs text-muted-foreground"
                        title="Une offre adaptée remplace ce devis : il n'est pas compté comme perdu."
                      >
                        adapté
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {q.status === "draft" && (
                        <Button variant="ghost" className="h-7 px-2" title="Marquer comme envoyé" onClick={() => setStatus(q.id, "sent")}>
                          <Send size={14} />
                        </Button>
                      )}
                      {(q.status === "sent" || q.status === "expired") && (
                        <>
                          <Button variant="ghost" className="h-7 px-2 text-green-600" title="Marquer comme accepté" onClick={() => setStatus(q.id, "accepted")}>
                            <Check size={14} />
                          </Button>
                          <Button variant="ghost" className="h-7 px-2 text-destructive" title="Marquer comme refusé" onClick={() => setStatus(q.id, "refused")}>
                            <X size={14} />
                          </Button>
                        </>
                      )}
                      {(q.status === "refused" || q.status === "expired") &&
                        !q.supersededByQuoteId && (
                          <Button
                            variant="outline"
                            className="h-7 px-2"
                            title="Créer une offre adaptée : ce devis ne comptera plus comme perdu"
                            onClick={() => revise(q.id)}
                          >
                            <RefreshCw size={14} /> Adapter
                          </Button>
                        )}
                      {q.status === "accepted" && (
                        <>
                          <Button variant="outline" className="h-7 px-2" title="Convertir en facture" onClick={() => convert(q)}>
                            <Receipt size={14} /> Facturer
                          </Button>
                          <Button variant="outline" className="h-7 px-2" title="Créer le contrat depuis ce devis" onClick={() => createContract(q)}>
                            <FileSignature size={14} /> Contrat
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" className="h-7 px-2" title="Aperçu PDF" onClick={() => previewPdf(q.id)}>
                        <Eye size={14} />
                      </Button>
                      <Button variant="ghost" className="h-7 px-2" title="Exporter en PDF" onClick={() => exportPdf(q.id)}>
                        <FileDown size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-7 px-2"
                        // NEVER disabled: an invoiced quote becomes editable again as
                        // soon as its invoice is deleted, and only the main knows
                        // whether it still exists — it refuses if need be.
                        title={locked ? lockTitle : "Modifier"}
                        onClick={() => void openEdit(q.id)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" className="h-7 px-2" title="Dupliquer" onClick={() => duplicate(q.id)}>
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        // An invoiced quote stays deletable once its invoice is
                        // deleted: the main decides, it knows the link.
                        title={
                          locked
                            ? "Supprimer — possible seulement si la facture a été supprimée"
                            : "Supprimer"
                        }
                        onClick={() => remove(q.id)}
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

      <Modal {...dlg.modalProps} title={dlg.item ? `Modifier le devis ${dlg.item.number}` : "Nouveau devis"} wide>
        {dlg.mounted && (
          <QuoteForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            thirdParties={thirdParties}
            bankAccounts={bankAccounts}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>

      <Modal
        {...contractDlg.modalProps}
        title={contractDlg.item ? `Contrat depuis le devis ${contractDlg.item.number}` : "Nouveau contrat"}
        wide
      >
        {contractDlg.mounted && contractDlg.item && (
          <ContractCreator
            key={contractDlg.key}
            companyId={companyId}
            thirdParties={thirdParties}
            quotes={rows}
            fromQuoteId={contractDlg.item.id}
            onSaved={() => {
              setMessage(`Contrat créé depuis le devis ${contractDlg.item?.number ?? ""}.`);
              contractDlg.done();
              void load();
            }}
            onCancel={contractDlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}
