/**
 * Settings: VAT parameters per company, login (password, Windows Hello),
 * encrypted backups, recovery key.
 */

import { useCallback, useEffect, useState } from "react";
import type { CompanyVatSettings } from "@shared/types.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Card, Field, Select } from "../../components/ui/primitives.js";
import { BankAccountSettings, CompanyDocumentSettings } from "./DocumentSettings.js";
import { BackupSettings } from "./BackupSettings.js";
import { SecuritySettings } from "./SecuritySettings.js";

export function SettingsPage() {
  const { active, reload } = useCompany();
  const companyId = active?.id ?? "";
  const [vat, setVat] = useState<CompanyVatSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const actionBar = useActionBar();

  const load = useCallback(async () => {
    if (!companyId) return;
    setVat(await window.api.invoke("vatSettings:get", { companyId }));
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  if (!active) return <p className="text-sm text-muted-foreground">Sélectionnez une société.</p>;

  async function saveVat() {
    if (!vat) return;
    await actionBar.track("Réglages TVA enregistrés", () => window.api.invoke("vatSettings:update", vat), load);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Réglages</h1>

      {/* Header of the quotes, invoices and contracts */}
      <CompanyDocumentSettings company={active} onSaved={() => void reload()} />

      {/* Bank accounts of the QR-bill */}
      <BankAccountSettings companyId={companyId} />

      {/* VAT settings */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-medium">Réglages TVA · {active.name}</h2>
        <p className="mb-4 text-sm text-muted-foreground">Pilotent la périodicité du décompte et la base de classement.</p>
        {vat && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Assujettie à la TVA">
                <Select value={vat.isVatSubject ? "yes" : "no"} onChange={(e) => setVat({ ...vat, isVatSubject: e.target.value === "yes" })} className="w-full">
                  <option value="yes">Oui</option>
                  <option value="no">Non (module TVA masqué)</option>
                </Select>
              </Field>
              <Field label="Périodicité du décompte">
                <Select value={vat.periodType} onChange={(e) => setVat({ ...vat, periodType: e.target.value as CompanyVatSettings["periodType"] })} className="w-full">
                  <option value="quarterly">Trimestrielle</option>
                  <option value="semestrial">Semestrielle</option>
                  <option value="annual">Annuelle</option>
                </Select>
              </Field>
              <Field label="Méthode de décompte">
                <Select value={vat.method} onChange={(e) => setVat({ ...vat, method: e.target.value as CompanyVatSettings["method"] })} className="w-full">
                  <option value="effective">Effective</option>
                  <option value="tdfn">Taux de la dette fiscale nette (TDFN)</option>
                </Select>
              </Field>
              <Field label="Base de classement">
                <Select value={vat.accountingBasis} onChange={(e) => setVat({ ...vat, accountingBasis: e.target.value as CompanyVatSettings["accountingBasis"] })} className="w-full">
                  <option value="agreed">Convenu (date de facture)</option>
                  <option value="received">Reçu (date de paiement)</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => void saveVat()}>Enregistrer</Button>
              {saved && <span className="text-sm text-green-600 dark:text-green-400">Enregistré ✓</span>}
            </div>
          </>
        )}
      </Card>

      {/* Login password, Windows Hello */}
      <SecuritySettings />

      {/* Backups, restore, encryption key */}
      <BackupSettings />
    </div>
  );
}
