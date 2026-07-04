import { Check, Wrench } from "lucide-react";
import {
  formatPlanPrice,
  IMPLEMENTATION_FEE,
  IMPLEMENTATION_INCLUDES,
} from "@/lib/plans";

export function ImplementationFeeCard() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#e8e3d9] bg-[#faf8f4] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
          <Wrench className="w-4 h-4 text-[#1f75fe]" />
        </div>
        <div className="min-w-0">
          <p className="text-body font-bold text-[#0f172a]">Внедрение системы</p>
          <p className="text-caption text-[#64748b] mt-0.5">Разовый платёж при подключении</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-black text-[#0f172a] tabular-nums">
              {formatPlanPrice(IMPLEMENTATION_FEE)}
            </span>
            <span className="text-caption text-[#64748b] font-medium">₸</span>
          </div>
          <span className="text-micro font-bold uppercase tracking-wider text-[#1f75fe] bg-[#1f75fe]/10 px-2.5 py-1 rounded-full">
            один раз
          </span>
        </div>

        <ul className="space-y-2">
          {IMPLEMENTATION_INCLUDES.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-[#1f75fe]" strokeWidth={3} />
              </div>
              <span className="text-body text-[#0f172a] leading-snug">{item}</span>
            </li>
          ))}
        </ul>

        <p className="text-caption text-[#64748b] leading-relaxed pt-1 border-t border-[#e8e3d9]">
          Ежемесячная подписка по тарифу оплачивается отдельно — ниже выберите подходящий план.
        </p>
      </div>
    </div>
  );
}
