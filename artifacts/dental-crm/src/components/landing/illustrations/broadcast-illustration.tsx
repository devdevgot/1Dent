import { Megaphone } from "lucide-react";
import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const STATS = [
  { label: "Отправлено", value: "142" },
  { label: "Ответили", value: "38" },
  { label: "Записались", value: "12" },
];

export function BroadcastIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[5%] top-[12%]" variant="solid">
        Активна
      </FloatingBadge>
      <FloatingBadge className="right-[4%] top-[20%]" variant="muted">
        Repeat sale
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-[22%] w-[82%] -translate-x-1/2 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-8 h-8 rounded-xl bg-[#dbeafe] text-[#1f75fe] flex items-center justify-center">
            <Megaphone className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-[#0f172a]">Повторная продажа</p>
            <p className="text-[9px] text-[#64748b]">После завершения лечения</p>
          </div>
        </div>
        <p className="text-[10px] text-[#475569] leading-relaxed rounded-xl bg-[#eff6ff] p-2.5">
          Здравствуйте! Прошло 6 месяцев после лечения. Рекомендуем профилактический осмотр.
        </p>
      </IllustrationCard>

      <div className="absolute left-1/2 bottom-[10%] w-[82%] -translate-x-1/2 grid grid-cols-3 gap-2">
        {STATS.map((stat) => (
          <IllustrationCard key={stat.label} className="p-2 text-center">
            <p className="text-sm font-bold text-[#1f75fe]">{stat.value}</p>
            <p className="text-[8px] text-[#64748b]">{stat.label}</p>
          </IllustrationCard>
        ))}
      </div>
    </IllustrationCanvas>
  );
}
