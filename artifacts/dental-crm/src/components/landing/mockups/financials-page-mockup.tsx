import { PagePreviewFrame } from "./page-preview-frame";

const PAYMENT_METHODS = [
  { label: "Kaspi QR", amount: 1_850_000, pct: 44, color: "#1f75fe" },
  { label: "Наличные", amount: 920_000, pct: 22, color: "#16a34a" },
  { label: "Терминал", amount: 580_000, pct: 14, color: "#d97706" },
  { label: "Kaspi Red", amount: 340_000, pct: 8, color: "#8b5cf6" },
  { label: "Долг", amount: 210_000, pct: 5, color: "#ef4444" },
];

const TOTAL_PAYMENTS = PAYMENT_METHODS.reduce((sum, item) => sum + item.amount, 0);
const MAX_BAR = Math.max(...PAYMENT_METHODS.map((item) => item.amount));

function formatShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString("ru-RU");
}

export function FinancialsPageMockup() {
  return (
    <PagePreviewFrame title="Финансы">
      <div className="p-3 space-y-2 bg-[#faf8f4] min-h-[260px]">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Доходы", value: "4.25M ₸", color: "#16a34a", bg: "#f0fdf4" },
            { label: "Ожидается", value: "620K ₸", color: "#d97706", bg: "#fef3c7" },
            { label: "Расходы", value: "1.12M ₸", color: "#dc2626", bg: "#fef2f2" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[#e8e3d9] p-2"
              style={{ backgroundColor: stat.bg }}
            >
              <p className="text-[8px] text-[#64748b] truncate">{stat.label}</p>
              <p className="text-[11px] font-bold tabular-nums truncate" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[#e8e3d9] p-2.5">
          <p className="text-[9px] font-semibold text-[#64748b] mb-2">Как платят пациенты?</p>
          <div className="flex items-center gap-3">
            <div
              className="relative w-[52px] h-[52px] shrink-0 rounded-full"
              style={{
                background: `conic-gradient(
                  #1f75fe 0% 44%,
                  #16a34a 44% 66%,
                  #d97706 66% 80%,
                  #8b5cf6 80% 88%,
                  #ef4444 88% 100%
                )`,
              }}
            >
              <div className="absolute inset-[6px] rounded-full bg-white flex flex-col items-center justify-center">
                <span className="text-[7px] text-[#94a3b8] leading-none">Всего</span>
                <span className="text-[8px] font-bold text-[#0f172a] leading-tight">
                  {formatShort(TOTAL_PAYMENTS)}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              {PAYMENT_METHODS.slice(0, 4).map((method) => (
                <div key={method.label} className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: method.color }}
                    />
                    <span className="text-[8px] text-[#64748b] truncate">{method.label}</span>
                  </div>
                  <span className="text-[8px] font-semibold text-[#0f172a] tabular-nums shrink-0">
                    {method.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e8e3d9] p-2.5">
          <p className="text-[9px] font-semibold text-[#64748b] mb-2">По способам оплаты</p>
          <div className="flex gap-1.5 items-end h-16">
            {PAYMENT_METHODS.map((method) => {
              const barHeight = Math.max(12, Math.round((method.amount / MAX_BAR) * 100));
              return (
                <div
                  key={method.label}
                  className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                >
                  <span className="text-[7px] font-semibold text-[#0f172a] tabular-nums mb-0.5">
                    {formatShort(method.amount)}
                  </span>
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${barHeight}%`,
                      backgroundColor: method.color,
                      opacity: 0.85,
                    }}
                  />
                  <span className="text-[7px] text-[#94a3b8] truncate w-full text-center mt-0.5">
                    {method.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e8e3d9] divide-y divide-[#e8e3d9]">
          {PAYMENT_METHODS.slice(0, 3).map((method) => (
            <div key={method.label} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: method.color }}
                />
                <span className="text-[9px] text-[#0f172a] truncate">{method.label}</span>
              </div>
              <span className="text-[9px] font-semibold text-[#16a34a] tabular-nums shrink-0">
                {method.amount.toLocaleString("ru-RU")} ₸
              </span>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}
