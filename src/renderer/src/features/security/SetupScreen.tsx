/**
 * Encryption setup (first launch of v1.20.0, or a new machine).
 *
 * Two paths:
 *  - « Créer ma clé »: a key is generated, the user writes it down OFF the
 *    machine (file on a USB stick, password manager, paper) and proves it by
 *    typing its last group back: a key never written down means backups that
 *    cannot be restored anywhere else;
 *  - « J'ai déjà une clé »: reinstall, new machine; the key entered must open
 *    the data present (or the backups restored afterwards).
 *
 * State "locked": encrypted data exists but the machine's key is missing or does
 * not open it: only entering the recovery key is offered.
 */

import { useEffect, useState } from "react";
import appIcon from "@resources/icon.png";
import { Check, Copy, FileDown, KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { SecurityStatus } from "@shared/ipc.js";
import { Button, Card, Input } from "../../components/ui/primitives.js";
import { WindowControls } from "../../components/WindowControls.js";
import { cn } from "../../lib/utils.js";

type Mode = "choose" | "create" | "enter";

export function SetupScreen({ status }: { status: SecurityStatus }) {
  const locked = status.state === "locked";
  const [mode, setMode] = useState<Mode>(locked ? "enter" : "choose");

  return (
    <div className="flex h-screen flex-col bg-background">
      <header
        className="app-drag flex items-center justify-between border-b bg-card pl-5"
        onDoubleClick={() => void window.api.invoke("window:toggleMaximize", undefined as never)}
      >
        <div className="flex items-center gap-2 py-2.5 text-lg font-bold">
          <img src={appIcon} alt="" className="h-7 w-7" />
          Qompta
        </div>
        <WindowControls />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-5 py-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-primary" size={28} />
            <div>
              <h1 className="text-2xl font-semibold">
                {locked ? "Déverrouillez vos données" : "Protégez vos données comptables"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Qompta chiffre toutes vos données (la base de l'application comme chaque
                sauvegarde) avec une <b>clé de récupération</b> propre à votre entreprise.
                Sans elle, personne ne peut lire vos fichiers, pas même en copiant le disque.
              </p>
            </div>
          </div>

          {status.error && (
            <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
              {status.error}
            </Card>
          )}

          {mode === "choose" && (
            <div className="grid gap-3 md:grid-cols-2">
              <ChoiceCard
                icon={<KeyRound size={20} />}
                title="Créer ma clé"
                recommended
                text={
                  status.hasLegacyData
                    ? "Première utilisation de cette version : vos données actuelles seront chiffrées avec cette nouvelle clé."
                    : "Nouvelle installation : une clé est générée pour ce poste."
                }
                onClick={() => setMode("create")}
              />
              <ChoiceCard
                icon={<Lock size={20} />}
                title="J'ai déjà une clé"
                text="Réinstallation ou nouveau poste : saisissez la clé notée lors de la première mise en place, pour relire vos sauvegardes."
                onClick={() => setMode("enter")}
              />
            </div>
          )}

          {mode === "create" && <CreateKey status={status} onBack={() => setMode("choose")} />}
          {mode === "enter" && (
            <EnterKey locked={locked} onBack={locked ? undefined : () => setMode("choose")} />
          )}

          <p className="text-xs text-muted-foreground">
            Sauvegardes automatiques chiffrées à chaque lancement, dans{" "}
            <span className="font-mono">{status.defaultBackupDir}</span>, conservées 7 jours
            (dossier et durée modifiables dans Réglages).
            {!status.keyProtected &&
              " Attention : ce système n'offre pas de coffre sécurisé, la clé est conservée sur le poste sans protection supplémentaire."}
          </p>
        </div>
      </main>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  text,
  recommended,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-accent/40",
        recommended && "border-primary/60",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
        {recommended && (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Recommandé</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </button>
  );
}

async function activate(recoveryKey: string): Promise<string | null> {
  const r = await window.api.invoke("security:activate", { recoveryKey });
  if (!r.ok) return r.error;
  window.location.reload();
  return null;
}

function CreateKey({ status, onBack }: { status: SecurityStatus; onBack: () => void }) {
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.invoke("security:newKey", undefined as never).then((r) => setKey(r.recoveryKey));
  }, []);

  const lastGroup = key.split("-").pop() ?? "";
  const confirmed = confirm.trim().toUpperCase() === lastGroup;

  async function copy() {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveFile() {
    const r = await window.api.invoke("security:saveKeyFile", { recoveryKey: key });
    if (r.saved && r.path) setSavedTo(r.path);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const err = await activate(key);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-medium">1. Votre clé de récupération</h2>
        <p className="text-sm text-muted-foreground">
          Notez-la <b>hors de ce poste</b> : fichier sur une clé USB, gestionnaire de mots de
          passe, ou papier rangé en lieu sûr. Elle sera demandée pour restaurer une sauvegarde
          sur un autre ordinateur. Qompta ne peut pas la retrouver pour vous.
        </p>
      </div>
      <div className="rounded-lg border bg-muted/40 p-4 text-center font-mono text-lg font-semibold tracking-wider break-all">
        {key || "…"}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copy()} disabled={!key}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiée" : "Copier"}
        </Button>
        <Button variant="outline" onClick={() => void saveFile()} disabled={!key}>
          <FileDown size={16} /> Enregistrer dans un fichier…
        </Button>
      </div>
      {savedTo && (
        <p className="text-xs text-green-700 dark:text-green-400">
          Clé enregistrée dans {savedTo}. Si ce fichier est sur ce poste, copiez-le aussi ailleurs.
        </p>
      )}

      <div className="space-y-2 border-t pt-4">
        <h2 className="font-medium">2. Confirmez que vous l'avez conservée</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={stored} onChange={(e) => setStored(e.target.checked)} />
          J'ai conservé ma clé de récupération hors de cet ordinateur.
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Recopiez son dernier groupe :</span>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-28 font-mono uppercase"
            maxLength={4}
            placeholder="····"
          />
          {confirmed && <Check size={16} className="text-green-600" />}
        </div>
      </div>

      {status.hasLegacyData && (
        <p className="text-xs text-muted-foreground">
          Vos données actuelles vont être chiffrées ; l'ancien fichier en clair sera supprimé
          une fois le fichier chiffré vérifié.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>Retour</Button>
        <Button onClick={() => void finish()} disabled={!key || !stored || !confirmed || busy}>
          <ShieldCheck size={16} /> {busy ? "Chiffrement…" : "Activer le chiffrement"}
        </Button>
      </div>
    </Card>
  );
}

function EnterKey({ locked, onBack }: { locked: boolean; onBack?: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState(0);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await activate(key);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function reset() {
    if (resetStep === 0) {
      setResetStep(1);
      return;
    }
    await window.api.invoke("security:resetData", undefined as never);
    window.location.reload();
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-medium">Clé de récupération</h2>
        <p className="text-sm text-muted-foreground">
          Elle commence par <span className="font-mono">QK1-</span> et compte 13 groupes de
          4 caractères. Majuscules, espaces et tirets sont facultatifs.
        </p>
      </div>
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && key.trim() && void submit()}
        className="font-mono"
        placeholder="QK1-XXXX-XXXX-…"
        autoFocus
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between">
        {onBack ? <Button variant="ghost" onClick={onBack}>Retour</Button> : <span />}
        <Button onClick={() => void submit()} disabled={!key.trim() || busy}>
          <Lock size={16} /> {busy ? "Ouverture…" : locked ? "Déverrouiller" : "Utiliser cette clé"}
        </Button>
      </div>
      {locked && (
        <div className="border-t pt-3 text-xs text-muted-foreground">
          {resetStep === 0 ? (
            <button className="underline" onClick={() => void reset()}>
              Clé perdue ? Repartir de zéro…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-destructive">
                Sans la clé, les données chiffrées de ce poste sont illisibles. Elles seront mises
                de côté (renommées, pas supprimées) et Qompta repartira vide : vous pourrez
                restaurer une sauvegarde dont vous avez la clé.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-8" onClick={() => setResetStep(0)}>Annuler</Button>
                <Button className="h-8 bg-destructive text-destructive-foreground" onClick={() => void reset()}>
                  Mettre les données de côté et repartir de zéro
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
