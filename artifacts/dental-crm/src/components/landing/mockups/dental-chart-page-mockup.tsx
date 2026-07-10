import { FdiChart, type ToothCondition } from "../dental-chart/fdi-chart";
import { PagePreviewFrame } from "./page-preview-frame";

const DEMO_TEETH = new Map<number, ToothCondition>([
  [11, "crown"],
  [12, "cavity"],
  [16, "root_canal"],
  [21, "treated"],
  [24, "implant"],
  [36, "extraction_needed"],
  [37, "missing"],
]);

export function DentalChartPageMockup() {
  return (
    <PagePreviewFrame title="Зубная карта FDI">
      <div className="p-2 bg-white min-h-[220px] flex items-center justify-center">
        <FdiChart teethData={DEMO_TEETH} selectedFdi={null} className="border-0 shadow-none p-1 scale-95" />
      </div>
    </PagePreviewFrame>
  );
}
