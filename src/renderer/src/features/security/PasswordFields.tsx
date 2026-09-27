/**
 * Password inputs of the login screens and of the settings.
 *
 * - `PasswordInput`: field with an eye button to show what was typed;
 * - `PasswordRules`: live checklist (grey until a rule is met, green while it is,
 *   red when it was met and no longer is), same rules as QSSH;
 * - `NewPassword`: new password typed twice, with the checklist and, when Windows
 *   Hello is available, the choice to also log in with it.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Circle, Eye, EyeOff, Fingerprint, X } from "lucide-react";
import {
  PASSWORD_RULES,
  PASSWORD_RULE_LABELS,
  SPECIAL_CHARACTER_EXAMPLES,
  isStrongPassword,
  passwordRules,
  type PasswordRule,
} from "@shared/password.js";
import { Input } from "../../components/ui/primitives.js";
import { cn } from "../../lib/utils.js";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete: "current-password" | "new-password";
  onEnter?: () => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        spellCheck={false}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        title={shown ? "Masquer" : "Afficher"}
        aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function PasswordRules({ password }: { password: string }) {
  const met = passwordRules(password);
  // Rules met at least once: losing one of them afterwards shows it in red.
  const reached = useRef(new Set<PasswordRule>());
  for (const rule of PASSWORD_RULES) if (met[rule]) reached.current.add(rule);

  return (
    <ul className="space-y-1 text-xs" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const state = met[rule] ? "met" : reached.current.has(rule) ? "lost" : "pending";
        const Icon = state === "met" ? Check : state === "lost" ? X : Circle;
        return (
          <li
            key={rule}
            className={cn(
              "flex items-start gap-2",
              state === "met" && "text-green-600 dark:text-green-400",
              state === "lost" && "text-destructive",
              state === "pending" && "text-muted-foreground",
            )}
          >
            <Icon
              size={state === "pending" ? 10 : 13}
              className={cn("mt-0.5 shrink-0", state === "pending" && "mx-[1.5px] mt-[3px]")}
            />
            <span>
              {PASSWORD_RULE_LABELS[rule]}
              {rule === "special" && (
                <span className="mt-1.5 grid w-max grid-cols-9 gap-1">
                  {SPECIAL_CHARACTER_EXAMPLES.map((c) => (
                    <span
                      key={c}
                      className="flex h-5 w-6 items-center justify-center rounded border border-current font-mono opacity-60"
                    >
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface NewPasswordValue {
  password: string;
  /** Strong, and typed identically twice. */
  valid: boolean;
  /** Also log in with Windows Hello (only offered when available). */
  hello: boolean;
}

/** Does this machine offer Windows Hello? (null while the answer is pending) */
export function useHelloAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void window.api.invoke("security:helloAvailable", undefined as never).then(setAvailable);
  }, []);
  return available;
}

export function NewPassword({
  onChange,
  offerHello = true,
  autoFocus,
}: {
  onChange: (value: NewPasswordValue) => void;
  offerHello?: boolean;
  autoFocus?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const helloAvailable = useHelloAvailable();
  const [hello, setHello] = useState(true);
  const withHello = offerHello && helloAvailable === true && hello;

  useEffect(() => {
    onChange({ password, valid: isStrongPassword(password) && confirm === password, hello: withHello });
    // `onChange` is a fresh closure at each render of the parent: only the values count.
  }, [password, confirm, withHello]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mot de passe</label>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" autoFocus={autoFocus} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Confirmation</label>
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {confirm && confirm !== password && (
            <p className="text-xs text-destructive">Les deux saisies ne correspondent pas.</p>
          )}
        </div>
      </div>
      <PasswordRules password={password} />
      {offerHello && helloAvailable && (
        <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={hello} onChange={(e) => setHello(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Fingerprint size={15} /> Se connecter aussi avec Windows Hello
            </span>
            <span className="text-muted-foreground">
              Visage, empreinte ou code PIN de Windows. Le mot de passe reste toujours accepté.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
