import { Check, Minus, Star } from "lucide-react";
import { COMPARISON_ROWS, PLANS, type PaidPlanId } from "@/lib/plans";
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

export function PlanComparisonTable({ embedded = false }: { embedded?: boolean }) {
  const planIds = PLANS.map((p) => p.id);

  const table = (
    <div className={embedded ? "" : "overflow-x-auto custom-scrollbar"}>
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr className="border-b border-[#e8e3d9]">
            <th className="text-left text-caption font-medium text-[#64748b] px-4 py-2.5 w-[38%] sticky left-0 bg-white z-[1]">
              Параметр
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.id}
                className={cn(
                  "text-center px-2 py-2.5 min-w-[4.5rem]",
                  plan.recommended && "bg-[#1f75fe]/5",
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      "text-micro font-bold uppercase tracking-wide",
                      plan.recommended ? "text-[#1f75fe]" : "text-[#0f172a]",
                    )}
                  >
                    {plan.name}
                  </span>
                  {plan.recommended && (
                    <Star className="w-2.5 h-2.5 fill-[#1f75fe] text-[#1f75fe]" />
                  )}
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
                "border-b border-[#e8e3d9]/80 last:border-b-0",
                index % 2 === 1 && "bg-[#faf8f4]/50",
              )}
            >
              <td className="text-caption text-[#64748b] px-4 py-2 sticky left-0 bg-inherit z-[1]">
                {row.label}
              </td>
              {planIds.map((planId) => (
                <td
                  key={planId}
                  className={cn(
                    "text-center px-2 py-2",
                    planId === "professional" && "bg-[#1f75fe]/3",
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
  );

  if (embedded) {
    return <div className="border-t border-[#e8e3d9] overflow-x-auto custom-scrollbar">{table}</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e3d9] bg-[#faf8f4]">
        <h3 className="text-body font-semibold text-[#0f172a]">Сравнение тарифов</h3>
      </div>
      {table}
    </div>
  );
}
