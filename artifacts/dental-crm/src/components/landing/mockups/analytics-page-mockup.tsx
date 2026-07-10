import { PagePreviewFrame } from "./page-preview-frame";

const channels = [
  { label: "Instagram", pct: 38, color: "#e91e8c" },
  { label: "2GIS", pct: 27, color: "#1f75fe" },
  { label: "WhatsApp", pct: 22, color: "#22c55e" },
  { label: "Другое", pct: 13, color: "#94a3b8" },
];

export function AnalyticsPageMockup() {
  return (
    <PagePreviewFrame title="Аналитика">
      <div className="p-3 bg-[#faf8f4] min-h-[220px]">
        <p className="text-[9px] font-semibold text-[#64748b] uppercase mb-2">Источники пациентов</p>
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-[#64748b]">{c.label}</span>
                <span className="text-[10px] font-bold text-[#0f172a]">{c.pct}%</span>
              </div>
              <div className="h-1.5 bg-white rounded-full border border-[#e8e3d9]">
                <div className="h-1.5 rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}
