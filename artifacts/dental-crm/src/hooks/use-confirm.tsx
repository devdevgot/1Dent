import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type ConfirmTone = "warning" | "danger" | "critical";

export interface ConfirmOptions {
  /** Dialog title. */
  title: ReactNode;
  /** Optional supporting description / explanation of consequences. */
  description?: ReactNode;
  /** Confirm button label. Defaults depend on tone. */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Отмена". */
  cancelLabel?: string;
  /**
   * Severity of the action:
   * - `warning`  — single confirmation, neutral primary button.
   * - `danger`   — single confirmation, red primary button (default).
   * - `critical` — double confirmation: user must type `requirePhrase`.
   */
  tone?: ConfirmTone;
  /**
   * For `critical` tone: the exact phrase the user must type to enable the
   * confirm button (e.g. the entity name or the word "УДАЛИТЬ").
   * Ignored for non-critical tones.
   */
  requirePhrase?: string;
  /** Optional hint shown above the type-to-confirm input. */
  requirePhraseLabel?: ReactNode;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const CLOSED_STATE: ConfirmState = { open: false, title: "" };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(CLOSED_STATE);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // If a previous confirmation is still pending, resolve it as cancelled.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        tone={state.tone}
        requirePhrase={state.requirePhrase}
        requirePhraseLabel={state.requirePhraseLabel}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Imperative confirmation hook.
 *
 * @example
 * const confirm = useConfirm();
 * if (!(await confirm({ tone: "danger", title: "Удалить?" }))) return;
 * deleteMutation.mutate();
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
