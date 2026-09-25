/**
 * Input dialog that can be "resumed" after being closed by mistake.
 *
 * Hard-won lesson: a contract template being written, one click on "Annuler", and
 * everything was lost. From now on, closing a modified form (Annuler, cross, click
 * outside, Escape) does not destroy it: the form stays mounted, hidden, and the
 * action bar offers "Reprendre" for a few seconds: the input is found exactly as
 * it was, even if never saved. An unmodified form simply closes.
 *
 * Usage:
 *   const dlg = useFormDialog<Contract>("contrat");
 *   <Button onClick={() => dlg.open(null)}>Nouveau</Button>
 *   <Modal {...dlg.modalProps} title="…">
 *     {dlg.mounted && <Form key={dlg.key} initial={dlg.item}
 *        onSaved={() => { dlg.done(); reload(); }} onCancel={dlg.cancel} />}
 *   </Modal>
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useActionBar } from "./ActionBarContext.js";

interface State<T> {
  item: T | null;
  /** Changes on every opening: a new form, a fresh state. */
  key: number;
  visible: boolean;
  mounted: boolean;
}

export function useFormDialog<T>(what: string) {
  const bar = useActionBar();
  const [state, setState] = useState<State<T>>({ item: null, key: 0, visible: false, mounted: false });
  const keyRef = useRef(0);
  const dirty = useRef(false);

  const open = useCallback((item: T | null = null) => {
    dirty.current = false;
    keyRef.current += 1;
    setState({ item, key: keyRef.current, visible: true, mounted: true });
  }, []);

  /** Input saved: the dialog closes for good. */
  const done = useCallback(() => {
    dirty.current = false;
    setState((s) => ({ ...s, visible: false, mounted: false }));
  }, []);

  /** Closing without saving: recoverable if anything was entered. */
  const cancel = useCallback(() => {
    if (!dirty.current) {
      setState((s) => ({ ...s, visible: false, mounted: false }));
      return;
    }
    const key = keyRef.current;
    setState((s) => ({ ...s, visible: false }));
    bar.restore(
      `Saisie fermée sans enregistrer : ${what}`,
      () => setState((s) => (s.key === key ? { ...s, visible: true } : s)),
      () => setState((s) => (s.key === key && !s.visible ? { ...s, mounted: false } : s)),
    );
  }, [bar, what]);

  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  const modalProps = useMemo(
    () => ({ open: state.visible, keepMounted: state.mounted, onClose: cancel, onDirty: markDirty }),
    [state.visible, state.mounted, cancel, markDirty],
  );

  return {
    item: state.item,
    key: state.key,
    visible: state.visible,
    mounted: state.mounted,
    open,
    done,
    cancel,
    markDirty,
    modalProps,
  };
}
