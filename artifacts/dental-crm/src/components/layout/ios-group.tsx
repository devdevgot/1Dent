import type { ReactNode } from "react";
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 px-1">{title}</p>
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
        "bg-surface rounded-2xl border border-border overflow-hidden",
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
};

export function IosGroupRow({
  children,
  className,
  onClick,
  as = "div",
}: IosGroupRowProps) {
  const Comp = as === "button" ? "button" : "div";
  return (
    <Comp
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3.5 text-sm text-foreground font-manrope",
        "border-b border-border/60 last:border-b-0",
        (onClick || as === "button") &&
          "w-full text-left active:bg-accent transition-colors",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
