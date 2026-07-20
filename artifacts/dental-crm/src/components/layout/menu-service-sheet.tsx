"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

type MenuServiceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  onStackBack?: () => void;
  children: ReactNode;
};

export function MenuServiceSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  onStackBack,
  children,
}: MenuServiceSheetProps) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onStackBack) {
          onStackBack();
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose, onStackBack]);

  if (typeof document === "undefined") return null;

  return createPortal(
    open ? (
      <motion.div
        key="menu-service-overlay"
        className={cn(
          // Canvas behind the rubber-banded surface — spinner lives in this gap
          "fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#faf8f4]",
          "h-[100dvh] min-h-[100dvh] max-h-[100dvh]",
          "h-[100svh] min-h-[100svh] max-h-[100svh]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {/* data-ptr-surface: header + body move together so PTR spinner sits above the sheet */}
        <div data-ptr-surface className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-[#e8e3d9] bg-white safe-area-top">
            <div className="flex items-center gap-2 px-4 sm:px-5 pt-3 pb-3">
              {onStackBack ? (
                <button
                  type="button"
                  onClick={onStackBack}
                  aria-label="Назад"
                  className="w-9 h-9 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b] shrink-0 hover:bg-[#e8e3d9] active:scale-90 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-[#0f172a] leading-tight line-clamp-2">
                  {title}
                </h2>
                {subtitle ? (
                  <p className="text-xs text-[#64748b] mt-0.5 truncate">{subtitle}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleClose}
                aria-label="Закрыть"
                className={cn(
                  "w-9 h-9 rounded-full bg-[#f1ede4] flex items-center justify-center",
                  "text-[#64748b] shrink-0",
                  "hover:bg-[#e8e3d9] hover:text-[#0f172a]",
                  "active:scale-90 transition-all duration-200",
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-[#faf8f4]">
            {children}
          </div>
        </div>
      </motion.div>
    ) : null,
    document.body,
  );
}
