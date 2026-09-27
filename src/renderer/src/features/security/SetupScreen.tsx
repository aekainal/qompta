/**
 * Everything shown before the data opens: setup, login, migration, recovery.
 *
 * - « setup » (first launch, new machine): the key is created or typed in, then a
 *   login password is chosen:
 *     · « Créer ma clé »: a key is generated, the user writes it down OFF the
 *       machine (file on a USB stick, password manager, paper) and proves it by
 *       typing its last group back: a key never written down means backups that
 *       cannot be restored anywhere else, and a forgotten password for good;
 *     · « J'ai déjà une clé »: reinstall, new machine;
 * - « locked » (every launch): password, or Windows Hello when enabled (offered
 *   straight away). « Mot de passe oublié ? » only accepts the recovery key, then
 *   a new password: there is no other way to reset it;
 * - « set-password » (first launch of v1.21 over a v1.20 key): a password is chosen
 *   once, the key of the machine is then wrapped by it;
 * - « recover »: encrypted data but no usable keyring: recovery key + new password,
 *   or start over from scratch.
 */

import { useEffect, useRef, useState } from "react";
import appIcon from "@resources/icon.png";
import { Check, Copy, FileDown, Fingerprint, KeyRound, Lock, LogIn, ShieldCheck } from "lucide-react";
import type { SecurityResult, SecurityStatus } from "@shared/ipc.js";
import { Button, Card, Input } from "../../components/ui/primitives.js";
import { WindowControls } from "../../components/WindowControls.js";
import { cn } from "../../lib/utils.js";
import { NewPassword, PasswordInput, type NewPasswordValue } from "./PasswordFields.js";

type Mode = "choose" | "create" | "enter";

const NO_PASSWORD: NewPasswordValue = { password: "", valid: false, hello: false };

export function SetupScreen({ status }: { status: SecurityStatus }) {
  const [forgot, setForgot] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");

  let title: string;
  let intro: React.ReactNode;
  let body: React.ReactNode;

  if (status.state === "locked" && !forgot) {
    title = "Connexion";
    intro = "Vos données comptables sont chiffrées : connectez-vous pour les ouvrir.";
    body = <Login helloEnrolled={status.helloEnrolled} onForgot={() => setForgot(true)} />;
  } else if (status.state === "locked") {
    title = "Mot de passe oublié";
    intro = (
      <>
        Seule votre <b>clé de récupération</b> permet de choisir un nouveau mot de passe.
        Vos données ne changent pas.
      </>
    );
    body = <EnterKey purpose="forgot" onBack={() => setForgot(false)} />;
  } else if (status.state === "set-password") {
    title = "Choisissez un mot de passe de connexion";
    intro = (
      <>
        Vos données sont chiffrées, mais jusqu'ici Qompta s'ouvrait sans rien demander. Désormais,
        un mot de passe est exigé à chaque ouverture. Votre clé de récupération reste la même.
      </>
    );
    body = <SetPassword />;
  } else if (status.state === "recover") {
    title = "Déverrouillez vos données";
    intro = "La clé de ce poste est introuvable ou illisible : saisissez votre clé de récupération.";
    body = <EnterKey purpose="recover" />;
  } else {
    title = "Protégez vos données comptables";
    intro = (
      <>
        Qompta chiffre toutes vos données (la base de l'application comme chaque sauvegarde) avec une{" "}
        <b>clé de récupération</b> propre à votre entreprise et les protège par un{" "}
        <b>mot de passe de connexion</b>. Sans eux, personne ne peut lire vos fichiers, pas même en
        copiant le disque.
      </>
    );
    body = (
      <>
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
        {mode === "enter" && <EnterKey purpose="new" onBack={() => setMode("choose")} />}
      </>
    );
  }

  const compact = status.state === "locked" && !forgot;

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
        <div className={cn("mx-auto space-y-5 py-6", compact ? "max-w-md" : "max-w-2xl")}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-primary" size={28} />
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
            </div>
          </div>

          {status.error && (
            <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
              {status.error}
            </Card>
          )}

          {body}

          {!compact && (
            <p className="text-xs text-muted-foreground">
              Sauvegardes automatiques chiffrées à chaque lancement, dans{" "}
              <span className="font-mono">{status.defaultBackupDir}</span>, conservées 7 jours
              (dossier et durée modifiables dans Réglages).
              {!status.keyProtected &&
                " Ce système n'offre pas de coffre sécurisé : seul le mot de passe protège la clé conservée sur le poste."}
            </p>
          )}
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

/**
 * Once the data is open: enables Windows Hello if it was chosen, then reloads
 * into the app. A failed Hello (canceled prompt) does not block: it can be
 * enabled later in Réglages.
 */
function useOpening() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helloFailed, setHelloFailed] = useState<string | null>(null);

  async function run(action: () => Promise<SecurityResult>, hello: boolean) {
    setBusy(true);
    setError(null);
    const r = await action();
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    if (hello) {
      const h = await window.api.invoke("security:enableHello", undefined as never);
      if (!h.ok) {
        setHelloFailed(h.error);
        setBusy(false);
        return;
      }
    }
    window.location.reload();
  }

  const helloNotice = helloFailed && (
    <Card className="space-y-3 border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
      <p>
        {helloFailed} Le mot de passe est enregistré ; Windows Hello pourra être activé plus tard dans
        Réglages.
      </p>
      <Button onClick={() => window.location.reload()}>Continuer</Button>
    </Card>
  );

  return { busy, error, run, helloNotice };
}

