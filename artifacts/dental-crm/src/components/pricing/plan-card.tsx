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
        "relative bg-white rounded-2xl overflow-hidden transition-shadow",
        plan.recommended
          ? "border-2 border-[#1f75fe] shadow-lg shadow-[#1f75fe]/12 ring-1 ring-[#1f75fe]/10"
          : isCurrentPlan
            ? "border-2 border-[#16a34a] shadow-md"
            : "border border-[#e8e3d9] shadow-sm",
      )}
    >
      {plan.badge && !isCurrentPlan && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 bg-[#1f75fe] text-white text-micro font-bold uppercase tracking-wide px-3 py-1 rounded-b-xl shadow-sm">
            <Star className="w-3 h-3 fill-white" />
            {plan.badge}
          </span>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute top-0 right-0 z-10">
          <span className="inline-block bg-[#16a34a] text-white text-micro font-bold uppercase tracking-wide px-3 py-1 rounded-bl-xl">
            Текущий
          </span>
        </div>
      )}

      <div className={cn("p-5 bg-gradient-to-br", plan.gradient, plan.recommended && "pt-7")}>
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", plan.iconBg)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "font-bold text-[#0f172a] tracking-tight",
                plan.recommended ? "text-[20px]" : "text-[18px]",
              )}
            >
              {plan.name}
            </h3>
            <p className="text-caption text-[#64748b] mt-0.5 leading-snug">{plan.subtitle}</p>
            <p className="text-caption font-medium text-[#94a3b8] mt-1">{plan.audience}</p>
          </div>
        </div>

        <div className="mb-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-black text-[#0f172a] tabular-nums",
                plan.recommended ? "text-[28px]" : "text-[24px]",
              )}
            >
              {formatPlanPrice(plan.price)}
            </span>
            <span className="text-caption text-[#64748b] font-medium">₸ / мес</span>
          </div>
          {plan.deltaLabel && (
            <p className="text-caption text-[#64748b] mt-1">{plan.deltaLabel}</p>
          )}
        </div>

        {plan.includesFrom && (
          <div className="mt-4 mb-1 px-3 py-2 bg-white/70 border border-[#e8e3d9]/70 rounded-xl">
            <p className="text-caption text-[#64748b]">
              Всё из тарифа{" "}
              <span className="font-semibold text-[#0f172a]">{plan.includesFrom}</span>, плюс:
            </p>
          </div>
        )}

        <ul className="mt-4 space-y-2.5 mb-5">
          {plan.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: `${plan.accentColor}18` }}
              >
                <Check className="w-3 h-3" strokeWidth={3} style={{ color: plan.accentColor }} />
              </div>
              <span className="text-body text-[#0f172a] leading-snug">{highlight}</span>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          disabled={isCurrentPlan}
          onClick={onSelect}
          variant={plan.recommended && !isCurrentPlan ? "default" : "outline"}
          className={cn(
            "w-full rounded-full min-h-11 text-body font-semibold",
            isCurrentPlan && "bg-[#f0fdf4] text-[#16a34a] border-[#16a34a]/30 hover:bg-[#f0fdf4] cursor-default",
            !isCurrentPlan && !plan.recommended && "border-[#e8e3d9] text-[#0f172a] hover:bg-[#f1ede4]",
            plan.recommended && !isCurrentPlan && "shadow-md shadow-[#1f75fe]/20 hover:shadow-lg",
          )}
        >
          {isCurrentPlan ? "Текущий план" : plan.ctaLabel}
        </Button>
      </div>
    </div>
  );
}
