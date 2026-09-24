/**
 * Minimal UI primitives (shadcn/ui style) sufficient for the M1 shell.
 * The full shadcn components will be added as the modules come.
 */

import { type ButtonHTMLAttributes, type HTMLAttributes, forwardRef, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" }
>(({ className, variant = "default", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50",
      variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
      variant === "outline" && "border border-input bg-background hover:bg-accent",
      variant === "ghost" && "hover:bg-accent",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Centred modal with a dimmed backdrop.
 *
 * `keepMounted`: the closed modal keeps its content mounted (hidden) — that is what
 * allows an abandoned entry to be resumed with "Reprendre" without losing anything
 * (see `useFormDialog`). `onDirty` reports the first change of the content:
 * typing, a choice in a list, or a click on a button other than "Annuler".
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  keepMounted,
  onDirty,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  keepMounted?: boolean;
  onDirty?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open && !keepMounted) return null;

  function markClick(e: React.MouseEvent) {
    const button = (e.target as HTMLElement).closest("button");
    if (button && !button.dataset.modalClose && button.textContent?.trim() !== "Annuler") onDirty?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-6"
      style={open ? undefined : { display: "none" }}
      aria-hidden={!open}
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "mt-8 w-full rounded-xl border bg-card p-6 shadow-xl",
          // "wide" serves the table forms (quotes, invoices): below 5xl, the Type
          // and Description columns become unreadable.
          wide ? "max-w-5xl" : "max-w-lg",
        )}
        onMouseDown={(e) => e.stopPropagation()}
        onInputCapture={() => onDirty?.()}
        onChangeCapture={() => onDirty?.()}
        onClickCapture={markClick}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Fermer" data-modal-close="1">
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
