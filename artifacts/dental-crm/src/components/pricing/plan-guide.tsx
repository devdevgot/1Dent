import { Star } from "lucide-react";
import { PLAN_GUIDE } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function PlanGuide() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 space-y-3">
      <p className="text-caption font-semibold text-[#64748b] uppercase tracking-wider px-0.5">
        Какой план выбрать?
      </p>
      <div className="space-y-2">
        {PLAN_GUIDE.map((item) => (
          <div
            key={item.plan}
            className={cn(
              "flex items-start gap-3 rounded-xl px-3 py-2.5",
              item.plan === "professional"
                ? "bg-[#1f75fe]/8 border border-[#1f75fe]/20"
                : "bg-[#faf8f4]",
            )}
          >
            <span
              className={cn(
                "shrink-0 text-caption font-bold uppercase tracking-wide mt-0.5 min-w-[5.5rem]",
                item.plan === "professional" ? "text-[#1f75fe]" : "text-[#0f172a]",
              )}
            >
              {item.label}
              {item.plan === "professional" && (
                <Star className="inline w-3 h-3 ml-0.5 -mt-0.5 fill-[#1f75fe] text-[#1f75fe]" />
              )}
            </span>
            <span className="text-body text-[#64748b] leading-snug">{item.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
