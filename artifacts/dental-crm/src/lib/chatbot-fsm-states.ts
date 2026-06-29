/** FSM labels aligned with server mindmap-utils / chatbot.types */
export const CHATBOT_FSM_STATES = [
  { value: "", label: "— не привязан —" },
  { value: "greeting", label: "Приветствие" },
  { value: "collect_iin", label: "ИИН" },
  { value: "collect_name", label: "Имя" },
  { value: "collect_phone", label: "Телефон" },
  { value: "collect_problem", label: "1. Знакомство — услуга" },
  { value: "collect_qualification", label: "2. Квалификация" },
  { value: "suggest_doctor", label: "2. Подбор врача (рейтинг)" },
  { value: "manage_appointment", label: "Управление записью" },
  { value: "show_slots", label: "Выбор слота" },
  { value: "await_decision", label: "3. Принятие решения" },
  { value: "collect_datetime", label: "4. Запись на приём" },
  { value: "collect_branch", label: "Филиал" },
  { value: "handle_objections", label: "5. Работа с сомнениями" },
  { value: "confirm_appointment", label: "4. Подтверждение" },
  { value: "dental_qa", label: "Вопросы по лечению" },
  { value: "done", label: "Завершено" },
  { value: "human_takeover", label: "Оператор" },
  { value: "reactivation", label: "Реактивация" },
] as const;

export const FSM_STATE_LABELS: Record<string, string> = Object.fromEntries(
  CHATBOT_FSM_STATES.filter((s) => s.value).map((s) => [s.value, s.label]),
);

export const PLAYGROUND_SCENARIO_LABELS: Record<string, string> = {
  new_patient: "Новый пациент",
  returning_no_appt: "Постоянный клиент (без записи)",
  returning_with_appt: "Есть предстоящая запись",
  wants_existing_appt: "«Моя запись» (новый номер)",
  post_op_monitoring: "После операции",
  repeat_sale: "Повторная продажа",
  reactivation: "Реактивация no-show",
};

export function guessFsmStateFromLabel(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.includes("привет")) return "greeting";
  if (l.includes("иин")) return "collect_iin";
  if (l.includes("имя") || l.includes("обращ")) return "collect_name";
  if (l.includes("телефон")) return "collect_phone";
  if (l.includes("проблем") || l.includes("выявлен") || l.includes("симптом") || l.includes("боль") || l.includes("знаком")) return "collect_problem";
  if (l.includes("квалиф") || l.includes("уточн") || l.includes("филиал")) return "collect_qualification";
  if (l.includes("врач") || l.includes("специалист") || l.includes("подбор")) return "suggest_doctor";
  if (l.includes("решени") || l.includes("готов") || l.includes("подумать")) return "await_decision";
  if (l.includes("возраж") || l.includes("сомнен") || l.includes("страх") || l.includes("рассроч")) return "handle_objections";
  if (l.includes("дата") || l.includes("время") || l.includes("слот")) return "collect_datetime";
  if (l.includes("филиал") || l.includes("адрес")) return "collect_branch";
  if (l.includes("подтверж")) return "confirm_appointment";
  if (l.includes("оператор") || l.includes("менеджер")) return "human_takeover";
  if (l.includes("реактивац") || l.includes("повторн")) return "reactivation";
  if (l.includes("заверш") || l.includes("прощан")) return "done";
  return undefined;
}
