import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ILLUSTRATION_ACCENT,
  ILLUSTRATION_ACCENT_LIGHT,
  ILLUSTRATION_ACCENT_SOFT,
} from "./tokens";

export function IllustrationCanvas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("landing-illustration-canvas", className)}
      style={{ background: ILLUSTRATION_ACCENT_SOFT }}
    >
      {children}
    </div>
  );
}

export function FloatingBadge({
  children,
  className,
  style,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "solid" | "muted";
}) {
  return (
    <div
      className={cn(
        "landing-illustration-badge font-manrope",
        variant === "solid" && "landing-illustration-badge-solid",
        variant === "muted" && "landing-illustration-badge-muted",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function IllustrationCard({
  children,
  className,
  tinted = false,
}: {
  children: ReactNode;
  className?: string;
  tinted?: boolean;
}) {
  return (
    <div
      className={cn("landing-illustration-ui-card font-manrope", className)}
      style={tinted ? { background: ILLUSTRATION_ACCENT_LIGHT } : undefined}
    >
      {children}
    </div>
  );
}

export function IllustrationCheckbox({ checked = false }: { checked?: boolean }) {
  return (
    <span
      className="landing-illustration-checkbox"
      style={
        checked
          ? { background: ILLUSTRATION_ACCENT, borderColor: ILLUSTRATION_ACCENT }
          : undefined
      }
    />
  );
}

export function IllustrationTag({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  const tones = {
    blue: "bg-[#dbeafe] text-[#1d4ed8]",
    green: "bg-[#dcfce7] text-[#15803d]",
    amber: "bg-[#fef3c7] text-[#b45309]",
    slate: "bg-[#f1f5f9] text-[#475569]",
  };

  return (
    <span className={cn("landing-illustration-tag font-manrope", tones[tone])}>
      {children}
    </span>
  );
}
