import { memo } from "react";
import type { PatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { cn } from "@/lib/utils";

interface Props {
  data: PatientTreatmentProgress;
  compact?: boolean;
  className?: string;
}

function formatK(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

export const PatientTreatmentProgressBar = memo(function PatientTreatmentProgressBar({
  data,
  compact = false,
  className,
}: Props) {
  const { paid, debt, pending, paidCount, debtCount, pendingCount } = data;
  const total = paid + debt + pending;
  if (total === 0) return null;

  const paidPct = (paid / total) * 100;
  const debtPct = (debt / total) * 100;
  const pendingPct = (pending / total) * 100;

  if (compact) {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
          {paidPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} title="Выполнено и оплачено" />}
          {debtPct > 0 && <div className="h-full bg-amber-400" style={{ width: `${debtPct}%` }} title="Выполнено, в долг" />}
          {pendingPct > 0 && <div className="h-full bg-red-400" style={{ width: `${pendingPct}%` }} title="Не выполнено" />}
        </div>
        <div className="flex items-center justify-between gap-1 text-[9px] font-semibold leading-none">
          {paid > 0 && (
            <span className="text-emerald-600" title="Выполнено и оплачено">
              {paidCount > 0 ? `${paidCount} · ` : ""}{formatK(paid)} ₸
            </span>
          )}
          {debt > 0 && (
            <span className="text-amber-600" title="Выполнено, не оплачено">
              {debtCount > 0 ? `${debtCount} · ` : ""}{formatK(debt)} ₸
            </span>
          )}
          {pending > 0 && (
            <span className="text-red-500" title="Не выполнено по плану">
              {pendingCount > 0 ? `${pendingCount} · ` : ""}{formatK(pending)} ₸
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
        {paidPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />}
        {debtPct > 0 && <div className="h-full bg-amber-400" style={{ width: `${debtPct}%` }} />}
        {pendingPct > 0 && <div className="h-full bg-red-400" style={{ width: `${pendingPct}%` }} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-medium">
        {paid > 0 && (
          <span className="text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            {paidCount > 0 && <span>{paidCount} выполн.</span>}
            <span>{paid.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
        {debt > 0 && (
          <span className="text-amber-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            {debtCount > 0 && <span>{debtCount} в долг</span>}
            <span>{debt.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
        {pending > 0 && (
          <span className="text-red-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            {pendingCount > 0 && <span>{pendingCount} осталось</span>}
            <span>{pending.toLocaleString("ru-KZ")} ₸</span>
          </span>
        )}
      </div>
    </div>
  );
});
