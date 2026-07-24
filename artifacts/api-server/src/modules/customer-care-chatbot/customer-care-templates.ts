/**
 * Render WhatsApp copy for Customer Care from clinic prompt pack / defaults.
 */

import type { CustomerCarePromptPack } from "@workspace/db";
import { DEFAULT_CUSTOMER_CARE_PROMPTS, mergeCarePrompts } from "./customer-care-prompts";

export type CareTemplateVars = {
  clinicName?: string;
  patientName?: string;
  time?: string;
  date?: string;
  doctorName?: string;
  template?: string;
};

export function fillCareTemplate(template: string, vars: CareTemplateVars): string {
  return template
    .replaceAll("{{clinic_name}}", vars.clinicName ?? "клинику")
    .replaceAll("{{patient_name}}", vars.patientName ?? "")
    .replaceAll("{{time}}", vars.time ?? "")
    .replaceAll("{{date}}", vars.date ?? "")
    .replaceAll("{{doctor_name}}", vars.doctorName ?? "")
    .replaceAll("{{template}}", vars.template ?? "");
}

export function getCarePromptPack(partial?: Partial<CustomerCarePromptPack> | null): CustomerCarePromptPack {
  return mergeCarePrompts(partial);
}

export const customerCareTemplates = {
  leadNurture(step: number, vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    const idx = Math.min(Math.max(step, 1), 3) - 1;
    return fillCareTemplate(pack.leadNurtureTemplates[idx]!, vars);
  },
  leadNurturePrompt(step: number, vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    const idx = Math.min(Math.max(step, 1), 3) - 1;
    const template = pack.leadNurtureTemplates[idx]!;
    return fillCareTemplate(pack.leadNurturePrompts[idx]!, { ...vars, template });
  },
  reminder24h(vars: CareTemplateVars, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.reminder24hTemplate, vars);
  },
  reminder24hPrompt(vars: CareTemplateVars, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.reminder24hPrompt, { ...vars, template: pack.reminder24hTemplate });
  },
  reminder1h(vars: CareTemplateVars, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.reminder1hTemplate, vars);
  },
  reminder1hPrompt(vars: CareTemplateVars, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.reminder1hPrompt, { ...vars, template: pack.reminder1hTemplate });
  },
  noShow(vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.noShowTemplate, vars);
  },
  noShowPrompt(vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.noShowPrompt, { ...vars, template: pack.noShowTemplate });
  },
  postVisit(step: number, vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    const idx = Math.min(Math.max(step, 1), 2) - 1;
    return fillCareTemplate(pack.postVisitTemplates[idx]!, vars);
  },
  postVisitPrompt(step: number, vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    const idx = Math.min(Math.max(step, 1), 2) - 1;
    return fillCareTemplate(pack.postVisitPrompts[idx]!, {
      ...vars,
      template: pack.postVisitTemplates[idx]!,
    });
  },
  upsell(vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.upsellTemplate, vars);
  },
  upsellPrompt(vars: CareTemplateVars = {}, pack: CustomerCarePromptPack = DEFAULT_CUSTOMER_CARE_PROMPTS): string {
    return fillCareTemplate(pack.upsellPrompt, { ...vars, template: pack.upsellTemplate });
  },
};
