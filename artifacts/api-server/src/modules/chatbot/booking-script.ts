import type { ScriptMindMapData } from "./mindmap-utils";
import type { ChatbotState } from "./chatbot.types";

export function usesBookingFlow(mindMap: ScriptMindMapData | null | undefined): boolean {
  if (!mindMap?.nodes?.length) return true;
  return mindMap.nodes.some(
    (n) => n.id === "booking-root" || n.fsmState === "collect_qualification" || n.fsmState === "await_decision",
  );
}

function node(
  id: string,
  label: string,
  content: string,
  fsmState: ChatbotState,
  position: { x: number; y: number },
  isRoot?: boolean,
) {
  return { id, label, content, fsmState, position, ...(isRoot ? { isRoot: true } : {}) };
}

function edge(id: string, source: string, target: string, label?: string) {
  return { id, source, target, ...(label ? { label } : {}) };
}

/** Default 5-step booking script as mind map (Знакомство → Квалификация → Решение → Запись → Возражения). */
export function buildDefaultBookingMindMap(): ScriptMindMapData {
  const nodes = [
    node(
      "booking-root",
      "Запись клиента в стоматологию",
      "Главный сценарий записи пациента. Строго следуй этапам по порядку.",
      "greeting",
      { x: 0, y: 0 },
      true,
    ),
    node(
      "step1-intro",
      "1. Знакомство",
      "Поприветствуй от имени клиники {{clinic_name}}. Представься как AI-ассистент. Сообщи, что готовы помочь. Спроси причину обращения или нужную услугу.",
      "greeting",
      { x: -320, y: 120 },
    ),
    node(
      "step1-caries",
      "Лечение кариеса",
      "Пациент интересуется лечением кариеса. Уточни симптомы (боль, чувствительность). Не называй точную цену без осмотра — можно ориентир из прайса.",
      "collect_problem",
      { x: -560, y: 260 },
    ),
    node(
      "step1-hygiene",
      "Чистка зубов",
      "Пациент хочет профессиональную чистку. Уточни, была ли раньше гигиена, есть ли налёт/камень.",
      "collect_problem",
      { x: -400, y: 260 },
    ),
    node(
      "step1-whitening",
      "Отбеливание",
      "Пациент интересуется отбеливанием. Уточни ожидания и был ли опыт отбеливания.",
      "collect_problem",
      { x: -240, y: 260 },
    ),
    node(
      "step1-braces",
      "Брекеты",
      "Пациент интересуется брекетами/выравниванием. Уточни возраст (если ребёнок — уточни), были ли консультации ортодонта.",
      "collect_problem",
      { x: -80, y: 260 },
    ),
    node(
      "step1-implant",
      "Имплантация",
      "Пациент интересуется имплантацией. Уточни, есть ли снимок, сколько зубов нужно восстановить.",
      "collect_problem",
      { x: 80, y: 260 },
    ),
    node(
      "step1-prosthetics",
      "Протезирование",
      "Пациент интересуется протезированием/коронками. Уточни, какой зуб и был ли снимок.",
      "collect_problem",
      { x: 240, y: 260 },
    ),
    node(
      "step1-other",
      "Другая услуга",
      "Запрос нестандартный — уточни подробнее, что нужно пациенту.",
      "collect_problem",
      { x: 400, y: 260 },
    ),
    node(
      "step2-qualification",
      "2. Квалификация",
      "Уточни: что беспокоит? есть ли боль? дискомфорт? визит плановый или срочный? Задай 1–2 уточняющих вопроса, не перегружай.",
      "collect_qualification",
      { x: -320, y: 400 },
    ),
    node(
      "step2-branch",
      "Выбор филиала",
      "Предложи выбрать удобный филиал. Адреса, часы работы и контакты — ТОЛЬКО из материалов клиники (сайт/ссылки в настройках). Не придумывай адреса.",
      "collect_qualification",
      { x: -320, y: 540 },
    ),
    node(
      "step2-doctor",
      "Подбор врача",
      "Представь рекомендованного врача: имя, специализация, рейтинг, почему подходит (срочность, специализация, свободные слоты). Спроси, подходит ли врач. Если нет — предложи альтернативу из топ-3 по рейтингу.",
      "suggest_doctor",
      { x: -320, y: 620 },
    ),
    node(
      "step3-decision",
      "3. Принятие решения",
      "Кратко резюмируй запрос. Предложи запись к подобранному врачу. Спроси: готовы записаться сейчас, хотите подумать или пока не планируете?",
      "await_decision",
      { x: -320, y: 680 },
    ),
    node(
      "step3-ready",
      "Готов записаться",
      "Пациент готов — переходи к выбору даты и времени. Предложи ближайшие свободные слоты.",
      "collect_datetime",
      { x: -560, y: 820 },
    ),
    node(
      "step3-think",
      "Хочет подумать",
      "Пациент сомневается — мягко выясни причину (цена, страх, мало информации).",
      "handle_objections",
      { x: -320, y: 820 },
    ),
    node(
      "step3-refuse",
      "Отказывается",
      "Пациент отказался — поблагодари, оставь контакт, напомни об акциях, заверши диалог.",
      "done",
      { x: -80, y: 820 },
    ),
    node(
      "step4-booking",
      "4. Запись на приём",
      "Помоги выбрать дату и время. Предложи ближайшие свободные слоты врача. Подтверди выбранный филиал.",
      "collect_datetime",
      { x: -560, y: 960 },
    ),
    node(
      "step4-confirm",
      "Подтверждение записи",
      "Повтори дату, время, адрес филиала и услугу. Контакт клиники — из материалов (сайт/настройки). Напомни взять удостоверение личности. Поблагодари. Спроси, остались ли вопросы.",
      "confirm_appointment",
      { x: -560, y: 1100 },
    ),
    node(
      "step5-objections",
      "5. Работа с сомнениями",
      "Выясни причину: цена / страх процедуры / недостаток информации. Отработай мягко: осмотр и план лечения без обязательств. Скидки, «бесплатно» и рассрочку упоминай только если они есть в материалах клиники.",
      "handle_objections",
      { x: -320, y: 960 },
    ),
    node(
      "step6-reoffer",
      "Повторное предложение",
      "После отработки возражений — снова предложи запись и ближайшие даты.",
      "await_decision",
      { x: -320, y: 1100 },
    ),
    node(
      "step7-goodbye",
      "Завершение при отказе",
      "Поблагодари за обращение. Сообщи, что всегда готовы помочь. Оставь контактный номер. Кратко напомни об акциях. Попрощайся.",
      "done",
      { x: -80, y: 960 },
    ),
  ];

  const edges = [
    edge("e-root-intro", "booking-root", "step1-intro"),
    edge("e-intro-caries", "step1-intro", "step1-caries", "кариес"),
    edge("e-intro-hygiene", "step1-intro", "step1-hygiene", "чистка"),
    edge("e-intro-whitening", "step1-intro", "step1-whitening", "отбеливание"),
    edge("e-intro-braces", "step1-intro", "step1-braces", "брекеты"),
    edge("e-intro-implant", "step1-intro", "step1-implant", "имплант"),
    edge("e-intro-prosthetics", "step1-intro", "step1-prosthetics", "протез"),
    edge("e-intro-other", "step1-intro", "step1-other", "другое"),
    edge("e-caries-qual", "step1-caries", "step2-qualification"),
    edge("e-hygiene-qual", "step1-hygiene", "step2-qualification"),
    edge("e-whitening-qual", "step1-whitening", "step2-qualification"),
    edge("e-braces-qual", "step1-braces", "step2-qualification"),
    edge("e-implant-qual", "step1-implant", "step2-qualification"),
    edge("e-prosthetics-qual", "step1-prosthetics", "step2-qualification"),
    edge("e-other-qual", "step1-other", "step2-qualification"),
    edge("e-qual-branch", "step2-qualification", "step2-branch"),
    edge("e-branch-doctor", "step2-branch", "step2-doctor"),
    edge("e-doctor-decision", "step2-doctor", "step3-decision"),
    edge("e-decision-ready", "step3-decision", "step3-ready", "да"),
    edge("e-decision-think", "step3-decision", "step3-think", "подумать"),
    edge("e-decision-refuse", "step3-decision", "step3-refuse", "нет"),
    edge("e-ready-booking", "step3-ready", "step4-booking"),
    edge("e-booking-confirm", "step4-booking", "step4-confirm"),
    edge("e-think-objections", "step3-think", "step5-objections"),
    edge("e-objections-reoffer", "step5-objections", "step6-reoffer"),
    edge("e-refuse-goodbye", "step3-refuse", "step7-goodbye"),
  ];

  return { nodes, edges };
}

