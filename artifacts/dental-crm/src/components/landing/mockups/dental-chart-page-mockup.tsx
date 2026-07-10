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
      <div className="landing-mockup-scroll p-2 bg-white min-h-[200px] flex items-center justify-center">
        <div className="min-w-[260px] sm:min-w-0 scale-[0.9] sm:scale-100 origin-top">
          <FdiChart teethData={DEMO_TEETH} selectedFdi={null} className="border-0 shadow-none p-1" />
        </div>
      </div>
    </PagePreviewFrame>
  );
}
