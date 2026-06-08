import type { PatientFinancial } from "@/hooks/use-patient-financials";

interface Props {
  data: PatientFinancial;
  compact?: boolean;
}

function formatK(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

export function PatientFinancialBar({ data, compact = false }: Props) {
  const { paid, debt, remaining } = data;
  const total = paid + debt + remaining;
  if (total === 0) return null;

  const paidPct = (paid / total) * 100;
  const debtPct = (debt / total) * 100;
  const remainPct = (remaining / total) * 100;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
          {paidPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />}
          {debtPct > 0 && <div className="h-full bg-amber-400" style={{ width: `${debtPct}%` }} />}
          {remainPct > 0 && <div className="h-full bg-red-300" style={{ width: `${remainPct}%` }} />}
        </div>
        <div className="flex items-center justify-between text-[9px] font-semibold leading-none">
          {paid > 0 && <span className="text-emerald-600">{formatK(paid)} ₸</span>}
          {debt > 0 && <span className="text-amber-600">{formatK(debt)} ₸</span>}
          {remaining > 0 && <span className="text-red-500">{formatK(remaining)} ₸</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
        {paidPct > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />}
        {debtPct > 0 && <div className="h-full bg-amber-400 transition-all" style={{ width: `${debtPct}%` }} />}
        {remainPct > 0 && <div className="h-full bg-red-300 transition-all" style={{ width: `${remainPct}%` }} />}
      </div>
      <div className="flex items-center gap-3 text-[10px] font-medium">
        {paid > 0 && (
          <span className="text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {paid.toLocaleString("ru-KZ")} ₸
          </span>
        )}
        {debt > 0 && (
          <span className="text-amber-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {debt.toLocaleString("ru-KZ")} ₸
          </span>
        )}
        {remaining > 0 && (
          <span className="text-red-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
            {remaining.toLocaleString("ru-KZ")} ₸
          </span>
        )}
      </div>
    </div>
  );
}
