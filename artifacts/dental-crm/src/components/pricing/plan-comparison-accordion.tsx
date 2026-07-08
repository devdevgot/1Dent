import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PlanComparisonTable } from "@/components/pricing/plan-comparison-table";

export function PlanComparisonAccordion() {
  return (
    <Accordion type="single" collapsible className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <AccordionItem value="compare" className="border-b-0">
        <AccordionTrigger className="px-4 py-3.5 hover:no-underline [&[data-state=open]]:pb-2">
          <div className="text-left">
            <p className="text-sm font-semibold text-[#0f172a]">Подробное сравнение тарифов</p>
            <p className="text-xs text-[#64748b] font-normal mt-0.5">
              Лимиты и возможности START · PRO · ENT
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-0 pt-0">
          <PlanComparisonTable embedded />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
