import { cn } from "@/lib/utils";

/** Centered overlay shell — tablet uses full centering, phone keeps bottom sheet until sm. */
export function overlayShellClass(isTablet: boolean, extra?: string) {
  return cn(
    "fixed inset-0 z-50 flex justify-center animate-in-fade",
    isTablet ? "items-center p-6" : "items-end sm:items-center sm:p-4",
    extra,
  );
}

/** Primary modal panel width/height for tablet vs phone. */
export function overlayPanelClass(
  isTablet: boolean,
  opts?: { phone?: string; tablet?: string },
) {
  return cn(
    "relative flex w-full flex-col overflow-hidden border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-xl",
    isTablet
      ? cn("max-w-3xl rounded-2xl max-h-[min(88dvh,900px)]", opts?.tablet)
      : cn(
          "rounded-t-3xl sm:rounded-2xl sm:max-w-md animate-in-slide",
          opts?.phone,
        ),
  );
}

export function tabletDialogContentClass(isTablet: boolean, base?: string) {
  return cn(
    base,
    isTablet && "max-w-2xl w-[min(92vw,42rem)]",
  );
}
