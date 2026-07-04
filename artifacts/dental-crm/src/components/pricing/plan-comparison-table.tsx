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
        "text-caption font-semibold text-[#0f172a] tabular-nums leading-tight",
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
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl min-h-[3.25rem]",
        plan.recommended && "bg-[#1f75fe]/10 ring-1 ring-[#1f75fe]/20",
      )}
    >
      <span
        className={cn(
          "text-micro font-bold uppercase tracking-wide",
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

function ComparisonRowCard({
  label,
  hint,
  values,
}: {
  label: string;
  hint?: string;
  values: Record<PaidPlanId, string | boolean>;
}) {
  const planIds = PLANS.map((p) => p.id);

  return (
    <div className="px-3 py-2.5">
      <div className="mb-2 px-0.5">
        <p className="text-caption font-semibold text-[#0f172a] leading-snug">{label}</p>
        {hint ? <p className="text-micro text-[#94a3b8] mt-0.5">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {planIds.map((planId) => {
          const plan = PLANS.find((p) => p.id === planId)!;
          return (
            <div
              key={planId}
              className={cn(
                "flex items-center justify-center rounded-xl py-2.5 px-1 min-h-[2.5rem]",
                plan.recommended ? "bg-[#1f75fe]/6" : "bg-[#faf8f4]",
              )}
            >
              <ComparisonValue value={values[planId]} recommended={plan.recommended} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlanComparisonTable({ embedded = false }: { embedded?: boolean }) {
  const planIds = PLANS.map((p) => p.id);

  const content = (
    <div className="divide-y divide-[#e8e3d9]/80">
      {/* Plan headers */}
      <div className="px-3 pt-3 pb-2">
        <div className="grid grid-cols-3 gap-2">
          {planIds.map((planId) => (
            <PlanColumnHeader key={planId} planId={planId} />
          ))}
        </div>
        <p className="text-micro text-[#94a3b8] text-center mt-2.5 px-2 leading-relaxed">
          Внедрение — {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ (разово) для всех тарифов
        </p>
      </div>

      {COMPARISON_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="px-4 py-2 bg-[#faf8f4] border-y border-[#e8e3d9]/80">
            <p className="text-micro font-bold uppercase tracking-wider text-[#64748b]">
              {section.title}
            </p>
          </div>
          <div className="divide-y divide-[#e8e3d9]/60">
            {section.rows.map((row) => (
              <ComparisonRowCard
                key={row.key}
                label={row.label}
                hint={row.hint}
                values={row.values}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="px-4 py-3 bg-[#faf8f4]">
        <p className="text-caption text-[#64748b] leading-relaxed">
          <span className="font-semibold text-[#1f75fe]">PRO</span> — оптимальный выбор: в 5×
          больше AI и чат-бот, аналитика каналов и приоритетная поддержка за +60 000 ₸ к START.
        </p>
      </div>
    </div>
  );

  if (embedded) {
    return <div className="border-t border-[#e8e3d9]">{content}</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e3d9] bg-[#faf8f4]">
        <h3 className="text-body font-semibold text-[#0f172a]">Сравнение тарифов</h3>
        <p className="text-caption text-[#64748b] mt-0.5">Ключевые отличия между планами</p>
      </div>
      {content}
    </div>
  );
}
