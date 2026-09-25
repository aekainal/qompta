/**
 * Action bar at the bottom of the screen, replacing the blocking `confirm()`.
 *
 * Principle: the action is not confirmed, it is **deferred** or **reversible**.
 * The user is never blocked and keeps control for a few seconds.
 *
 * Uses:
 *  - `defer(label, run)`       : deletion, archiving, conversion… fire after
 *                                5 s; "Annuler" drops them, the cross applies them;
 *  - `undoable(label, undo)`   : the action is already done, "Annuler" runs `undo`;
 *  - `track(label, run)`       : runs a change AND offers to undo it; the main
 *                                undoes exactly what it wrote (undo journal,
 *                                see `src/main/undo.ts`);
 *  - `restore(label, reopen)`  : an entry has just been abandoned (Annuler, click
 *                                outside, Esc): "Reprendre" reopens it intact;
 *  - `notify(label)`           : plain information, without a button.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "../components/ui/primitives.js";
import { cn } from "../lib/utils.js";

/** Delay before the deferred action is applied. */
export const DELAY_MS = 5000;
/** An abandoned entry stays recoverable longer: it takes time to notice it. */
export const RESTORE_MS = 15000;

type Kind = "defer" | "undo" | "notify" | "error";

interface Entry {
  id: number;
  label: string;
  kind: Kind;
  durationMs: number;
  /** Text of the action button ("Annuler" by default). */
  actionLabel?: string;
  /** Called when the delay elapses (or on manual close) for `defer`. */
  run?: () => void | Promise<void>;
  /** Rollback offered by `undoable` / `restore`. */
  undo?: () => void | Promise<void>;
  /** Called when the bar disappears without "Annuler" having been chosen. */
  onExpire?: () => void;
}

interface ActionBarApi {
  /** Defers `run` by 5 s; "Annuler" drops it. */
  defer: (label: string, run: () => void | Promise<void>) => void;
  /** The action is already applied; "Annuler" runs `undo`. */
  undoable: (label: string, undo: () => void | Promise<void>) => void;
  /**
   * Runs a change then offers to undo it. `after` is called back once the undo
   * is done (reloading the displayed list, typically).
   */
  track: <T>(label: string, run: () => Promise<T>, after?: () => void | Promise<void>) => Promise<T>;
  /** Abandoned entry: "Reprendre" calls `reopen`; `discard` if the bar expires. */
  restore: (label: string, reopen: () => void, discard: () => void) => void;
  /** Transient information, without any action. */
  notify: (label: string) => void;
}

const Ctx = createContext<ActionBarApi | null>(null);

export function useActionBar(): ActionBarApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActionBar hors de <ActionBarProvider>");
  return ctx;
}

let seq = 0;

export function ActionBarProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  // The timers live outside the render: a re-render must not restart the countdown.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // `push` arms a timer that will call `commit`, which may in turn push an
  // error bar: the ref breaks the definition cycle.
  const commitRef = useRef<(entry: Entry) => void>(() => {});
  const expireRef = useRef<(entry: Entry) => void>(() => {});

  const push = useCallback(
    (entry: Omit<Entry, "id" | "durationMs"> & { durationMs?: number }) => {
      seq += 1;
      const full: Entry = { durationMs: DELAY_MS, ...entry, id: seq };
      setEntries((prev) => [...prev, full]);
      timers.current.set(
        full.id,
        setTimeout(
          () => (full.kind === "defer" ? commitRef.current(full) : expireRef.current(full)),
          full.durationMs,
        ),
      );
    },
    [],
  );

  /** Applies the deferred action (delay elapsed or manual close). */
  const commit = useCallback(
    (entry: Entry) => {
      dismiss(entry.id);
      void Promise.resolve(entry.run?.()).catch((err: unknown) => {
        push({ label: err instanceof Error ? err.message : "L'action a échoué.", kind: "error" });
      });
    },
    [dismiss, push],
  );
  commitRef.current = commit;

  /** The bar disappears without any rollback. */
  const expire = useCallback(
    (entry: Entry) => {
      dismiss(entry.id);
      entry.onExpire?.();
    },
    [dismiss],
  );
  expireRef.current = expire;

  // Running timers must not outlive the unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const api = useMemo<ActionBarApi>(
    () => ({
      defer: (label, run) => push({ label, kind: "defer", run }),
      undoable: (label, undo) => push({ label, kind: "undo", undo }),
      notify: (label) => push({ label, kind: "notify" }),
      restore: (label, reopen, discard) =>
        push({
          label,
          kind: "undo",
          actionLabel: "Reprendre",
          durationMs: RESTORE_MS,
          undo: reopen,
          onExpire: discard,
        }),
      track: async (label, run, after) => {
        const { seq: from } = await window.api.invoke("undo:checkpoint", undefined as never);
        const result = await run();
        const { seq: to } = await window.api.invoke("undo:checkpoint", undefined as never);
        // Nothing was written (same value saved again…): nothing to undo.
        if (to > from) {
          push({
            label,
            kind: "undo",
            undo: async () => {
              await window.api.invoke("undo:revert", { from, to });
              await after?.();
            },
          });
        }
        return result;
      },
    }),
    [push],
  );

  function cancel(entry: Entry) {
    dismiss(entry.id);
    if (entry.kind === "undo") {
      void Promise.resolve(entry.undo?.()).catch((err: unknown) => {
        push({
          label: err instanceof Error ? err.message : "Le retour arrière a échoué.",
          kind: "error",
        });
      });
    }
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {entries.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              role="status"
              className={cn(
                "pointer-events-auto w-2/3 max-w-[1000px] overflow-hidden rounded-lg border shadow-lg",
                entry.kind === "error" ? "bg-destructive text-destructive-foreground" : "bg-card",
              )}
            >
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.label}</span>
                {entry.kind !== "notify" && entry.kind !== "error" && (
                  <Button variant="outline" className="h-8 shrink-0" onClick={() => cancel(entry)}>
                    {entry.actionLabel ?? "Annuler"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-8 shrink-0 px-2"
                  onClick={() => (entry.kind === "defer" ? commit(entry) : expire(entry))}
                  aria-label="Fermer"
                  title={
                    entry.kind === "defer"
                      ? "Fermer et appliquer tout de suite"
                      : "Fermer"
                  }
                >
                  <X size={16} />
                </Button>
              </div>
              {/* Countdown stuck under the bar: the delay runs out in plain sight. */}
              <div className="h-1 w-full bg-muted">
                <div
                  className="action-countdown h-full bg-primary"
                  style={{ animationDuration: `${entry.durationMs}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
