import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  withTabBarOffset?: boolean;
};

export function PageShell({
  children,
  className,
  withTabBarOffset = false,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "min-h-full bg-[#faf8f4] text-[#0f172a] font-manrope",
        withTabBarOffset && "pb-20",
        className,
      )}
    >
      {children}
    </div>
  );
}
