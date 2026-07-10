import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

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
  const { isOverlay } = useOverlayNavigation();

  const body = (
    <div
      className={cn(
        isOverlay ? "min-h-0 flex flex-col flex-1" : "min-h-full bg-[#faf8f4]",
        "text-[#0f172a] font-manrope",
        withTabBarOffset && !isOverlay && "pb-24",
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
