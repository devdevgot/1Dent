import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfirmTone } from "@/hooks/use-confirm";
import { haptic, hapticNotify } from "@/lib/haptics";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  requirePhrase?: string;
  requirePhraseLabel?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Unified confirmation dialog used by `useConfirm()`. Supports three severity
 * tones. `critical` requires the user to type an exact phrase before the
 * confirm button becomes enabled ("защита от дурака" / foolproofing).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  requirePhrase,
  requirePhraseLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isCritical = tone === "critical" && !!requirePhrase;
  const phraseOk = !isCritical || phrase.trim() === requirePhrase!.trim();

  // Reset the typed phrase whenever the dialog re-opens.
  useEffect(() => {
    if (open) setPhrase("");
  }, [open]);

  // Soft warning pulse when a destructive confirm appears (PWA only).
  useEffect(() => {
    if (!open) return;
    if (tone === "danger" || tone === "critical") {
      hapticNotify("warning");
    }
  }, [open, tone]);

  const resolvedConfirmLabel =
    confirmLabel ??
    (tone === "warning" ? t("confirm.confirm") : t("confirm.delete"));
  const resolvedCancelLabel = cancelLabel ?? t("confirm.cancel");

  const isDanger = tone === "danger" || tone === "critical";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl bg-[var(--ds-surface)] border border-[var(--ds-border)] shadow-xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {isDanger ? (
              <span className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--danger-light)] text-[var(--danger)]">
                <AlertTriangle className="h-5 w-5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-base leading-snug">
                {title}
              </AlertDialogTitle>
              {description ? (
                <AlertDialogDescription className="text-sm mt-1">
                  {description}
                </AlertDialogDescription>
              ) : null}
            </div>
          </div>
        </AlertDialogHeader>

        {isCritical ? (
          <div className="space-y-1.5">
            <label className="block text-xs text-[var(--ds-text-secondary,#64748b)]">
              {requirePhraseLabel ?? (
                <>
                  {t("confirm.typeToConfirmHint")}{" "}
                  <span className="font-semibold text-[var(--ds-text,#0f172a)]">
                    {requirePhrase}
                  </span>
                </>
              )}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={phrase}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phraseOk) {
                  haptic(isDanger ? "heavy" : "medium");
                  onConfirm();
                }
              }}
              placeholder={requirePhrase}
              className="w-full rounded-xl border border-[var(--ds-border)] bg-[var(--ds-bg,#fff)] px-3 py-2 text-sm outline-none focus:border-[var(--danger)] focus:ring-1 focus:ring-[var(--danger)]"
            />
          </div>
        ) : null}

        <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="dash-btn dash-btn-secondary flex-1 mt-0 h-9 text-sm"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(isDanger ? "heavy" : "medium");
              onConfirm();
            }}
            disabled={!phraseOk}
            className={cn(
              "dash-btn flex-1 h-9 text-sm border-0",
              isDanger
                ? "text-white bg-[var(--danger)] hover:opacity-90"
                : "dash-btn-primary",
              !phraseOk && "opacity-50 cursor-not-allowed",
            )}
          >
            {resolvedConfirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
