/**
 * Fund contributions: the money paid into the company by its shareholders.
 *
 * This is not revenue — nothing here enters the VAT return.
 * The screen answers two questions: how much each shareholder put in, and how
 * much the company still owes them (shareholder loan account).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import type { AssociateRecord, BankAccount } from "@shared/types.js";
import {
  FUND_KIND_LABELS,
  FUND_METHOD_LABELS,
  summarizeFunding,
  type FundContribution,
  type FundContributionInput,
  type FundContributionKind,
  type FundContributionMethod,
} from "@shared/funding.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea } from "../../components/ui/primitives.js";
import { centsToInput, formatChf, formatDate, parseChf, todayIso } from "../../lib/format.js";

const KINDS: FundContributionKind[] = ["capital", "current_account", "repayment"];

export function FundingPage() {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [rows, setRows] = useState<FundContribution[]>([]);
  const [associates, setAssociates] = useState<AssociateRecord[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const dlg = useFormDialog<FundContribution>("entrée de fonds");
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    const [list, assoc, bankList] = await Promise.all([
      window.api.invoke("funding:list", { companyId }),
      window.api.invoke("associates:list", { companyId }),
      window.api.invoke("bankAccounts:list", { companyId }),
    ]);
    setRows(list);
    setAssociates(assoc);
    setBanks(bankList);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeFunding(rows), [rows]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  function remove(row: FundContribution) {
    actionBar.defer(
      `Suppression de l'entrée de ${row.associateName} (${formatChf(row.amount)})`,
      async () => {
        await window.api.invoke("funding:remove", { companyId, id: row.id });
        await load();
      },
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entrées de fonds</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <Button onClick={() => dlg.open(null)}>
          <Plus size={16} /> Nouvelle entrée
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Apports en capital" value={formatChf(summary.capital)} accent="blue" />
        <Kpi label="Avances en compte courant" value={formatChf(summary.currentAccount)} />
        <Kpi label="Remboursements" value={formatChf(summary.repaid)} />
        <Kpi
          label="Argent net apporté"
          value={formatChf(summary.net)}
          accent="green"
          hint={
            summary.owedToAssociates > 0
              ? `dont ${formatChf(summary.owedToAssociates)} dus aux associés`
              : "aucune dette envers les associés"
          }
        />
      </div>

      <Card className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
        <Landmark size={16} className="mt-0.5 shrink-0" />
        <span>
          Un apport n'est ni un produit ni une opération TVA : il n'apparaît dans aucun décompte.
          Il finance la trésorerie — de quoi payer les premières factures avant les premiers
          encaissements. Le <strong>capital</strong> reste dans la société ; une{" "}
          <strong>avance en compte courant</strong> lui est prêtée et peut être remboursée.
        </span>
      </Card>

      {summary.byAssociate.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b px-3 py-2 text-sm font-semibold">Position par associé</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Associé</th>
                <th className="px-3 py-2 text-right">Capital</th>
                <th className="px-3 py-2 text-right">Compte courant</th>
                <th className="px-3 py-2 text-right">Remboursé</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {summary.byAssociate.map((a) => (
                <tr key={a.associateId ?? a.name} className="border-t">
                  <td className="px-3 py-2 font-medium">{a.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatChf(a.capital)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatChf(a.currentAccount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {a.repaid > 0 ? `− ${formatChf(a.repaid)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatChf(a.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Associé</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Moyen</th>
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Aucune entrée de fonds.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const out = r.kind === "repayment";
              return (
                <tr key={r.id} className="border-t hover:bg-accent/40">
                  <td className="px-3 py-2 tabular-nums">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 font-medium">{r.associateName}</td>
                  <td className="px-3 py-2">
                    <Badge
                      className={
                        out
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : r.kind === "capital"
                            ? "bg-blue-500/15 text-primary"
                            : "bg-green-500/15 text-green-600 dark:text-green-400"
                      }
                    >
                      {FUND_KIND_LABELS[r.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {FUND_METHOD_LABELS[r.method]}
                    {r.bankAccountId && banks.find((b) => b.id === r.bankAccountId)
                      ? ` · ${banks.find((b) => b.id === r.bankAccountId)!.label}`
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.reference ?? "—"}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${out ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {out ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                      {out ? "− " : "+ "}
                      {formatChf(r.amount)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" className="h-7 px-2" onClick={() => dlg.open(r)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(r)}>
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal
        {...dlg.modalProps}
        title={dlg.item ? "Modifier l'entrée de fonds" : "Nouvelle entrée de fonds"}
      >
        {dlg.mounted && (
          <FundingForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            associates={associates}
            banks={banks}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function Kpi({ label, value, accent, hint }: {
  label: string;
  value: string;
  accent?: "green" | "blue";
  hint?: string;
}) {
  const color = accent === "green" ? "text-green-600 dark:text-green-400" : accent === "blue" ? "text-primary" : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function FundingForm({ companyId, initial, associates, banks, onSaved, onCancel }: {
  companyId: string;
  initial: FundContribution | null;
  associates: AssociateRecord[];
  banks: BankAccount[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const defaultBank = banks.find((b) => b.isDefault) ?? banks[0] ?? null;
  const [associateId, setAssociateId] = useState(initial?.associateId ?? associates[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [kind, setKind] = useState<FundContributionKind>(initial?.kind ?? "current_account");
  const [amountStr, setAmountStr] = useState(initial ? centsToInput(initial.amount) : "");
  const [method, setMethod] = useState<FundContributionMethod>(initial?.method ?? "bank");
  const [bankAccountId, setBankAccountId] = useState(initial?.bankAccountId ?? defaultBank?.id ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  const noAssociate = associates.length === 0;

  async function save() {
    setError(null);
    const amount = parseChf(amountStr);
    if (amount <= 0) { setError("Le montant doit être supérieur à zéro."); return; }
    const associate = associates.find((a) => a.id === associateId);
    if (!associate) { setError("Choisissez l'associé à l'origine du versement."); return; }

    const data: FundContributionInput = {
      associateId: associate.id,
      associateName: associate.name,
      date,
      kind,
      amount,
      method,
      // A cash payment is not attached to any bank account.
      bankAccountId: method === "bank" ? bankAccountId || null : null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (initial) {
        await actionBar.track(
          "Entrée de fonds modifiée",
          () => window.api.invoke("funding:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else await window.api.invoke("funding:create", { companyId, data });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (noAssociate) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Une entrée de fonds est toujours rattachée à un associé. Créez d'abord un associé
          dans le module « Associés », puis revenez ici.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Fermer</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Associé">
          <Select className="w-full" value={associateId} onChange={(e) => setAssociateId(e.target.value)}>
            {associates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Type de mouvement">
        <Select className="w-full" value={kind} onChange={(e) => setKind(e.target.value as FundContributionKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{FUND_KIND_LABELS[k]}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant (CHF)">
          <Input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="5000.00"
            inputMode="decimal"
          />
        </Field>
        <Field label="Moyen">
          <Select
            className="w-full"
            value={method}
            onChange={(e) => setMethod(e.target.value as FundContributionMethod)}
          >
            {(["bank", "cash"] as FundContributionMethod[]).map((m) => (
              <option key={m} value={m}>{FUND_METHOD_LABELS[m]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {method === "bank" && banks.length > 0 && (
        <Field label="Compte crédité">
          <Select className="w-full" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">—</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Référence (optionnel)">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Virement du 12.01, pièce n° 3…" />
      </Field>
      <Field label="Notes (optionnel)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {kind === "repayment" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Un remboursement sort de la trésorerie et réduit le compte courant de l'associé.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={!amountStr.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
