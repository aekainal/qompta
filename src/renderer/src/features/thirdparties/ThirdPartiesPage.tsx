/**
 * Address book per company, in two pages: Customers and Suppliers.
 *
 * One and the same table (`third_parties`) behind: `scope` is what filters.
 * A third party marked « client & fournisseur » shows up in both lists: it is
 * indeed the same counterpart, not two records to keep up to date separately.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Archive, Trash2 } from "lucide-react";
import type { EntityType, ThirdParty, ThirdPartyInput, ThirdPartyKind } from "@shared/types.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal, Select } from "../../components/ui/primitives.js";

const KIND_LABELS: Record<ThirdPartyKind, string> = {
  client: "Client",
  supplier: "Fournisseur",
  both: "Client & fournisseur",
};

/** Scope of a page: sales side or purchase side. */
export type ThirdPartyScope = "client" | "supplier";

const SCOPE_TEXTS: Record<ThirdPartyScope, { title: string; subtitle: string; action: string; empty: string }> = {
  client: {
    title: "Clients",
    subtitle: "Ceux à qui vous facturez",
    action: "Nouveau client",
    empty: "Aucun client.",
  },
  supplier: {
    title: "Fournisseurs",
    subtitle: "Ceux qui vous facturent",
    action: "Nouveau fournisseur",
    empty: "Aucun fournisseur.",
  },
};

export function ClientsPage() {
  return <ThirdPartiesPage scope="client" />;
}

export function SuppliersPage() {
  return <ThirdPartiesPage scope="supplier" />;
}

