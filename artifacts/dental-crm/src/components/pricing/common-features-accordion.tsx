import { Check, Shield } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { COMMON_FEATURES, COMMON_FEATURES_SUMMARY } from "@/lib/plans";

export function CommonFeaturesAccordion() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
      <Accordion type="single" collapsible>
        <AccordionItem value="common" className="border-b-0">
          <AccordionTrigger className="px-4 py-4 hover:no-underline [&[data-state=open]]:pb-2">
            <div className="flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-[#f0fdf4] flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-[#16a34a]" />
              </div>
              <div>
                <p className="text-body font-bold text-[#0f172a]">Во все тарифы входит</p>
                <p className="text-caption text-[#64748b] font-normal mt-0.5 pr-2">
                  {COMMON_FEATURES_SUMMARY}
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <ul className="space-y-2 pt-1">
              {COMMON_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#f0fdf4] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#16a34a]" strokeWidth={3} />
                  </div>
                  <span className="text-body text-[#0f172a] leading-snug">{feature}</span>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
