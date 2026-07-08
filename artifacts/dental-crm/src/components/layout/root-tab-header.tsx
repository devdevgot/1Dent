import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type RootTabHeaderProps = {
  title: string;
  right?: ReactNode;
  className?: string;
};

/** Large-title sticky header for root bottom-tab pages (no back button). */
export function RootTabHeader({ title, right, className }: RootTabHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur-sm safe-area-top font-manrope",
        className,
      )}
    >
      <div className="flex items-end justify-between gap-3 px-5 pt-4 pb-2.5">
        <h1 className="text-page-title font-extrabold tracking-tight text-[var(--text)] leading-none">
          {title}
        </h1>
        {right ? <div className="shrink-0 flex items-center gap-1.5">{right}</div> : null}
      </div>
    </header>
  );
}
