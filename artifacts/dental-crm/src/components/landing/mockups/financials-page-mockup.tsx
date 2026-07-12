import { PagePreviewFrame } from "./page-preview-frame";

const PAYMENT_METHODS = [
  { label: "Kaspi QR", amount: 1_850_000, pct: 44, color: "#1f75fe" },
  { label: "Наличные", amount: 920_000, pct: 22, color: "#16a34a" },
  { label: "Терминал", amount: 580_000, pct: 14, color: "#d97706" },
];

function formatShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString("ru-RU");
}

export function FinancialsPageMockup() {
  return (
    <PagePreviewFrame title="Финансы">
      <div className="p-5 space-y-4 bg-white min-h-[240px]">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Доходы", value: "4.25M ₸", color: "#16a34a" },
            { label: "Ожидается", value: "620K ₸", color: "#d97706" },
            { label: "Расходы", value: "1.12M ₸", color: "#dc2626" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[#e8e3d9] p-3 bg-[#faf8f4]">
              <p className="text-[10px] text-[#64748b]">{stat.label}</p>
              <p className="text-sm font-bold tabular-nums mt-1" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#e8e3d9] p-4">
          <p className="text-xs font-semibold text-[#0f172a] mb-3">Как платят пациенты</p>
          <div className="space-y-2.5">
            {PAYMENT_METHODS.map((method) => (
              <div key={method.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#64748b]">{method.label}</span>
                  <span className="text-xs font-semibold text-[#0f172a]">{method.pct}%</span>
                </div>
                <div className="h-2 bg-[#faf8f4] rounded-full">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${method.pct}%`, backgroundColor: method.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PagePreviewFrame>
  );
}
