import { cn } from "@/lib/utils";

/**
 * Skeleton building blocks shared by all page skeletons.
 *
 * Design rules:
 * - bones use --surface-2 (#f1ede4), cards use --ds-surface + --ds-border
 * - kept dependency-free (no framer-motion, no icons) so route-level
 *   Suspense fallbacks in App.tsx stay in the main bundle cheaply.
 */

type BoneProps = {
  className?: string;
  style?: React.CSSProperties;
};

export function Bone({ className, style }: BoneProps) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--surface-2)]", className)} style={style} />;
}

/* ── Headers ─────────────────────────────────────────────── */

type PageHeaderSkeletonProps = {
  back?: boolean;
  subtitle?: boolean;
  actions?: number;
  bottom?: React.ReactNode;
};

/** Mimics layout/PageHeader: back circle, title, optional subtitle, right action circles. */
export function PageHeaderSkeleton({
  back = true,
  subtitle = false,
  actions = 0,
  bottom,
}: PageHeaderSkeletonProps) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--ds-surface)] border-b border-[var(--ds-border)] safe-area-top font-manrope shrink-0 shadow-sm">
      <div className="flex items-center gap-2 px-4 pt-3 pb-3 min-h-[52px]">
        {back ? <Bone className="w-9 h-9 rounded-full shrink-0" /> : <div className="w-9 shrink-0" />}
        <div className="flex-1 min-w-0">
          <Bone className="h-5 w-36 rounded-lg" />
          {subtitle && <Bone className="h-3 w-24 rounded mt-1.5" />}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {Array.from({ length: actions }).map((_, i) => (
            <Bone key={i} className="w-9 h-9 rounded-full" />
          ))}
        </div>
      </div>
      {bottom ? <div className="px-4 pb-3">{bottom}</div> : null}
    </header>
  );
}

/** Mimics layout/RootTabHeader: large left-aligned title, no back button. */
export function RootTabHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur-sm safe-area-top font-manrope">
      <div className="flex items-end justify-between gap-3 px-5 pt-4 pb-2.5">
        <Bone className="h-7 w-40 rounded-xl" />
        {actions > 0 && (
          <div className="shrink-0 flex items-center gap-1.5">
            {Array.from({ length: actions }).map((_, i) => (
              <Bone key={i} className="w-9 h-9 rounded-full" />
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/* ── Cards & grids ───────────────────────────────────────── */

export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-sm", className)}>
      {children}
    </div>
  );
}

type KpiGridSkeletonProps = {
  count?: number;
  className?: string;
  cardHeight?: string;
};

/** Grid of KPI stat cards: small label bone + big value bone. */
export function KpiGridSkeleton({
  count = 4,
  className = "grid grid-cols-2 gap-3",
  cardHeight = "h-[92px]",
}: KpiGridSkeletonProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className={cn("p-4 flex flex-col justify-between", cardHeight)}>
          <Bone className="h-3 w-20 rounded" />
          <Bone className="h-6 w-24 rounded-lg" />
        </SkeletonCard>
      ))}
    </div>
  );
}

type ChartCardSkeletonProps = {
  height?: string;
  className?: string;
  title?: boolean;
};

/** Card with a title bone and rising bars imitating a chart area. */
export function ChartCardSkeleton({ height = "h-48", className, title = true }: ChartCardSkeletonProps) {
  const bars = [40, 65, 50, 80, 60, 90, 70];
  return (
    <SkeletonCard className={cn("p-4", className)}>
      {title && <Bone className="h-4 w-32 rounded mb-4" />}
      <div className={cn("flex items-end gap-2", height)}>
        {bars.map((h, i) => (
          <Bone key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </SkeletonCard>
  );
}

/* ── Tables & lists ──────────────────────────────────────── */

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  withHeader?: boolean;
  avatar?: boolean;
  className?: string;
  minWidth?: string;
};

/** Table card: optional column-header strip + avatar/text/badge rows (users.tsx pattern). */
export function TableSkeleton({
  rows = 8,
  columns = 5,
  withHeader = true,
  avatar = true,
  className,
  minWidth,
}: TableSkeletonProps) {
  return (
    <div className={cn("bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden", className)}>
      <div className={minWidth}>
        {withHeader && (
          <div className="bg-[var(--bg)] border-b border-[var(--ds-border)] px-4 py-3 flex gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Bone key={i} className="h-3 flex-1 rounded" />
            ))}
          </div>
        )}
        <div className="divide-y divide-[var(--ds-border)]">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-3">
              {avatar && <Bone className="w-9 h-9 rounded-xl shrink-0" />}
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-40 max-w-full rounded" />
                <Bone className="h-3 w-24 rounded" />
              </div>
              <Bone className="h-6 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ListRowsSkeletonProps = {
  rows?: number;
  avatar?: boolean;
  card?: boolean;
  rowHeight?: string;
  className?: string;
};

