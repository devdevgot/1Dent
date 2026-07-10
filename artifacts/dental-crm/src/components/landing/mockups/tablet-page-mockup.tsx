import { TabletDentalChart } from "@/pages/slash-tablet/tablet-dental-chart";
import { PLAN_STAGES, PATIENTS } from "@/pages/slash-tablet/mock-data";
import { PagePreviewFrame } from "./page-preview-frame";

const patient = PATIENTS[0]!;
const stages = PLAN_STAGES["p-1"]?.slice(0, 2) ?? [];

export function TabletPageMockup() {
  return (
    <PagePreviewFrame title="Slash Tablet">
      <div className="p-2 bg-[#faf8f4] min-h-[220px]">
        <div className="scale-[0.85] origin-top">
          <TabletDentalChart teeth={patient.teeth} selectedFdi={null} planFdis={new Set([16, 24])} />
        </div>
        <div className="space-y-1 px-1">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-2 rounded-lg px-2 py-1 bg-white border border-[#e8e3d9]">
              <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: stage.bg, color: stage.color }}>
                {stage.indexNumber}
              </span>
              <span className="text-[10px] font-medium text-[#0f172a] truncate">{stage.label}</span>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}
