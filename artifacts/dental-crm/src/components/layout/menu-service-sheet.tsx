"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
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

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose, onStackBack]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="menu-service-overlay"
          className="fixed inset-0 z-[60] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={false}
        >
          <motion.button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/35 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: EASE }}
            onClick={handleClose}
          />

          <motion.div
            className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.5, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="sticky top-0 z-10 shrink-0 bg-white border-b border-[#e8e3d9] safe-area-top"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE, delay: 0.08 }}
            >
              <div className="flex items-center gap-2 px-4 pt-3 pb-3">
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
            </motion.div>

            <motion.div
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#faf8f4]"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.42, ease: EASE, delay: 0.14 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