/** Stack of list rows (chat list, channels, branches, logs). */
export function ListRowsSkeleton({
  rows = 6,
  avatar = true,
  card = true,
  rowHeight = "py-3.5",
  className,
}: ListRowsSkeletonProps) {
  const body = (
    <div className={cn(card && "divide-y divide-[var(--ds-border)]", !card && "space-y-2.5")}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "px-4 flex items-center gap-3",
            rowHeight,
            !card && "bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-sm",
          )}
        >
          {avatar && <Bone className="w-10 h-10 rounded-full shrink-0" />}
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-36 max-w-full rounded" />
            <Bone className="h-3 w-52 max-w-full rounded" />
          </div>
          <Bone className="h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
  if (!card) return <div className={className}>{body}</div>;
  return (
    <div className={cn("bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-sm overflow-hidden", className)}>
      {body}
    </div>
  );
}

/* ── Filters & forms ─────────────────────────────────────── */

export function FilterPillsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 overflow-hidden", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Bone key={i} className="h-8 w-20 rounded-xl shrink-0" />
      ))}
    </div>
  );
}

export function SearchBarSkeleton({ className }: { className?: string }) {
  return <Bone className={cn("h-10 w-full rounded-xl", className)} />;
}

type FormSkeletonProps = {
  fields?: number;
  withButton?: boolean;
  className?: string;
};

/** Label + input bones stacked, optional submit button bone. */
export function FormSkeleton({ fields = 4, withButton = true, className }: FormSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Bone className="h-3 w-24 rounded" />
          <Bone className="h-11 w-full rounded-xl" />
        </div>
      ))}
      {withButton && <Bone className="h-11 w-full rounded-xl mt-2" />}
    </div>
  );
}

/* ── Calendars & boards ──────────────────────────────────── */

/** 7-column month grid with DOW header (admin-calendar / doctor-schedule). */
export function CalendarMonthSkeleton({ weeks = 5, className }: { weeks?: number; className?: string }) {
  return (
    <div className={cn("bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-sm overflow-hidden", className)}>
      <div className="grid grid-cols-7 border-b border-[var(--ds-border)]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center py-2.5">
            <Bone className="h-3 w-6 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: weeks * 7 }).map((_, i) => (
          <div key={i} className="border-b border-r border-[var(--ds-border)] p-1.5 min-h-[72px] space-y-1.5">
            <Bone className="h-3 w-4 rounded" />
            {i % 4 === 1 && <Bone className="h-3.5 w-full rounded" />}
            {i % 7 === 3 && <Bone className="h-3.5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Day timeline: hour ruler lines with a few appointment blocks (doctor-schedule-day). */
export function DayTimelineSkeleton({ hours = 8, className }: { hours?: number; className?: string }) {
  return (
    <div className={cn("bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-sm p-4", className)}>
      <div className="relative">
        {Array.from({ length: hours }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 h-16">
            <Bone className="h-3 w-10 rounded shrink-0 mt-0" />
            <div className="flex-1 border-t border-[var(--ds-border)] pt-1.5">
              {(i === 1 || i === 4) && <Bone className="h-12 w-3/4 rounded-xl" />}
              {i === 2 && <Bone className="h-12 w-1/2 rounded-xl" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal kanban columns with stacked cards (patients kanban view). */
export function KanbanSkeleton({ columns = 3, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn("flex gap-4 overflow-hidden", className)}>
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="w-[280px] shrink-0 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Bone className="h-4 w-24 rounded" />
            <Bone className="h-5 w-7 rounded-lg" />
          </div>
          {Array.from({ length: 3 - (c % 2) }).map((_, i) => (
            <SkeletonCard key={i} className="p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Bone className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-4 w-28 rounded" />
                  <Bone className="h-3 w-20 rounded" />
                </div>
              </div>
              <Bone className="h-2 w-full rounded-full" />
              <div className="flex gap-2">
                <Bone className="h-5 w-14 rounded-lg" />
                <Bone className="h-5 w-16 rounded-lg" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      ))}
    </div>
  );
}
