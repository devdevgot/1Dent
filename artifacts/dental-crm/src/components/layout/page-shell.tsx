import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  /** Extra bottom padding for pages above the tab bar */
  withTabBarOffset?: boolean;
  animate?: boolean;
};

export function PageShell({
  children,
  className,
  withTabBarOffset = false,
  animate = true,
}: PageShellProps) {
  const body = (
    <div
      className={cn(
        "min-h-full bg-canvas text-foreground",
        withTabBarOffset && "pb-24",
        className,
      )}
    >
      {children}
    </div>
  );

  if (!animate) return body;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-full"
    >
      {body}
    </motion.div>
  );
}