function Login({ helloEnrolled, onForgot }: { helloEnrolled: boolean; onForgot: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Windows Hello waits for the user; the password stays usable meanwhile.
  const [helloBusy, setHelloBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helloTried = useRef(false);
  const done = useRef(false);

  function finish(r: SecurityResult) {
    if (done.current) return;
    if (r.ok) {
      done.current = true;
      window.location.reload();
    } else setError(r.error);
  }

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const r = await window.api.invoke("security:unlock", { password });
    setBusy(false);
    finish(r);
  }

  async function hello() {
    setHelloBusy(true);
    setError(null);
    const r = await window.api.invoke("security:unlockHello", undefined as never);
    setHelloBusy(false);
    finish(r);
  }

  // Windows Hello is offered straight away: that is the point of enabling it.
  useEffect(() => {
    if (helloEnrolled && !helloTried.current) {
      helloTried.current = true;
      void hello();
    }
  });

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Mot de passe</label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          onEnter={() => void submit()}
          autoFocus={!helloEnrolled}
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={() => void submit()} disabled={!password || busy}>
        <LogIn size={16} /> {busy ? "Vérification…" : "Se connecter"}
      </Button>
      {helloEnrolled && (
        <Button variant="outline" className="w-full" onClick={() => void hello()} disabled={busy || helloBusy}>
          <Fingerprint size={16} /> {helloBusy ? "En attente de Windows Hello…" : "Windows Hello"}
        </Button>
      )}
      <div className="text-center">
        <button type="button" className="text-xs text-primary hover:underline" onClick={onForgot}>
          Mot de passe oublié ?
        </button>
      </div>
    </Card>
  );
}

function SetPassword() {
  const [pw, setPw] = useState<NewPasswordValue>(NO_PASSWORD);
  const { busy, error, run, helloNotice } = useOpening();

  if (helloNotice) return helloNotice;
  return (
    <Card className="space-y-4 p-5">
      <NewPassword onChange={setPw} autoFocus />
      <p className="text-xs text-muted-foreground">
        En cas d'oubli, seule la clé de récupération (<span className="font-mono">QK1-…</span>) permet
        d'en choisir un nouveau. Vérifiez que vous l'avez notée : Réglages, « Clé de récupération ».
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button
          onClick={() => void run(() => window.api.invoke("security:setPassword", { password: pw.password }), pw.hello)}
          disabled={!pw.valid || busy}
        >
          <Lock size={16} /> {busy ? "Protection…" : "Protéger mes données"}
        </Button>
      </div>
    </Card>
  );
}

function CreateKey({ status, onBack }: { status: SecurityStatus; onBack: () => void }) {
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [stored, setStored] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState<NewPasswordValue>(NO_PASSWORD);
  const { busy, error, run, helloNotice } = useOpening();

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

  if (helloNotice) return helloNotice;
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-medium">1. Votre clé de récupération</h2>
        <p className="text-sm text-muted-foreground">
          Notez-la <b>hors de ce poste</b> : fichier sur une clé USB, gestionnaire de mots de
          passe ou papier rangé en lieu sûr. Elle sera demandée pour restaurer une sauvegarde
          sur un autre ordinateur ou si vous oubliez votre mot de passe. Qompta ne peut pas la
          retrouver pour vous.
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

      <div className="space-y-3 border-t pt-4">
        <h2 className="font-medium">3. Choisissez votre mot de passe de connexion</h2>
        <NewPassword onChange={setPw} />
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
        <Button
          onClick={() =>
            void run(() => window.api.invoke("security:activate", { recoveryKey: key, password: pw.password }), pw.hello)
          }
          disabled={!key || !stored || !confirmed || !pw.valid || busy}
        >
          <ShieldCheck size={16} /> {busy ? "Chiffrement…" : "Activer le chiffrement"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Recovery key typed in, with a new login password:
 * - new: reinstall or new machine;
 * - forgot: forgotten password (the only way to reset it);
 * - recover: key of the machine lost or unreadable, with the option to start over.
 */
function EnterKey({ purpose, onBack }: { purpose: "new" | "forgot" | "recover"; onBack?: () => void }) {
  const [key, setKey] = useState("");
  const [pw, setPw] = useState<NewPasswordValue>(NO_PASSWORD);
  const [resetStep, setResetStep] = useState(0);
  const { busy, error, run, helloNotice } = useOpening();

  function submit() {
    if (!key.trim() || !pw.valid || busy) return;
    void run(() => window.api.invoke("security:activate", { recoveryKey: key, password: pw.password }), pw.hello);
  }

  async function reset() {
    if (resetStep === 0) {
      setResetStep(1);
      return;
    }
    await window.api.invoke("security:resetData", undefined as never);
    window.location.reload();
  }

  if (helloNotice) return helloNotice;
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
        className="font-mono"
        placeholder="QK1-XXXX-XXXX-…"
        spellCheck={false}
        autoFocus
      />
      <div className="space-y-3 border-t pt-4">
        <h2 className="font-medium">{purpose === "forgot" ? "Nouveau mot de passe" : "Mot de passe de connexion"}</h2>
        {/* After a forgotten password, an existing Windows Hello stays as it was. */}
        <NewPassword onChange={setPw} offerHello={purpose !== "forgot"} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between">
        {onBack ? <Button variant="ghost" onClick={onBack}>Retour</Button> : <span />}
        <Button onClick={submit} disabled={!key.trim() || !pw.valid || busy}>
          <Lock size={16} />{" "}
          {busy
            ? "Ouverture…"
            : purpose === "forgot"
              ? "Changer le mot de passe"
              : purpose === "recover"
                ? "Déverrouiller"
                : "Utiliser cette clé"}
        </Button>
      </div>
      {purpose === "recover" && (
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
