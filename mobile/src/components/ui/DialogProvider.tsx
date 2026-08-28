import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Dialog, type DialogOptions } from './Dialog';

/**
 * Single-instance dialog manager. Wrap the app once in <DialogProvider>
 * (mount it in `app/_layout.tsx`), then call `useDialog()` from any
 * screen to show a styled dialog.
 *
 * Replaces `Alert.alert(...)` with a design-system-controlled UI so
 * variants, typography, action layouts, and theming all flow through
 * the same tokens as the rest of the app.
 */

type ShowFn = (options: DialogOptions) => void;

interface DialogContextValue {
  show: ShowFn;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<DialogOptions | null>(null);

  const show = useCallback<ShowFn>((o) => setOptions(o), []);
  const dismiss = useCallback(() => setOptions(null), []);

  const value = useMemo<DialogContextValue>(() => ({ show }), [show]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Dialog visible={!!options} options={options} onDismiss={dismiss} />
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      'useDialog must be used inside <DialogProvider>. Mount it once in app/_layout.tsx.',
    );
  }
  return ctx;
}
