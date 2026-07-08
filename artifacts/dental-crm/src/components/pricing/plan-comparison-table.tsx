import { Check, Star } from "lucide-react";
import {
  COMPARISON_SECTIONS,
  formatPlanPrice,
  IMPLEMENTATION_FEE,
  PLAN_SHORT_NAMES,
  PLANS,
  type PaidPlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

const PLAN_IDS = PLANS.map((p) => p.id);
const GRID_COLS =
  "grid grid-cols-[minmax(5.5rem,1.1fr)_repeat(3,minmax(4.25rem,1fr))]";

function planColumnClass(planId: PaidPlanId, extra?: string) {
  const plan = PLANS.find((p) => p.id === planId)!;
  return cn(
    "border-l border-[#e8e3d9] flex items-center justify-center px-1.5 py-2.5 text-center min-h-[2.75rem]",
    plan.recommended && "bg-[#1f75fe]/[0.06]",
    extra,
  );
}

function ComparisonValue({
  value,
  recommended,
}: {
  value: string | boolean;
  recommended?: boolean;
}) {
  if (typeof value === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
          value
            ? "bg-[#f0fdf4] text-[#16a34a]"
            : "bg-[#f1ede4] text-[#94a3b8]",
          recommended && value && "ring-1 ring-[#1f75fe]/20",
        )}
        aria-label={value ? "Включено" : "Не включено"}
      >
        {value ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : "—"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "text-xs font-semibold text-[#0f172a] tabular-nums leading-tight",
        recommended && "text-[#1f75fe]",
      )}
    >
      {value}
    </span>
  );
}

function PlanColumnHeader({ planId }: { planId: PaidPlanId }) {
  const plan = PLANS.find((p) => p.id === planId)!;

  return (
    <div className={planColumnClass(planId, "flex-col gap-0.5 py-3 min-h-[4rem]")}>
      <span
        className={cn(
          "text-xs font-bold uppercase tracking-wide",
          plan.recommended ? "text-[#1f75fe]" : "text-[#0f172a]",
        )}
      >
        {PLAN_SHORT_NAMES[planId]}
      </span>
      {plan.recommended && (
        <Star className="w-2.5 h-2.5 fill-[#1f75fe] text-[#1f75fe]" />
      )}
      <span className="text-[10px] text-[#64748b] font-medium tabular-nums leading-none">
        {formatPlanPrice(plan.price)} ₸
      </span>
    </div>
  );
}

function ComparisonGridRow({
  label,
  hint,
  values,
  zebra,
}: {
  label: string;
  hint?: string;
  values: Record<PaidPlanId, string | boolean>;
  zebra?: boolean;
}) {
  return (
    <div className={cn(GRID_COLS, "border-t border-[#e8e3d9]/80", zebra && "bg-[#faf8f4]/40")}>
      <div className="flex flex-col justify-center px-3 py-2.5 min-h-[2.75rem]">
        <p className="text-xs font-semibold text-[#0f172a] leading-snug">{label}</p>
        {hint ? <p className="text-xs text-[#94a3b8] mt-0.5">{hint}</p> : null}
      </div>
      {PLAN_IDS.map((planId) => {
        const plan = PLANS.find((p) => p.id === planId)!;
        return (
          <div key={planId} className={planColumnClass(planId)}>
            <ComparisonValue value={values[planId]} recommended={plan.recommended} />
          </div>
        );
      })}
    </div>
  );
}

export function PlanComparisonTable({ embedded = false }: { embedded?: boolean }) {
  const content = (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-[320px] border border-[#e8e3d9] rounded-xl overflow-hidden bg-white">
        {/* Column headers — vertical dividers align with all rows below */}
        <div className={GRID_COLS}>
          <div className="px-3 py-2.5 flex items-end">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Параметр
            </span>
          </div>
          {PLAN_IDS.map((planId) => (
            <PlanColumnHeader key={planId} planId={planId} />
          ))}
        </div>

        <p className="text-xs text-[#94a3b8] text-center py-2 px-3 border-t border-[#e8e3d9]/80 bg-[#faf8f4]/50 leading-relaxed">
          Внедрение — {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ (разово) для всех тарифов
        </p>

        {COMPARISON_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-4 py-2 bg-[#faf8f4] border-t border-[#e8e3d9]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                {section.title}
              </p>
            </div>
            {section.rows.map((row, index) => (
              <ComparisonGridRow
                key={row.key}
                label={row.label}
                hint={row.hint}
                values={row.values}
                zebra={index % 2 === 1}
              />
            ))}
          </div>
        ))}

        <div className="px-4 py-3 border-t border-[#e8e3d9] bg-[#faf8f4]">
          <p className="text-xs text-[#64748b] leading-relaxed">
            <span className="font-semibold text-[#1f75fe]">PRO</span> — оптимальный выбор: в 5×
            больше AI и чат-бот, аналитика каналов и приоритетная поддержка за +60 000 ₸ к START.
          </p>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return <div className="border-t border-[#e8e3d9] px-3 pb-3 pt-1">{content}</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e3d9] bg-[#faf8f4]">
        <h3 className="text-sm font-semibold text-[#0f172a]">Сравнение тарифов</h3>
        <p className="text-xs text-[#64748b] mt-0.5">Ключевые отличия между планами</p>
      </div>
      <div className="p-3">{content}</div>
    </div>
  );
}
