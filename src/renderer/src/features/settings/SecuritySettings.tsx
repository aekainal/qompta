/**
 * Settings > Connexion: login password and Windows Hello.
 *
 * Changing the password requires the current one (an unattended open session is
 * not enough). A forgotten password is replaced from the login screen, with the
 * recovery key only.
 */

import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { Button, Card } from "../../components/ui/primitives.js";
import {
  NewPassword,
  PasswordInput,
  useHelloAvailable,
  type NewPasswordValue,
} from "../security/PasswordFields.js";

export function SecuritySettings() {
  const helloAvailable = useHelloAvailable();
  const [helloEnrolled, setHelloEnrolled] = useState<boolean | null>(null);
  const [helloBusy, setHelloBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState<NewPasswordValue>({ password: "", valid: false, hello: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const s = await window.api.invoke("security:status", undefined as never);
    setHelloEnrolled(s.helloEnrolled);
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  function flash(text: string) {
    setMsg(text);
    setError(null);
    setTimeout(() => setMsg(null), 4000);
  }

  async function toggleHello() {
    setHelloBusy(true);
    setError(null);
    const r = await window.api.invoke(helloEnrolled ? "security:disableHello" : "security:enableHello", undefined as never);
    setHelloBusy(false);
    if (r.ok) flash(helloEnrolled ? "Windows Hello désactivé." : "Windows Hello activé.");
    else setError(r.error);
    await loadStatus();
  }

  async function changePassword() {
    setBusy(true);
    setError(null);
    const r = await window.api.invoke("security:changePassword", { current, next: next.password });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setChanging(false);
    setCurrent("");
    flash("Mot de passe changé.");
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck size={18} className="text-primary" /> Connexion
        </h2>
        <p className="text-sm text-muted-foreground">
          Personne n'ouvre Qompta sans votre mot de passe (ou Windows Hello, si vous l'activez).
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} /> Mot de passe</h3>
        <p className="text-sm text-muted-foreground">
          Demandé à chaque ouverture de Qompta. En cas d'oubli, « Mot de passe oublié ? » sur l'écran
          de connexion permet d'en choisir un nouveau avec la clé de récupération et seulement avec
          elle.
        </p>
        {changing ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mot de passe actuel</label>
              <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
            </div>
            <NewPassword onChange={setNext} offerHello={false} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChanging(false)}>Annuler</Button>
              <Button onClick={() => void changePassword()} disabled={!current || !next.valid || busy}>
                {busy ? "Enregistrement…" : "Changer le mot de passe"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setChanging(true)}>
            <KeyRound size={16} /> Changer le mot de passe…
          </Button>
        )}
      </section>

      <section className="space-y-3 border-t pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Fingerprint size={16} /> Windows Hello</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {helloAvailable === null || helloEnrolled === null
              ? "…"
              : !helloAvailable
                ? "Non disponible sur ce poste : la connexion se fait par mot de passe."
                : helloEnrolled
                  ? "Activé : visage, empreinte ou code PIN de Windows ouvrent Qompta. Le mot de passe reste accepté."
                  : "Désactivé : seul le mot de passe ouvre Qompta."}
          </p>
          {helloAvailable && helloEnrolled !== null && (
            <Button variant={helloEnrolled ? "outline" : "default"} disabled={helloBusy} onClick={() => void toggleHello()}>
              <Fingerprint size={16} />
              {helloBusy ? "En attente de Windows Hello…" : helloEnrolled ? "Désactiver" : "Activer"}
            </Button>
          )}
        </div>
      </section>

      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
