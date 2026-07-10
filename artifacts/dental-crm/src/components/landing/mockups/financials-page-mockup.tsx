import { PagePreviewFrame } from "./page-preview-frame";

export function FinancialsPageMockup() {
  return (
    <PagePreviewFrame title="Финансы">
      <div className="p-3 space-y-2 bg-[#faf8f4] min-h-[220px]">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Доходы", value: "4 250 000 ₸", bg: "#f0fdf4", color: "#16a34a" },
            { label: "Расходы", value: "1 120 000 ₸", bg: "#fef2f2", color: "#dc2626" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-[#e8e3d9] p-2.5">
              <p className="text-[9px] text-[#64748b]">{s.label}</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-[#e8e3d9] p-2.5">
          <p className="text-[9px] font-semibold text-[#64748b] mb-2">Способы оплаты</p>
          <div className="flex gap-1 items-end h-12">
            {[
              { label: "Kaspi", h: 90, color: "#1f75fe" },
              { label: "Нал.", h: 45, color: "#16a34a" },
              { label: "Терм.", h: 30, color: "#d97706" },
            ].map((b) => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-md" style={{ height: `${b.h}%`, backgroundColor: b.color, opacity: 0.75 }} />
                <span className="text-[8px] text-[#94a3b8]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PagePreviewFrame>
  );
}
