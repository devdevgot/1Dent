/**
 * Default WhatsApp copy for Customer Care Chatbot.
 * Clinic overrides can be added later via settings / CRM UI.
 */

export type CareTemplateVars = {
  clinicName?: string;
  patientName?: string;
  time?: string;
  date?: string;
  doctorName?: string;
};

function fill(template: string, vars: CareTemplateVars): string {
  return template
    .replaceAll("{{clinic_name}}", vars.clinicName ?? "клинику")
    .replaceAll("{{patient_name}}", vars.patientName ?? "")
    .replaceAll("{{time}}", vars.time ?? "")
    .replaceAll("{{date}}", vars.date ?? "")
    .replaceAll("{{doctor_name}}", vars.doctorName ?? "");
}

const LEAD_NURTURE: [string, string, string] = [
  "Подобрать для вас удобное время? 😊\nЕсть свободные окна на сегодня и завтра.",
  "Напоминаю вам 😊\nМогу записать вас без ожидания.\nКогда вам будет удобно?",
  "Здравствуйте 😊\nВы интересовались приёмом.\nМогу записать вас на удобное время.\nКогда подойдёт?",
];

const REMINDER_24H =
  "Здравствуйте 😊\nНапоминаю, что вы записаны в {{clinic_name}}\n📅 Завтра\n⏰ {{time}}\nПодтвердите, пожалуйста, что придёте 👍";

const REMINDER_1H =
  "Здравствуйте 😊\nЖдём вас сегодня в {{time}} в {{clinic_name}}.\nЕсли не получится прийти — напишите заранее 🙏";

const NO_SHOW =
  "Здравствуйте 😊\nСегодня не дождались вас на приёме.\nМожем перенести на удобное время — напишите, когда вам комфортно.";

const POST_VISIT: [string, string] = [
  "Здравствуйте 😊\nКак вы себя чувствуете после приёма?\nЕсли есть вопросы или дискомфорт — обязательно напишите, мы на связи.",
  "Добрый день 😊\nХотели уточнить, всё ли у вас хорошо после лечения?",
];

const UPSELL =
  "Здравствуйте 😊\nЕсли нужно продолжить лечение или записаться на контрольный осмотр — подберём удобное время.\nКогда вам будет комфортно?";

export const customerCareTemplates = {
  leadNurture(step: number, vars: CareTemplateVars = {}): string {
    const idx = Math.min(Math.max(step, 1), 3) - 1;
    return fill(LEAD_NURTURE[idx]!, vars);
  },
  reminder24h(vars: CareTemplateVars): string {
    return fill(REMINDER_24H, vars);
  },
  reminder1h(vars: CareTemplateVars): string {
    return fill(REMINDER_1H, vars);
  },
  noShow(vars: CareTemplateVars = {}): string {
    return fill(NO_SHOW, vars);
  },
  postVisit(step: number, vars: CareTemplateVars = {}): string {
    const idx = Math.min(Math.max(step, 1), 2) - 1;
    return fill(POST_VISIT[idx]!, vars);
  },
  upsell(vars: CareTemplateVars = {}): string {
    return fill(UPSELL, vars);
  },
};
