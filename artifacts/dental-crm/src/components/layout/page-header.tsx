import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  bottom?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  className?: string;
  sticky?: boolean;
  shadow?: boolean;
};

export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  right,
  bottom,
  icon,
  badge,
  className,
  sticky = true,
  shadow = true,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "bg-[var(--surface)] border-b border-[var(--border)] safe-area-top font-manrope shrink-0",
        sticky && "sticky top-0 z-20",
        shadow && "shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-3 min-h-[52px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}

        {icon ? <div className="shrink-0 text-[var(--primary)]">{icon}</div> : null}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-nav-title font-semibold text-[var(--text)] truncate">{title}</h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="text-caption text-[var(--text-secondary)] mt-0.5 truncate">{subtitle}</p>
          ) : null}
        </div>

        <div className="shrink-0 flex items-center gap-1.5 justify-end">{right}</div>
      </div>

      {bottom ? <div className="px-4 pb-3">{bottom}</div> : null}
    </header>
  );
}

type PageHeaderIconButtonProps = {
  onClick?: () => void;
  title?: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
};

export function PageHeaderIconButton({
  onClick,
  title,
  active,
  children,
  className,
}: PageHeaderIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-xl transition-colors",
        active
          ? "text-[var(--primary)] bg-[var(--primary-light)]"
          : "text-[var(--text-subtle)] hover:text-[var(--primary)] hover:bg-[var(--surface-2)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
