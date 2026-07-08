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
    "border-l border-[var(--ds-border)] flex items-center justify-center px-1.5 py-2.5 text-center min-h-[2.75rem]",
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
          "inline-flex items-center justify-center w-6 h-6 rounded-full text-micro font-bold",
          value
            ? "bg-[#f0fdf4] text-[var(--success)]"
            : "bg-[var(--surface-2)] text-[var(--text-subtle)]",
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
        "text-caption font-semibold text-[var(--text)] tabular-nums leading-tight",
        recommended && "text-[var(--ds-primary)]",
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
          "text-micro font-bold uppercase tracking-wide",
          plan.recommended ? "text-[var(--ds-primary)]" : "text-[var(--text)]",
        )}
      >
        {PLAN_SHORT_NAMES[planId]}
      </span>
      {plan.recommended && (
        <Star className="w-2.5 h-2.5 fill-[#1f75fe] text-[var(--ds-primary)]" />
      )}
      <span className="text-[10px] text-[var(--text-secondary)] font-medium tabular-nums leading-none">
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
    <div className={cn(GRID_COLS, "border-t border-[var(--ds-border)]/80", zebra && "bg-[var(--bg)]/40")}>
      <div className="flex flex-col justify-center px-3 py-2.5 min-h-[2.75rem]">
        <p className="text-caption font-semibold text-[var(--text)] leading-snug">{label}</p>
        {hint ? <p className="text-micro text-[var(--text-subtle)] mt-0.5">{hint}</p> : null}
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
      <div className="min-w-[320px] border border-[var(--ds-border)] rounded-xl overflow-hidden bg-[var(--ds-surface)]">
        {/* Column headers — vertical dividers align with all rows below */}
        <div className={GRID_COLS}>
          <div className="px-3 py-2.5 flex items-end">
            <span className="text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Параметр
            </span>
          </div>
          {PLAN_IDS.map((planId) => (
            <PlanColumnHeader key={planId} planId={planId} />
          ))}
        </div>

        <p className="text-micro text-[var(--text-subtle)] text-center py-2 px-3 border-t border-[var(--ds-border)]/80 bg-[var(--bg)]/50 leading-relaxed">
          Внедрение — {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ (разово) для всех тарифов
        </p>

        {COMPARISON_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-4 py-2 bg-[var(--bg)] border-t border-[var(--ds-border)]">
              <p className="text-micro font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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

        <div className="px-4 py-3 border-t border-[var(--ds-border)] bg-[var(--bg)]">
          <p className="text-caption text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-[var(--ds-primary)]">PRO</span> — оптимальный выбор: в 5×
            больше AI и чат-бот, аналитика каналов и приоритетная поддержка за +60 000 ₸ к START.
          </p>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return <div className="border-t border-[var(--ds-border)] px-3 pb-3 pt-1">{content}</div>;
  }

  return (
    <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--ds-border)] bg-[var(--bg)]">
        <h3 className="text-body font-semibold text-[var(--text)]">Сравнение тарифов</h3>
        <p className="text-caption text-[var(--text-secondary)] mt-0.5">Ключевые отличия между планами</p>
      </div>
      <div className="p-3">{content}</div>
    </div>
  );
}
