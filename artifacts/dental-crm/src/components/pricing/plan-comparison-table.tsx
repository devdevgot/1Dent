import { Check, Minus, Star } from "lucide-react";
import { COMPARISON_ROWS, PLANS, formatPlanPrice, type PaidPlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="w-4 h-4 text-[#16a34a] mx-auto" strokeWidth={3} />
    ) : (
      <Minus className="w-4 h-4 text-[#cbd5e1] mx-auto" />
    );
  }

  return <span className="text-caption text-[#0f172a] font-medium">{value}</span>;
}

export function PlanComparisonTable() {
  const planIds = PLANS.map((p) => p.id);

  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#e8e3d9] bg-[#faf8f4]">
        <h3 className="text-body font-bold text-[#0f172a]">Сравнение тарифов</h3>
        <p className="text-caption text-[#64748b] mt-0.5">
          Только ключевые отличия — за что вы платите больше
        </p>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-[#e8e3d9]">
              <th className="text-left text-caption font-semibold text-[#64748b] px-4 py-3 w-[38%] sticky left-0 bg-white z-[1]">
                Параметр
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.id}
                  className={cn(
                    "text-center px-3 py-3 min-w-[5.5rem]",
                    plan.recommended && "bg-[#1f75fe]/6",
                  )}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={cn(
                        "text-caption font-bold uppercase tracking-wide",
                        plan.recommended ? "text-[#1f75fe]" : "text-[#0f172a]",
                      )}
                    >
                      {plan.name}
                    </span>
                    {plan.recommended && (
                      <Star className="w-3 h-3 fill-[#1f75fe] text-[#1f75fe]" />
                    )}
                    <span className="text-micro text-[#64748b] font-medium tabular-nums">
                      {formatPlanPrice(plan.price)} ₸
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, index) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-[#e8e3d9] last:border-b-0",
                  index % 2 === 1 && "bg-[#faf8f4]/60",
                )}
              >
                <td className="text-caption text-[#64748b] px-4 py-2.5 sticky left-0 bg-inherit z-[1] font-medium">
                  {row.label}
                </td>
                {planIds.map((planId) => (
                  <td
                    key={planId}
                    className={cn(
                      "text-center px-3 py-2.5",
                      planId === "professional" && "bg-[#1f75fe]/4",
                    )}
                  >
                    <ComparisonCell value={row.values[planId as PaidPlanId]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-[#e8e3d9] bg-[#faf8f4]">
        <p className="text-caption text-[#64748b] leading-relaxed">
          <span className="font-semibold text-[#0f172a]">PRO</span> — оптимальный баланс: в 5 раз
          больше AI и чат-бот, аналитика каналов и приоритетная поддержка за +60 000 ₸ к START.
        </p>
      </div>
    </div>
  );
}
