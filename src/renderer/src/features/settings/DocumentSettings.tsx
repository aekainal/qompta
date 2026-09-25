/**
 * Settings tied to commercial documents: contact details printed on the quotes,
 * invoices and contracts, and bank accounts used by the QR-bill.
 *
 * Everything **visual** (logo, color, pattern, etc.) lives in the "Apparence PDF"
 * screen: two forms editing the same fields would end up overwriting each other.
 * Here, only printed data is entered.
 */

import { useCallback, useEffect, useState } from "react";
import { Archive, Check, Plus, Star } from "lucide-react";
import type { BankAccount, BankAccountInput, Company } from "@shared/types.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useFormDialog } from "../../app/useFormDialog.js";
import { Badge, Button, Card, Field, Input, Modal } from "../../components/ui/primitives.js";

// ───────────────────────────── Company details ─────────────────────────────

export function CompanyDocumentSettings({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(company.email ?? "");
  const [phone, setPhone] = useState(company.phone ?? "");
  const [website, setWebsite] = useState(company.website ?? "");
  const [street, setStreet] = useState(company.street ?? "");
  const [buildingNumber, setBuildingNumber] = useState(company.buildingNumber ?? "");
  const [zip, setZip] = useState(company.zip ?? "");
  const [city, setCity] = useState(company.city ?? "");
  const [country, setCountry] = useState(company.country ?? "CH");
  const [rcNumber, setRcNumber] = useState(company.rcNumber ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  const trimmed = (v: string) => v.trim() || null;

  async function save() {
    setError(null);
    try {
      await actionBar.track(
        "Coordonnées imprimées enregistrées",
        () =>
          window.api.invoke("companies:update", {
            id: company.id,
            email: trimmed(email),
            phone: trimmed(phone),
            website: trimmed(website),
            street: trimmed(street),
            buildingNumber: trimmed(buildingNumber),
            zip: trimmed(zip),
            city: trimmed(city),
            country: country.trim().toUpperCase() || "CH",
            rcNumber: trimmed(rcNumber),
          }),
        onSaved,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-medium">Coordonnées imprimées · {company.name}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Ces informations apparaissent sur les devis, les factures et les contrats. Le logo,
        la couleur et le motif se règlent dans « Apparence PDF ».
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="E-mail de contact">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@exemple.ch" />
        </Field>
        <Field label="Téléphone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
        <Field label="Rue">
          <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rue Chautenatte" />
        </Field>
        <Field label="N°">
          <Input value={buildingNumber} onChange={(e) => setBuildingNumber(e.target.value)} className="w-20" placeholder="19" />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] gap-3">
        <Field label="NPA">
          <Input value={zip} onChange={(e) => setZip(e.target.value)} className="w-24" placeholder="2720" />
        </Field>
        <Field label="Localité">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tramelan" />
        </Field>
        <Field label="Pays">
          <Input value={country} onChange={(e) => setCountry(e.target.value)} className="w-16" />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="N° RC">
          <Input value={rcNumber} onChange={(e) => setRcNumber(e.target.value)} placeholder="CH-036-1107245-4" />
        </Field>
        <Field label="Site web">
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
        </Field>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        La rue, le numéro, le NPA et la localité sont obligatoires pour émettre une QR-facture.
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()}>Enregistrer</Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check size={14} /> Enregistré
          </span>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────── Bank accounts ─────────────────────────────

export function BankAccountSettings({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<BankAccount[]>([]);
  const actionBar = useActionBar();
  const dlg = useFormDialog<BankAccount>("compte bancaire");

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await window.api.invoke("bankAccounts:list", { companyId }));
  }, [companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  function archive(id: string) {
    const label = rows.find((r) => r.id === id)?.label ?? "";
    actionBar.defer(`Archivage du compte bancaire ${label}`, async () => {
      await window.api.invoke("bankAccounts:archive", { companyId, id });
      await load();
    });
  }

  async function makeDefault(account: BankAccount) {
    await actionBar.track(
      `« ${account.label} » est le compte par défaut`,
      () => window.api.invoke("bankAccounts:update", { companyId, id: account.id, data: { isDefault: true } }),
      load,
    );
    await load();
  }

  /** IBAN grouped by 4 characters, as on a payment slip. */
  function prettyIban(iban: string): string {
    return iban.replace(/(.{4})/g, "$1 ").trim();
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-medium">Comptes bancaires</h2>
        <Button
          onClick={() => dlg.open(null)}
        >
          <Plus size={16} /> Ajouter
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Le compte par défaut alimente la partie paiement QR des factures.
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun compte enregistré : les factures seront imprimées sans QR-facture.
        </p>
      )}

      <div className="divide-y">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-3">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {a.label}
                {a.isDefault && <Badge>Par défaut</Badge>}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{prettyIban(a.iban)}</div>
            </div>
            <div className="flex items-center gap-2">
              {!a.isDefault && (
                <Button
                  variant="ghost"
                  className="h-7 px-2"
                  title="Définir comme compte par défaut"
                  onClick={() => void makeDefault(a)}
                >
                  <Star size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-7 px-2"
                onClick={() => dlg.open(a)}
              >
                Modifier
              </Button>
              <Button
                variant="ghost"
                className="h-7 px-2 text-destructive"
                title="Archiver"
                onClick={() => void archive(a.id)}
              >
                <Archive size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal {...dlg.modalProps} title={dlg.item ? "Modifier le compte" : "Nouveau compte bancaire"}>
        {dlg.mounted && (
          <BankAccountForm
            key={dlg.key}
            companyId={companyId}
            initial={dlg.item}
            onSaved={() => {
              dlg.done();
              void load();
            }}
            onCancel={dlg.cancel}
          />
        )}
      </Modal>
    </Card>
  );
}

function BankAccountForm({
  companyId,
  initial,
  onSaved,
  onCancel,
}: {
  companyId: string;
  initial: BankAccount | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [iban, setIban] = useState(initial?.iban ?? "");
  const [holderName, setHolderName] = useState(initial?.holderName ?? "");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [bic, setBic] = useState(initial?.bic ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const actionBar = useActionBar();

  async function save() {
    setError(null);
    const data: BankAccountInput = {
      label: label.trim(),
      iban: iban.trim(),
      holderName: holderName.trim() || null,
      bankName: bankName.trim() || null,
      bic: bic.trim() || null,
      isDefault,
    };
    try {
      if (initial) {
        await actionBar.track(
          `Compte « ${data.label} » modifié`,
          () => window.api.invoke("bankAccounts:update", { companyId, id: initial.id, data }),
          onSaved,
        );
      } else await window.api.invoke("bankAccounts:create", { companyId, data });
      onSaved();
    } catch (e) {
      // The main validates the IBAN check digits: the message is passed on as is.
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Libellé">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Compte courant UBS" />
      </Field>
      <Field label="IBAN">
        <Input
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="CH39 0022 6226 1673 7740 Q"
          className="font-mono"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Un QR-IBAN génère automatiquement une référence QR sur chaque facture.
      </p>
      <Field label="Titulaire (si différent du nom de la société)">
        <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banque">
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label="BIC">
          <Input value={bic} onChange={(e) => setBic(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Utiliser comme compte par défaut
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={() => void save()} disabled={!label.trim() || !iban.trim()}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
