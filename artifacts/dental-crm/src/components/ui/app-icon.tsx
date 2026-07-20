import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AppIconSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<AppIconSize, string> = {
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-14 h-14",
};

/**
 * 3D squircle icons for Profile / Services / Home.
 * Retries once on load failure (flaky PWA/SW) and shows a soft placeholder
 * instead of a blank circle when the asset never arrives.
 */
export function AppIcon({
  src,
  className,
  size = "md",
  eager = false,
}: {
  src: string;
  className?: string;
  size?: AppIconSize;
  /** Prefer eager decode for above-the-fold rows (profile security, menu grid). */
  eager?: boolean;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const retries = useRef(0);

  useEffect(() => {
    setCurrentSrc(src);
    setFailed(false);
    retries.current = 0;
  }, [src]);

  if (failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-[22%] bg-[#f1ede4] ring-1 ring-inset ring-[#e8e3d9]",
          SIZE_CLASS[size],
          className,
        )}
      />
    );
  }

  return (
    <img
      src={currentSrc}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      onError={() => {
        if (retries.current < 2) {
          retries.current += 1;
          const sep = src.includes("?") ? "&" : "?";
          setCurrentSrc(`${src}${sep}retry=${retries.current}`);
          return;
        }
        setFailed(true);
      }}
      className={cn(
        "shrink-0 object-contain drop-shadow-sm select-none",
        SIZE_CLASS[size],
        className,
      )}
    />
  );
}
