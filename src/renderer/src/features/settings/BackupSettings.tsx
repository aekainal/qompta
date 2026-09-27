/**
 * Settings > Backups & security.
 *
 * - Automatic backups: folder (editable), retention (7 days by default),
 *   list of the backups present with direct restore.
 * - Manual backups and exports: everything is encrypted (.qbak, .qexp).
 * - Recovery key: view it again (login password required), store it again
 *   outside the machine.
 *
 * A file coming from another machine (another key) prompts for ITS recovery
 * key, then the operation resumes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Database,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  HardDriveDownload,
  KeyRound,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import type { BackupConfig, BackupEntry } from "@shared/backups.js";
import type { NeedsKey } from "@shared/ipc.js";
import { useActionBar } from "../../app/ActionBarContext.js";
import { useCompany } from "../../app/CompanyContext.js";
import { Button, Card, Field, Input, Modal } from "../../components/ui/primitives.js";
import { PasswordInput } from "../security/PasswordFields.js";

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("fr-CH", { dateStyle: "medium", timeStyle: "short" });
}

type Pending =
  | { kind: "restore"; path: string; message: string }
  | { kind: "import"; path: string; message: string };

export function BackupSettings() {
  const { active, reload } = useCompany();
  const actionBar = useActionBar();
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [list, setList] = useState<BackupEntry[]>([]);
  const [retention, setRetention] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);
  const [keyPassword, setKeyPassword] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      window.api.invoke("backup:config", undefined as never),
      window.api.invoke("backup:list", undefined as never),
    ]);
    setConfig(c);
    setRetention(String(c.retentionDays));
    setList(l);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function reveal() {
    if (!keyPassword) return;
    setKeyError(null);
    const r = await window.api.invoke("security:revealKey", { password: keyPassword });
    if (!r.ok) {
      setKeyError(r.error);
      return;
    }
    setRevealed(r.recoveryKey);
    setAskPassword(false);
    setKeyPassword("");
  }

  /** Changes a setting while offering to go back to the previous one. */
  function changeConfig(patch: { dir?: string | null; retentionDays?: number }, label: string) {
    if (!config) return;
    const previous = { dir: config.dir === config.defaultDir ? null : config.dir, retentionDays: config.retentionDays };
    void run(async () => {
      await window.api.invoke("backup:setConfig", patch);
      await load();
      actionBar.undoable(label, async () => {
        await window.api.invoke("backup:setConfig", previous);
        await load();
      });
    });
  }

  async function chooseDir() {
    const r = await window.api.invoke("backup:chooseDir", undefined as never);
    if ("dir" in r) changeConfig({ dir: r.dir }, "Dossier des sauvegardes modifié");
  }

  function saveRetention() {
    const days = Number.parseInt(retention, 10);
    if (!Number.isFinite(days) || days < 1) {
      setError("La rétention doit être d'au moins 1 jour.");
      return;
    }
    changeConfig({ retentionDays: days }, `Rétention réglée sur ${days} jour(s)`);
  }

  function handleNeedsKey(r: NeedsKey, kind: Pending["kind"]) {
    setRecoveryKey("");
    setPending({ kind, path: r.path, message: r.message });
  }

  async function restore(path: string | null, key?: string) {
    await run(async () => {
      const r = await window.api.invoke("backup:restore", { path, recoveryKey: key ?? null });
      if ("needsKey" in r) handleNeedsKey(r, "restore");
      else setPending(null);
    });
  }

  async function importCompanies(path: string | null, key?: string) {
    await run(async () => {
      const r = await window.api.invoke("backup:importCompanies", { path, recoveryKey: key ?? null });
      if ("needsKey" in r) return handleNeedsKey(r, "import");
      setPending(null);
      if ("canceled" in r) return;
      flash(`${r.imported} société(s) importée(s) : ${r.names.join(", ")}`);
      await reload();
    });
  }

  if (!config) return null;

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="text-lg font-medium">Sauvegardes & sécurité</h2>
        <p className="text-sm text-muted-foreground">
          Toutes les données et toutes les sauvegardes sont chiffrées avec votre clé de
          récupération. Données 100 % locales.
        </p>
      </div>
      {msg && <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">{msg}</div>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Automatic backups */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Sauvegarde automatique à chaque lancement</h3>
        <Field label="Dossier des sauvegardes">
          <div className="flex flex-wrap gap-2">
            <Input value={config.dir} readOnly className="min-w-[280px] flex-1 font-mono text-xs" />
            <Button variant="outline" onClick={() => void chooseDir()}>
              <FolderOpen size={16} /> Choisir…
            </Button>
            <Button variant="outline" onClick={() => void window.api.invoke("backup:openDir", undefined as never)}>
              Ouvrir
            </Button>
            {config.dir !== config.defaultDir && (
              <Button variant="ghost" onClick={() => changeConfig({ dir: null }, "Dossier par défaut rétabli")}>
                Par défaut
              </Button>
            )}
          </div>
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Conservation (jours)">
            <Input
              value={retention}
              onChange={(e) => setRetention(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="w-28"
            />
          </Field>
          <Button variant="outline" onClick={saveRetention} disabled={retention === String(config.retentionDays)}>
            Enregistrer
          </Button>
          <p className="pb-2 text-xs text-muted-foreground">
            Les sauvegardes automatiques plus anciennes sont supprimées (la plus récente est toujours gardée).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button
            onClick={() =>
              void run(async () => {
                const r = await window.api.invoke("backup:runNow", undefined as never);
                flash(`Sauvegarde créée : ${r.file}`);
                await load();
              })
            }
          >
            <Save size={16} /> Sauvegarder maintenant
          </Button>
          <span className="text-muted-foreground">
            {config.last ? `Dernière : ${when(config.last.at)} (${size(config.last.size)})` : "Aucune sauvegarde encore."}
          </span>
          {config.lastError && <span className="text-destructive">Dernier échec : {config.lastError}</span>}
        </div>

        <div className="max-h-56 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Sauvegarde</th>
                <th className="px-3 py-2 text-right">Taille</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Aucune sauvegarde dans ce dossier.</td></tr>
              )}
              {list.map((b) => (
                <tr key={b.file} className="border-t">
                  <td className="px-3 py-1.5">
                    {when(b.at)} <span className="font-mono text-xs text-muted-foreground">{b.file}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{size(b.size)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void restore(b.path)}>
                      <RotateCcw size={14} /> Restaurer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual */}
      <section className="space-y-3 border-t pt-5">
        <h3 className="text-sm font-semibold">Sauvegardes et exports manuels (chiffrés)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                const r = await window.api.invoke("backup:saveAs", undefined as never);
                if (r.saved) flash("Sauvegarde complète enregistrée.");
              })
            }
          >
            <Database size={16} /> Sauvegarde complète (.qbak)
          </Button>
          <Button variant="outline" onClick={() => void restore(null)}>
            <Upload size={16} /> Restaurer une sauvegarde…
          </Button>
          <Button
            variant="outline"
            disabled={!active}
            onClick={() =>
              void run(async () => {
                const r = await window.api.invoke("backup:exportCompanies", { scope: "company", companyId: active?.id });
                if (r.saved) flash("Export de la société enregistré.");
              })
            }
          >
            <FileJson size={16} /> Exporter cette société (.qexp)
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                const r = await window.api.invoke("backup:exportCompanies", { scope: "all" });
                if (r.saved) flash("Export de toutes les sociétés enregistré.");
              })
            }
          >
            <FileJson size={16} /> Exporter toutes les sociétés (.qexp)
          </Button>
          <Button variant="outline" onClick={() => void importCompanies(null)}>
            <Download size={16} /> Importer un export…
          </Button>
          <Button
            variant="outline"
            disabled={!active}
            onClick={() =>
              void run(async () => {
                const r = await window.api.invoke("backup:exportExcel", { companyId: active!.id });
                if (r.saved) flash("Export Excel enregistré.");
              })
            }
          >
            <FileSpreadsheet size={16} /> Export Excel (société, non chiffré)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          La restauration remplace toutes les données (après une sauvegarde « avant-restauration »
          automatique) ; l'import ajoute des sociétés comme nouvelles entités. Les anciennes
          sauvegardes <span className="font-mono">.sqlite</span> et exports <span className="font-mono">.json</span> restent acceptés.
        </p>
      </section>

      {/* Key */}
      <section className="space-y-3 border-t pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} /> Clé de récupération</h3>
        <p className="text-sm text-muted-foreground">
          Elle est demandée pour restaurer une sauvegarde sur un autre poste, après une
          réinstallation de Windows ou pour remplacer un mot de passe oublié. Gardez-en une copie
          hors de cet ordinateur. L'afficher demande le mot de passe de connexion.
        </p>
        {revealed ? (
          <div className="space-y-2">
            <div className="rounded-lg border bg-muted/40 p-3 text-center font-mono font-semibold tracking-wider break-all">{revealed}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard.writeText(revealed).then(() => flash("Clé copiée."))}>
                <Copy size={16} /> Copier
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const r = await window.api.invoke("security:saveKeyFile", { recoveryKey: revealed });
                    if (r.saved) flash(`Clé enregistrée dans ${r.path}.`);
                  })
                }
              >
                <HardDriveDownload size={16} /> Enregistrer dans un fichier…
              </Button>
              <Button variant="ghost" onClick={() => setRevealed(null)}>Masquer</Button>
            </div>
          </div>
        ) : askPassword ? (
          // The key reopens everything, even without the password: it is shown to the password only.
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <PasswordInput
                value={keyPassword}
                onChange={setKeyPassword}
                onEnter={() => void reveal()}
                placeholder="Mot de passe de connexion"
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <Button onClick={() => void reveal()} disabled={!keyPassword}>
              <Eye size={16} /> Afficher
            </Button>
            <Button variant="ghost" onClick={() => { setAskPassword(false); setKeyPassword(""); setKeyError(null); }}>Annuler</Button>
            {keyError && <p className="w-full text-sm text-destructive">{keyError}</p>}
          </div>
        ) : (
          <Button variant="outline" onClick={() => setAskPassword(true)}>
            <Eye size={16} /> Afficher ma clé
          </Button>
        )}
      </section>

      <Modal open={pending !== null} onClose={() => setPending(null)} title="Clé de récupération requise">
        {pending && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{pending.message}</p>
            <Input
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              className="font-mono"
              placeholder="QK1-XXXX-XXXX-…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)}>Annuler</Button>
              <Button
                disabled={!recoveryKey.trim()}
                onClick={() =>
                  void (pending.kind === "restore"
                    ? restore(pending.path, recoveryKey)
                    : importCompanies(pending.path, recoveryKey))
                }
              >
                Ouvrir le fichier
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
