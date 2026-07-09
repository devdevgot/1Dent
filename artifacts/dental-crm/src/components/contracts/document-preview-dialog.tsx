import { memo, useEffect, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Full iframe URL — loaded after a short defer so the parent UI stays responsive. */
  iframeSrc: string | null;
  externalHref?: string | null;
  className?: string;
};

/**
 * Lightweight document preview shell for CRM iframes.
 * - Portals to document.body (avoids nested overlay inside heavy panels)
 * - No backdrop-blur (blur over large DOM trees freezes the browser)
 * - Defers iframe navigation until after the dialog paints
 */
function DocumentPreviewDialogInner({
  open,
  onOpenChange,
  title,
  description,
  iframeSrc,
  externalHref,
  className,
}: DocumentPreviewDialogProps) {
  const [visible, setVisible] = useState(false);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveSrc(null);
      const hideTimer = window.setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(hideTimer);
    }

    startTransition(() => setVisible(true));
    const deferTimer = window.setTimeout(() => {
      if (iframeSrc) setActiveSrc(iframeSrc);
    }, 120);

    return () => clearTimeout(deferTimer);
  }, [open, iframeSrc]);

  if (!visible && !open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-6",
        open ? "pointer-events-auto" : "pointer-events-none",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-150",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />

      <div
        className={cn(
          "relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white font-manrope shadow-2xl transition-opacity duration-150",
          "h-[80vh] max-h-[85vh]",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[#e8e3d9] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-[#0f172a] leading-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs text-[#64748b]">{description}</p>
            ) : null}
          </div>
          {externalHref ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs px-2.5 py-1.5 bg-[#f1ede4] text-[#0f172a] rounded-lg font-medium hover:bg-[var(--ds-border)] transition-colors"
            >
              ↗ В новой вкладке
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Закрыть"
            className="shrink-0 rounded-xl p-2 text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col bg-white">
          {activeSrc ? (
            <iframe
              src={activeSrc}
              className="h-full w-full flex-1 border-0 bg-white"
              title={title}
              loading="lazy"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#94a3b8]" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const DocumentPreviewDialog = memo(DocumentPreviewDialogInner);

export function buildTemplatePreviewUrl(templateId: string): string {
  const base = (typeof window !== "undefined" && window.location.origin) || "";
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${base}/api/contracts/templates/${encodeURIComponent(templateId)}/preview/html${qs}`;
}
