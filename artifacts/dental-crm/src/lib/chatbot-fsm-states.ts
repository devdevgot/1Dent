export const CHATBOT_FSM_STATES = [
  { value: "", label: "— не привязан —" },
  { value: "greeting", label: "Приветствие" },
  { value: "collect_iin", label: "ИИН" },
  { value: "collect_name", label: "Имя" },
  { value: "collect_phone", label: "Телефон" },
  { value: "collect_problem", label: "Выяснение проблемы" },
  { value: "suggest_doctor", label: "Подбор врача" },
  { value: "manage_appointment", label: "Управление записью" },
  { value: "show_slots", label: "Выбор слота" },
  { value: "collect_datetime", label: "Дата и время" },
  { value: "collect_branch", label: "Филиал" },
  { value: "confirm_appointment", label: "Подтверждение" },
  { value: "dental_qa", label: "Вопросы по лечению" },
  { value: "done", label: "Завершено" },
  { value: "human_takeover", label: "Оператор" },
  { value: "reactivation", label: "Реактивация" },
] as const;

export const FSM_STATE_LABELS: Record<string, string> = Object.fromEntries(
  CHATBOT_FSM_STATES.filter((s) => s.value).map((s) => [s.value, s.label]),
);

export type PlaygroundFsmState =
  | "greeting"
  | "collect_problem"
  | "suggest_doctor"
  | "collect_name"
  | "collect_datetime"
  | "collect_branch"
  | "done";

export function nextPlaygroundFsmState(
  current: PlaygroundFsmState,
  userText: string,
): PlaygroundFsmState {
  const t = userText.trim().toLowerCase();
  const yes = /^(да|иә|иа|ия|yes|жарайды|ок|ok|ага)/i.test(t);
  const no = /^(нет|жоқ|жок|no)/i.test(t);

  switch (current) {
    case "greeting":
      return "collect_problem";
    case "collect_problem":
      return "suggest_doctor";
    case "suggest_doctor":
      if (yes) return "collect_name";
      if (no) return "collect_problem";
      return current;
    case "collect_name":
      return "collect_datetime";
    case "collect_datetime":
      return "collect_branch";
    case "collect_branch":
      return "done";
    default:
      return current;
  }
}

export function guessFsmStateFromLabel(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.includes("привет")) return "greeting";
  if (l.includes("иин")) return "collect_iin";
  if (l.includes("имя") || l.includes("обращ")) return "collect_name";
  if (l.includes("телефон")) return "collect_phone";
  if (l.includes("проблем") || l.includes("выявлен") || l.includes("симптом") || l.includes("боль")) return "collect_problem";
  if (l.includes("врач") || l.includes("специалист") || l.includes("подбор")) return "suggest_doctor";
  if (l.includes("дата") || l.includes("время") || l.includes("слот")) return "collect_datetime";
  if (l.includes("филиал") || l.includes("адрес")) return "collect_branch";
  if (l.includes("подтверж")) return "confirm_appointment";
  if (l.includes("оператор") || l.includes("менеджер")) return "human_takeover";
  if (l.includes("реактивац") || l.includes("повторн")) return "reactivation";
  if (l.includes("заверш") || l.includes("прощан")) return "done";
  return undefined;
}
