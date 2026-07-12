import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const STATS = [
  { label: "Доходы", value: "4.25M ₸" },
  { label: "Ожидается", value: "620K ₸" },
  { label: "Расходы", value: "1.12M ₸" },
];

const BARS = [
  { label: "Kaspi", h: 72 },
  { label: "Наличные", h: 48 },
  { label: "Терминал", h: 34 },
  { label: "Долг", h: 18 },
];

export function FinanceIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[5%] top-[14%]">Kaspi QR</FloatingBadge>
      <FloatingBadge className="right-[4%] top-[18%]" variant="solid">
        +12% к месяцу
      </FloatingBadge>
      <FloatingBadge className="right-[6%] bottom-[16%]" variant="muted">
        Наличные
      </FloatingBadge>

      <div className="absolute inset-x-[10%] top-[14%] grid grid-cols-3 gap-2">
        {STATS.map((stat) => (
          <IllustrationCard key={stat.label} className="p-2.5 text-center">
            <p className="text-[9px] text-[#64748b]">{stat.label}</p>
            <p className="text-[11px] font-bold text-[#1f75fe] mt-0.5">{stat.value}</p>
          </IllustrationCard>
        ))}
      </div>

      <IllustrationCard className="absolute left-1/2 bottom-[12%] w-[82%] -translate-x-1/2 p-3">
        <p className="text-[10px] font-semibold text-[#0f172a] mb-2">Как платят пациенты</p>
        <div className="flex items-end gap-2 h-16">
          {BARS.map((bar) => (
            <div key={bar.label} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t-md bg-[#1f75fe]/85"
                style={{ height: `${bar.h}%` }}
              />
              <span className="text-[8px] text-[#64748b] mt-1">{bar.label}</span>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}
