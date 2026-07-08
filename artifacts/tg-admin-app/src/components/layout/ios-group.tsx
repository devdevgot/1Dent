import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type IosSectionProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function IosSection({ title, children, className }: IosSectionProps) {
  return (
    <section className={cn("px-4", className)}>
      {title ? (
        <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2.5 px-1">{title}</p>
      ) : null}
      {children}
    </section>
  );
}

type IosGroupProps = {
  children: ReactNode;
  className?: string;
};

export function IosGroup({ children, className }: IosGroupProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

type IosGroupRowProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
  showChevron?: boolean;
};

export function IosGroupRow({
  children,
  className,
  onClick,
  as = "div",
  showChevron = false,
}: IosGroupRowProps) {
  const Comp = as === "button" || onClick ? "button" : "div";
  return (
    <Comp
      type={Comp === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3.5 text-sm text-[#0f172a] font-manrope",
        "border-b border-[#e8e3d9]/60 last:border-b-0",
        (onClick || as === "button") &&
          "w-full text-left active:bg-[#f1ede4] transition-colors",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">{children}</div>
      {showChevron ? <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" /> : null}
    </Comp>
  );
}
