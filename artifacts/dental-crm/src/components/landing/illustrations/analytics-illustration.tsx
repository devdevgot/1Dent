import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const CHANNELS = [
  { label: "Instagram", pct: 38 },
  { label: "2GIS", pct: 27 },
  { label: "WhatsApp", pct: 22 },
  { label: "Другое", pct: 13 },
];

export function AnalyticsIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[4%] top-[14%]" variant="solid">
        +18% выручка
      </FloatingBadge>
      <FloatingBadge className="right-[4%] top-[18%]" variant="muted">
        2GIS
      </FloatingBadge>
      <FloatingBadge className="right-[6%] bottom-[14%]">
        Instagram
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-1/2 w-[82%] -translate-x-1/2 -translate-y-1/2 p-3">
        <p className="text-[10px] font-semibold text-[#1f75fe] mb-3">Источники пациентов</p>
        <div className="space-y-2">
          {CHANNELS.map((channel) => (
            <div key={channel.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#64748b]">{channel.label}</span>
                <span className="text-[10px] font-semibold text-[#0f172a]">{channel.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#eff6ff]">
                <div
                  className="h-2 rounded-full bg-[#1f75fe]"
                  style={{ width: `${channel.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}