export function ThirdPartiesPage({ scope }: { scope: ThirdPartyScope }) {
  const { active } = useCompany();
  const companyId = active?.id ?? "";
  const [rows, setRows] = useState<ThirdParty[]>([]);
  const dlg = useFormDialog<ThirdParty>("tiers");
  const actionBar = useActionBar();
  const texts = SCOPE_TEXTS[scope];

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await window.api.invoke("thirdParties:list", { companyId }));
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  // « both » belongs to both scopes.
  const visible = useMemo(
    () => rows.filter((t) => t.kind === scope || t.kind === "both"),
    [rows, scope],
  );

  function archive(id: string) {
    const name = rows.find((r) => r.id === id)?.name ?? "";
    actionBar.defer(`Archivage du tiers ${name}`, async () => {
      await window.api.invoke("thirdParties:archive", { companyId, id });
      await load();
    });
  }

  // Permanent deletion: refused when the third party carries history (invoices,
  // quotes, contracts): we say so right away rather than arming a countdown that
  // would fail. Otherwise `defer` leaves 5 s to change one's mind.
  async function remove(id: string) {
    const name = rows.find((r) => r.id === id)?.name ?? "";
    const u = await window.api.invoke("thirdParties:usage", { companyId, id });
    const linked = [
      u.invoices && `${u.invoices} facture${u.invoices > 1 ? "s" : ""}`,
      u.quotes && `${u.quotes} devis`,
      u.contracts && `${u.contracts} contrat${u.contracts > 1 ? "s" : ""}`,
    ].filter(Boolean);
    if (linked.length > 0) {
      actionBar.notify(
        `Suppression impossible : ${name} est lié à ${linked.join(", ")}. Archivez-le plutôt.`,
      );
      return;
    }
    actionBar.defer(`Suppression définitive du tiers ${name}`, async () => {
      await window.api.invoke("thirdParties:delete", { companyId, id });
      await load();
    });
  }

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{texts.title}</h1>
          <p className="text-sm text-muted-foreground">{texts.subtitle} · {active.name}</p>
        </div>
        <Button onClick={() => dlg.open(null)}>
          <Plus size={16} /> {texts.action}
        </Button>
      </div>

      <Card className="divide-y">
        {visible.length === 0 && <p className="p-5 text-sm text-muted-foreground">{texts.empty}</p>}
        {visible.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">
                {t.email ?? ""} {t.vatNumber ? `· ${t.vatNumber}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Only « client & fournisseur » deserves a badge: the page says it elsewhere. */}
              {t.kind === "both" && <Badge>{KIND_LABELS.both}</Badge>}
              <Button variant="ghost" className="h-7 px-2" title="Modifier" onClick={() => dlg.open(t)}><Pencil size={14} /></Button>
              <Button variant="ghost" className="h-7 px-2" title="Archiver" onClick={() => void archive(t.id)}><Archive size={14} /></Button>
              <Button variant="ghost" className="h-7 px-2 text-destructive" title="Supprimer définitivement" onClick={() => void remove(t.id)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}
      </Card>

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier le tiers" : texts.action}>
        {dlg.mounted && (
          <TpForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            scope={scope}
            onSaved={() => { dlg.done(); void load(); }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </div>
  );
}

function TpForm({ companyId, initial, scope, onSaved, onCancel }: {
  companyId: string;
  initial: ThirdParty | null;
  scope: ThirdPartyScope;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  // A record created from the Customers page is a customer, with nothing to pick.
  const [kind, setKind] = useState<ThirdPartyKind>(initial?.kind ?? scope);
  // A customer company under contract becomes a « partenaire » (see that module).
  const [entityType, setEntityType] = useState<EntityType>(initial?.entityType ?? "company");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [vatNumber, setVatNumber] = useState(initial?.vatNumber ?? "");
  const [rcNumber, setRcNumber] = useState(initial?.rcNumber ?? "");
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? "");
  const [street, setStreet] = useState(initial?.street ?? "");
  const [buildingNumber, setBuildingNumber] = useState(initial?.buildingNumber ?? "");
  const [zip, setZip] = useState(initial?.zip ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "CH");
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  const trimmed = (v: string) => v.trim() || null;

  async function save() {
    setError(null);
    const data: ThirdPartyInput = {
      name: name.trim(),
      kind,
      entityType,
      email: trimmed(email),
      phone: trimmed(phone),
      // A natural person has neither a VAT nor a commercial register number: a
      // value left over from an earlier « entreprise » pass is not saved.
      vatNumber: entityType === "company" ? trimmed(vatNumber) : null,
      rcNumber: entityType === "company" ? trimmed(rcNumber) : null,
      addressLine2: trimmed(addressLine2),
      street: trimmed(street),
      buildingNumber: trimmed(buildingNumber),
      zip: trimmed(zip),
      city: trimmed(city),
      country: country.trim().toUpperCase() || "CH",
    };
    try {
      if (initial) {
        await actionBar.track(
          `Tiers ${initial.name} modifié`,
          () => window.api.invoke("thirdParties:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else await window.api.invoke("thirdParties:create", { companyId, data });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as ThirdPartyKind)} className="w-full">
          <option value="client">Client</option>
          <option value="supplier">Fournisseur</option>
          <option value="both">Client &amp; fournisseur</option>
        </Select>
      </Field>
      <Field label="Nature">
        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as EntityType)}
          className="w-full"
        >
          <option value="company">Entreprise</option>
          <option value="person">Personne physique</option>
        </Select>
      </Field>
      {entityType === "company" && kind !== "supplier" && (
        <p className="text-xs text-muted-foreground">
          Une entreprise cliente devient un <strong>partenaire</strong> dès qu'elle a un
          contrat : elle apparaît alors dans le module du même nom.
        </p>
      )}
      {kind !== scope && kind !== "both" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Ce tiers quittera cette page : il n'apparaîtra plus que dans « {SCOPE_TEXTS[kind].title} ».
        </p>
      )}
      <Field label="Complément">
        <Input
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="titulaire Umahara, service comptabilité…"
        />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Rue"><Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rue Albert-Gobat" /></Field>
        <Field label="N°"><Input value={buildingNumber} onChange={(e) => setBuildingNumber(e.target.value)} className="w-20" placeholder="2" /></Field>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-3">
        <Field label="NPA"><Input value={zip} onChange={(e) => setZip(e.target.value)} className="w-24" placeholder="2720" /></Field>
        <Field label="Localité"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tramelan" /></Field>
        <Field label="Pays"><Input value={country} onChange={(e) => setCountry(e.target.value)} className="w-16" placeholder="CH" /></Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Rue, numéro, NPA et localité sont repris sur les devis et les factures, et exigés par la QR-facture.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="E-mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Téléphone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      {/* VAT and commercial register numbers only make sense for a company. */}
      {entityType === "company" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="N° TVA"><Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="CHE-123.456.789 TVA" /></Field>
          <Field label="N° RC"><Input value={rcNumber} onChange={(e) => setRcNumber(e.target.value)} placeholder="CH-036-1102819-0" /></Field>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button onClick={() => void save()} disabled={!name.trim()}>Enregistrer</Button>
      </div>
    </div>
  );
}
