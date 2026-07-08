"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

type MenuServiceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
};

export function MenuServiceSheet({
  open,
  onOpenChange,
  title,
  children,
}: MenuServiceSheetProps) {
  const isMobile = useIsMobile();

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="menu-service-overlay"
          className="fixed inset-0 z-[60] flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={false}
        >
          {/* Backdrop */}
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

          {/* Panel */}
          <motion.div
            className={cn(
              "relative flex w-full flex-col overflow-hidden",
              "h-[100dvh] max-h-[100dvh]",
              "bg-[#faf8f4] shadow-[0_-16px_56px_rgba(15,23,42,0.16)]",
              isMobile ? "rounded-t-[20px]" : "rounded-t-[24px]",
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              duration: 0.5,
              ease: EASE,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            {isMobile ? (
              <div className="flex justify-center pt-2.5 shrink-0" aria-hidden="true">
                <div className="w-10 h-1 rounded-full bg-[#d9d3c7]" />
              </div>
            ) : null}

            {/* Header */}
            <motion.div
              className="sticky top-0 z-10 shrink-0 bg-white/95 backdrop-blur-md border-b border-[#e8e3d9] px-5 pt-3 pb-3 safe-area-top"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EASE, delay: 0.08 }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 flex-1 text-lg font-bold text-[#0f172a] truncate">
                  {title}
                </h2>
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

            {/* Body */}
            <motion.div
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.42,
                ease: EASE,
                delay: 0.14,
              }}
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
