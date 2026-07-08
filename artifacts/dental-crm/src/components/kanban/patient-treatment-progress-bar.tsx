import { memo, useMemo } from "react";
import type { PatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { cn } from "@/lib/utils";

interface Props {
  data: PatientTreatmentProgress;
  compact?: boolean;
  className?: string;
}

const COLORS = {
  paid: "#10b981",
  debt: "#fbbf24",
  pending: "#f87171",
  track: "#f1ede4",
} as const;

function formatK(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

interface Segment {
  key: keyof typeof COLORS;
  value: number;
  count: number;
  label: string;
  color: string;
}

function DonutChart({
  segments,
  size,
  strokeWidth,
  centerLabel,
  centerSub,
}: {
  segments: Segment[];
  size: number;
  strokeWidth: number;
  centerLabel: string;
  centerSub?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const arcs = useMemo(() => {
    if (total === 0) return [];
    let offset = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((seg) => {
        const length = (seg.value / total) * circumference;
        const arc = {
          color: seg.color,
          dasharray: `${length} ${circumference - length}`,
          dashoffset: -offset,
          title: seg.label,
        };
        offset += length;
        return arc;
      });
  }, [segments, total, circumference]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={COLORS.track}
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            strokeLinecap="butt"
          >
            <title>{arc.title}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-bold text-[var(--text)] leading-none tabular-nums" style={{ fontSize: size * 0.22 }}>
          {centerLabel}
        </span>
        {centerSub && (
          <span className="text-[var(--text-subtle)] leading-none mt-0.5" style={{ fontSize: size * 0.14 }}>
            {centerSub}
          </span>
        )}
      </div>
    </div>
  );
}

export const PatientTreatmentProgressBar = memo(function PatientTreatmentProgressBar({
  data,
  compact = false,
  className,
}: Props) {
  const { paid, debt, pending, paidCount, debtCount, pendingCount } = data;
  const total = paid + debt + pending;
  if (total === 0) return null;

  const segments: Segment[] = [
    { key: "paid", value: paid, count: paidCount, label: "Выполнено и оплачено", color: COLORS.paid },
    { key: "debt", value: debt, count: debtCount, label: "Выполнено, в долг", color: COLORS.debt },
    { key: "pending", value: pending, count: pendingCount, label: "Не выполнено", color: COLORS.pending },
  ];

  const donePct = Math.round(((paid + debt) / total) * 100);
  const totalItems = paidCount + debtCount + pendingCount;

  if (compact) {
    const size = 40;
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <DonutChart
          segments={segments}
          size={size}
          strokeWidth={4}
          centerLabel={`${donePct}%`}
          centerSub={totalItems > 0 ? `${totalItems}` : undefined}
        />
        <div className="flex flex-col gap-0.5 min-w-0">
          {paid > 0 && (
            <span className="text-[9px] font-semibold text-emerald-600 truncate" title="Выполнено и оплачено">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />
              {paidCount > 0 && `${paidCount} · `}{formatK(paid)} ₸
            </span>
          )}
          {debt > 0 && (
            <span className="text-[9px] font-semibold text-amber-600 truncate" title="Выполнено, в долг">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />
              {debtCount > 0 && `${debtCount} · `}{formatK(debt)} ₸
            </span>
          )}
          {pending > 0 && (
            <span className="text-[9px] font-semibold text-red-500 truncate" title="Не выполнено по плану">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1 align-middle" />
              {pendingCount > 0 && `${pendingCount} · `}{formatK(pending)} ₸
            </span>
          )}
        </div>
      </div>
    );
  }

  const size = 56;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <DonutChart
        segments={segments}
        size={size}
        strokeWidth={5}
        centerLabel={`${donePct}%`}
        centerSub="готово"
      />
      <div className="flex flex-col gap-1 min-w-0">
        {paid > 0 && (
          <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {paidCount > 0 && <span>{paidCount} выполн.</span>}
            <span>{paid.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
        {debt > 0 && (
          <span className="text-[10px] font-medium text-amber-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            {debtCount > 0 && <span>{debtCount} в долг</span>}
            <span>{debt.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
        {pending > 0 && (
          <span className="text-[10px] font-medium text-red-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            {pendingCount > 0 && <span>{pendingCount} осталось</span>}
            <span>{pending.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
      </div>
    </div>
  );
});
