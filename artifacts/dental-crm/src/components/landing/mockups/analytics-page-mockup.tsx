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
      <div className="p-5 bg-white min-h-[240px]">
        <p className="text-xs font-semibold text-[#0f172a] mb-4">Источники пациентов</p>
        <div className="space-y-3">
          {channels.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-[#64748b]">{c.label}</span>
                <span className="text-xs font-semibold text-[#0f172a]">{c.pct}%</span>
              </div>
              <div className="h-2 bg-[#faf8f4] rounded-full">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}