export const DEFAULT_BOOKING_MIND_MAP = buildDefaultBookingMindMap();

const HESITATE_KEYWORDS = [
  "подумать", "подумаю", "не уверен", "не уверена", "сомнева", "потом", "позже", "не знаю",
  "ойлан", "кейін", "білмеймін",
];
const REFUSE_KEYWORDS = [
  "не надо", "не буду", "отказываюсь", "не интересно", "не хочу", "не нужно",
  "керек емес", "жоқ", "болмайды",
];
const READY_KEYWORDS = [
  "запиш", "запис", "готов", "готова", "давайте", "хочу запис", "можно запис", "записывай",
  "жаз", "жазайық", "жазыл", "иә", "жарайды",
];

export function isReadyToBook(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return READY_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Short affirmative («да», «ок») — patient agrees to doctor/branch/booking step. */
export function isShortYes(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (/^(да|д|ага|угу|ок|ok|yes|иә|👍|✅)$/i.test(lower)) return true;
  return /^да[,.!?\s]/i.test(lower);
}

export function isHesitating(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return HESITATE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isRefusing(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return REFUSE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function detectObjectionType(text: string): "price" | "fear" | "info" | null {
  const lower = text.toLowerCase();
  if (/цен|дорог|стоим|сколько|қымбат|баға|price/.test(lower)) return "price";
  if (/страх|боюсь|боюс|больно|испуг|қорқ/.test(lower)) return "fear";
  if (/информ|не знаю|не понима|подробн|расскаж|неясн|түсінб/.test(lower)) return "info";
  return null;
}

export function buildDecisionFallback(): string {
  return "Готовы записаться на приём сейчас, хотите подумать или пока не планируете?";
}

export const BOOKING_STEP_LABELS: Record<string, string> = {
  greeting: "1. Знакомство",
  collect_problem: "1. Знакомство — услуга",
  collect_qualification: "2. Квалификация",
  suggest_doctor: "2. Подбор врача",
  await_decision: "3. Принятие решения",
  collect_datetime: "4. Запись на приём",
  confirm_appointment: "4. Подтверждение",
  handle_objections: "5. Работа с сомнениями",
  done: "Завершено",
};
