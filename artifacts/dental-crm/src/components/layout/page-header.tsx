import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
  sticky?: boolean;
};

export function PageHeader({
  title,
  onBack,
  backLabel = "Back",
  right,
  className,
  sticky = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "bg-white border-b border-[#e8e3d9] safe-area-top font-manrope",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-3 min-h-[52px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="p-1.5 -ml-1.5 rounded-xl text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1ede4] transition-colors active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
        <h1 className="flex-1 text-nav-title font-semibold text-[#0f172a] truncate">
          {title}
        </h1>
        <div className="shrink-0 min-w-[36px] flex justify-end">{right}</div>
      </div>
    </header>
  );
}
