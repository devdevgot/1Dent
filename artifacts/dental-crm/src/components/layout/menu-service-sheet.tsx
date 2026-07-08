"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "dash-sheet z-[60] h-[100dvh] max-h-[100dvh] rounded-t-none p-0 gap-0",
          "flex flex-col overflow-hidden",
        )}
      >
        {isMobile ? (
          <div className="flex justify-center pt-2 shrink-0" aria-hidden="true">
            <div className="w-10 h-1 rounded-full bg-[#e8e3d9]" />
          </div>
        ) : null}

        <div className="sticky top-0 z-10 shrink-0 bg-white border-b border-[#e8e3d9] px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 flex-1 text-lg font-bold text-[#0f172a] truncate">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Закрыть"
              className="w-9 h-9 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b] shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
