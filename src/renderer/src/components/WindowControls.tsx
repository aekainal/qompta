/**
 * Window control buttons (frameless mode): minimize, maximize/restore, close.
 * Styled within the app for a native and consistent look.
 */

import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.api
      .invoke("window:isMaximized", undefined as never)
      .then((r) => setMaximized(r.maximized));
  }, []);

  const min = () => void window.api.invoke("window:minimize", undefined as never);
  const toggle = async () => {
    const r = await window.api.invoke("window:toggleMaximize", undefined as never);
    setMaximized(r.maximized);
  };
  const close = () => void window.api.invoke("window:close", undefined as never);

  return (
    <div className="no-drag flex items-center">
      <button
        onClick={min}
        className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
        aria-label="Réduire"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={() => void toggle()}
        className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
        aria-label={maximized ? "Restaurer" : "Agrandir"}
      >
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button
        onClick={close}
        className="flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
        aria-label="Fermer"
      >
        <X size={16} />
      </button>
    </div>
  );
}
