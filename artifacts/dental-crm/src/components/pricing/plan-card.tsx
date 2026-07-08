import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPlanPrice, type PlanConfig } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  plan: PlanConfig;
  isCurrentPlan: boolean;
  onSelect: () => void;
}

export function PlanCard({ plan, isCurrentPlan, onSelect }: PlanCardProps) {
  const Icon = plan.icon;

  return (
    <div
      className={cn(
        "relative bg-white rounded-2xl overflow-hidden",
        plan.recommended
          ? "border-2 border-[#1f75fe]/80 shadow-sm"
          : isCurrentPlan
            ? "border-2 border-[#16a34a]/70"
            : "border border-[#e8e3d9]",
      )}
    >
      {plan.badge && !isCurrentPlan && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center gap-1 bg-[#1f75fe] text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            <Star className="w-3 h-3 fill-white" />
            {plan.badge}
          </span>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-block bg-[var(--success)] text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            Текущий
          </span>
        </div>
      )}

      <div className={cn("p-4", plan.recommended && "bg-[#1f75fe]/[0.03]")}>
        <div className="flex items-center gap-3 mb-3 pr-20">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", plan.iconBg)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#0f172a]">{plan.name}</h3>
            <p className="text-xs text-[#64748b] mt-0.5">{plan.audience}</p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-[22px] font-bold text-[#0f172a] tabular-nums">
            {formatPlanPrice(plan.price)}
          </span>
          <span className="text-xs text-[#64748b]">₸ / мес</span>
        </div>

        <ul className="space-y-1.5 mb-4">
          {plan.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <Check
                className="w-3.5 h-3.5 shrink-0 mt-0.5"
                strokeWidth={2.5}
                style={{ color: plan.accentColor }}
              />
              <span className="text-xs text-[#475569] leading-snug">{highlight}</span>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          disabled={isCurrentPlan}
          onClick={onSelect}
          variant={plan.recommended && !isCurrentPlan ? "default" : "outline"}
          className={cn(
            "w-full rounded-full h-10 text-xs font-semibold",
            isCurrentPlan && "bg-[#f0fdf4] text-[#16a34a] border-[#16a34a]/30 hover:bg-[#f0fdf4] cursor-default",
            !isCurrentPlan && !plan.recommended && "border-[#e8e3d9] text-[#0f172a] hover:bg-[#faf8f4]",
          )}
        >
          {isCurrentPlan ? "Текущий план" : plan.ctaLabel}
        </Button>
      </div>
    </div>
  );
}
