import { KZ_UTC_OFFSET_LABEL } from "./almaty-time";
import type { ChatbotState } from "./chatbot.types";

export interface ChatbotPromptFacts {
  clinicName: string;
  nowContext: string;
  officialBranches?: string[];
  patientRequest?: string;
  urgency?: string;
  suggestedDoctor?: { name: string; specialty?: string | null; rankPercent?: number };
  alternativeDoctor?: { name: string; rankPercent?: number };
  slots?: string[];
  knowledgeSnippet?: string;
  priceSnippet?: string;
  selectedBranch?: string;
  patientName?: string;
}

export interface BuildChatbotPromptOpts {
  fsmState: ChatbotState;
  channel?: "playground" | "whatsapp";
  facts: ChatbotPromptFacts;
  task: string;
  stepInstructions?: { general?: string; state?: string };
  mindMapCompactPath?: string;
  activeMindMapNode?: { label: string; content?: string; fsmState?: string };
  kazakhNote?: boolean;
  iinRule?: string;
}

export interface BuildTaskForStateCtx {
  qualificationPhase?: "symptoms" | "branch";
  patientName?: string;
  isReturningPatient?: boolean;
  objectionType?: "price" | "fear" | "info";
  decisionOutcome?: "ready" | "hesitating" | "refused";
  hasSelectedBranch?: boolean;
  hasSuggestedDoctor?: boolean;
}

const STATE_LABELS: Record<ChatbotState, string> = {
  greeting: "Приветствие",
  collect_iin: "Сбор ИИН",
  collect_name: "Сбор имени",
  collect_phone: "Сбор телефона",
  collect_problem: "Причина обращения",
  collect_qualification: "Квалификация",
  suggest_doctor: "Подбор врача",
  manage_appointment: "Управление записью",
  show_slots: "Показ слотов",
  collect_datetime: "Выбор даты и времени",
  collect_branch: "Выбор филиала",
  await_decision: "Решение пациента",
  handle_objections: "Работа с возражениями",
  confirm_appointment: "Подтверждение записи",
  dental_qa: "Вопросы о стоматологии",
  collect_review: "Сбор отзыва",
  done: "Завершение",
  human_takeover: "Передача оператору",
  reactivation: "Реактивация",
};

const DEFAULT_IIN_RULE_COLLECT =
  "Пациент хочет управлять существующей записью — попроси ввести ИИН (12 цифр).";
const DEFAULT_IIN_RULE_OTHER =
  "НИ ПРИ КАКИХ УСЛОВИЯХ не проси ИИН, удостоверение или любой идентификатор в начале диалога — пациент уже идентифицирован по номеру WhatsApp.";

const KAZAKH_NOTE =
  "Пациент может писать на казахском или русском. Отвечай строго на том языке, на котором пишет пациент.";

function resolveIinRule(fsmState: ChatbotState, override?: string): string {
  if (override?.trim()) return override.trim();
  return fsmState === "collect_iin" ? DEFAULT_IIN_RULE_COLLECT : DEFAULT_IIN_RULE_OTHER;
}

function channelNote(channel: "playground" | "whatsapp"): string {
  return channel === "playground"
    ? "Сейчас ТЕСТОВЫЙ РЕЖИМ (симуляция для проверки скрипта)."
    : "Сейчас реальный диалог с пациентом в WhatsApp.";
}

function buildRoleSection(clinicName: string, channel: "playground" | "whatsapp"): string {
  return [
    "=== ROLE ===",
    `Ты — AI-ассистент стоматологической клиники «${clinicName}».`,
    channelNote(channel),
  ].join("\n");
}

function buildBehaviorSection(clinicName: string, iinRule: string): string {
  const rules = [
    iinRule,
    "Не спрашивай имя или телефон в начале диалога — они собираются только при оформлении записи.",
    `Ты представляешь клинику «${clinicName}», но НЕ являешься клиникой. Правильно: «Я — AI-ассистент клиники «${clinicName}»».`,
    "Не повторяй приветствие, название клиники или один и тот же вопрос дважды в одном ответе.",
    "Строго следуй этапам скрипта: знакомство → квалификация (симптомы → филиал) → подбор врача → решение → запись или возражения.",
    "Используй только факты из блока FACTS — врачей, филиалы, цены и материалы клиники. Не придумывай адреса, врачей и акции.",
    `Все даты и время — только в часовом поясе Казахстана (${KZ_UTC_OFFSET_LABEL}). Не предлагай прошедшее время. Филиал уже выбран — не спрашивай его повторно.`,
    "Отвечай коротко: один вопрос за раз, мягко веди к записи, без давления. Скидки и «бесплатно» — только если явно указаны в материалах.",
  ];

  return ["=== BEHAVIOR ===", ...rules.map((rule, index) => `${index + 1}. ${rule}`)].join("\n");
}

function buildStepSection(
  fsmState: ChatbotState,
  opts: Pick<
    BuildChatbotPromptOpts,
    "mindMapCompactPath" | "activeMindMapNode" | "stepInstructions"
  >,
): string {
  const lines = [
    "=== STEP ===",
    `Этап FSM: ${fsmState} (${STATE_LABELS[fsmState]})`,
  ];

  if (opts.mindMapCompactPath?.trim()) {
    lines.push(opts.mindMapCompactPath.trim());
  }

  if (opts.activeMindMapNode) {
    const node = opts.activeMindMapNode;
    let nodeLine = `Активный узел скрипта: «${node.label}»`;
    if (node.fsmState) nodeLine += ` [${node.fsmState}]`;
    lines.push(nodeLine);
    if (node.content?.trim()) {
      lines.push(`Инструкция узла: ${node.content.trim()}`);
    }
  }

  if (opts.stepInstructions?.general?.trim()) {
    lines.push(`Дополнительные инструкции клиники: ${opts.stepInstructions.general.trim()}`);
  }
  if (opts.stepInstructions?.state?.trim()) {
    lines.push(`Инструкции для этапа «${fsmState}»: ${opts.stepInstructions.state.trim()}`);
  }

  return lines.join("\n");
}

function buildOutputSection(kazakhNote?: boolean): string {
  const lines = [
    "=== OUTPUT ===",
    "Ответь обычным текстом: 1–2 коротких предложения, без markdown и длинных списков.",
    "Один вопрос за раз. Без вступлений, повторов и «воды».",
  ];
  if (kazakhNote) {
    lines.push(KAZAKH_NOTE);
  }
  return lines.join("\n");
}

/** Filter facts to only those relevant for the current FSM state. */
export function filterFactsForState(
  facts: ChatbotPromptFacts,
  state: ChatbotState,
): ChatbotPromptFacts {
  const base: ChatbotPromptFacts = {
    clinicName: facts.clinicName,
    nowContext: facts.nowContext,
  };

  switch (state) {
    case "greeting":
      return { ...base, patientName: facts.patientName };
    case "collect_iin":
    case "collect_name":
    case "collect_phone":
      return { ...base, patientName: facts.patientName, patientRequest: facts.patientRequest };
    case "collect_problem":
      return {
        ...base,
        patientName: facts.patientName,
        patientRequest: facts.patientRequest,
        knowledgeSnippet: facts.knowledgeSnippet,
      };
    case "collect_qualification":
    case "collect_branch":
      return {
        ...base,
        patientName: facts.patientName,
        patientRequest: facts.patientRequest,
        urgency: facts.urgency,
        officialBranches: facts.officialBranches,
        selectedBranch: facts.selectedBranch,
        knowledgeSnippet: facts.knowledgeSnippet,
        priceSnippet: facts.priceSnippet,
      };
    case "suggest_doctor":
      return {
        ...base,
        patientRequest: facts.patientRequest,
        urgency: facts.urgency,
        suggestedDoctor: facts.suggestedDoctor,
        alternativeDoctor: facts.alternativeDoctor,
        slots: facts.slots,
        selectedBranch: facts.selectedBranch,
      };
    case "await_decision":
    case "handle_objections":
      return {
        ...base,
        patientRequest: facts.patientRequest,
        suggestedDoctor: facts.suggestedDoctor,
        alternativeDoctor: facts.alternativeDoctor,
        selectedBranch: facts.selectedBranch,
        priceSnippet: facts.priceSnippet,
        knowledgeSnippet: facts.knowledgeSnippet,
      };
    case "show_slots":
    case "collect_datetime":
      return {
        ...base,
        suggestedDoctor: facts.suggestedDoctor,
        slots: facts.slots,
        selectedBranch: facts.selectedBranch,
        patientRequest: facts.patientRequest,
      };
    case "confirm_appointment":
    case "manage_appointment":
      return {
        ...base,
        patientName: facts.patientName,
        patientRequest: facts.patientRequest,
        suggestedDoctor: facts.suggestedDoctor,
        slots: facts.slots,
        selectedBranch: facts.selectedBranch,
      };
    case "dental_qa":
      return {
        ...base,
        patientRequest: facts.patientRequest,
        knowledgeSnippet: facts.knowledgeSnippet,
        priceSnippet: facts.priceSnippet,
        officialBranches: facts.officialBranches,
      };
    case "reactivation":
      return {
        ...base,
        patientName: facts.patientName,
        patientRequest: facts.patientRequest,
        suggestedDoctor: facts.suggestedDoctor,
      };
    case "collect_review":
    case "done":
    case "human_takeover":
      return {
        ...base,
        patientName: facts.patientName,
        patientRequest: facts.patientRequest,
        suggestedDoctor: facts.suggestedDoctor,
        selectedBranch: facts.selectedBranch,
      };
    default:
      return { ...facts };
  }
}

function formatDoctorFact(
  doctor: NonNullable<ChatbotPromptFacts["suggestedDoctor"]>,
  label: string,
): string {
  const parts = [label, doctor.name];
  if (doctor.specialty) parts.push(`специализация: ${doctor.specialty}`);
  if (doctor.rankPercent != null && doctor.rankPercent >= 55) {
    parts.push(`рейтинг: ${doctor.rankPercent}/100`);
  }
  return parts.join(", ");
}

/** Render the dynamic FACTS block for the prompt. */
export function buildFactsBlock(facts: ChatbotPromptFacts, state: ChatbotState): string {
  const filtered = filterFactsForState(facts, state);
  const lines: string[] = ["=== FACTS ===", filtered.nowContext];

  if (filtered.patientName) {
    lines.push(`Имя пациента: ${filtered.patientName}`);
  }
  if (filtered.patientRequest) {
    lines.push(`Запрос пациента: «${filtered.patientRequest}»`);
  }
  if (filtered.urgency) {
    const urgencyLabel =
      filtered.urgency === "urgent"
        ? "срочно"
        : filtered.urgency === "routine"
          ? "планово"
          : filtered.urgency;
    lines.push(`Срочность: ${urgencyLabel}`);
  }
  if (filtered.selectedBranch) {
    lines.push(`Выбранный филиал: ${filtered.selectedBranch}`);
  }
  if (filtered.officialBranches && filtered.officialBranches.length > 0) {
    lines.push(
      "Официальные филиалы (единственный допустимый список):",
      ...filtered.officialBranches.map((branch) => `• ${branch}`),
    );
  }
  if (filtered.suggestedDoctor) {
    lines.push(formatDoctorFact(filtered.suggestedDoctor, "Рекомендованный врач:"));
  }
  if (filtered.alternativeDoctor) {
    lines.push(formatDoctorFact(filtered.alternativeDoctor, "Альтернативный врач:"));
  }
  if (filtered.slots && filtered.slots.length > 0) {
    lines.push(`Свободные слоты: ${filtered.slots.join(", ")}`);
  } else if (
    (state === "suggest_doctor" || state === "collect_datetime" || state === "show_slots") &&
    filtered.suggestedDoctor
  ) {
    lines.push("Свободные слоты: нет на ближайшие 7 дней");
  }
  if (filtered.priceSnippet?.trim()) {
    lines.push(`Прайс (релевантные позиции): ${filtered.priceSnippet.trim()}`);
  }
  if (filtered.knowledgeSnippet?.trim()) {
    lines.push(`Материалы клиники: ${filtered.knowledgeSnippet.trim()}`);
  }

  return lines.join("\n");
}

const TASK_TEMPLATES: Partial<Record<ChatbotState, string>> = {
  greeting:
    "Поприветствуй пациента и мягко узнай причину обращения или чем можешь помочь. Не перегружай первое сообщение.",
  collect_problem:
    "Узнай, что беспокоит пациента и к какой услуге относится запрос. Один короткий уточняющий вопрос.",
  suggest_doctor:
    "Представь рекомендованного врача: имя, рейтинг (если есть) и 1–2 причины выбора. Спроси, подходит ли врач.",
  await_decision:
    "Спроси, готов ли пациент записаться. Если готов — переходи к выбору времени; если сомневается — выясни причину.",
  collect_datetime:
    "Предложи удобное время из свободных слотов. Если пациент назвал время — подтверди с полной датой из списка.",
  handle_objections:
    "Отработай возражение мягко и предложи один конкретный следующий шаг — обычно запись на осмотр.",
  confirm_appointment:
    "Кратко подтверди детали записи (врач, дата, время, филиал) и попроси подтверждение.",
  done: "Поблагодари за обращение и заверши диалог тепло. Не задавай новых вопросов.",
};

function buildQualificationTask(ctx: BuildTaskForStateCtx): string {
  if (ctx.qualificationPhase === "branch" || ctx.hasSelectedBranch) {
    if (ctx.hasSelectedBranch) {
      return "Филиал уже известен — не спрашивай его снова. Уточни симптомы или срочность, если нужно, и веди к подбору врача.";
    }
    return "Спроси, какой филиал удобнее — только из официального списка. Один короткий вопрос.";
  }
  return "Уточни симптомы: есть ли боль или дискомфорт, насколько срочно. Один вопрос за раз.";
}

function buildObjectionTask(ctx: BuildTaskForStateCtx): string {
  switch (ctx.objectionType) {
    case "price":
      return "Возражение по цене: объясни, что точную стоимость назовёт врач после осмотра, предложи запись на осмотр.";
    case "fear":
      return "Возражение из-за страха: успокой — первый визит только осмотр и план, без лечения. Предложи запись на осмотр.";
    case "info":
      return "Не хватает информации: ответь из материалов клиники и предложи осмотр, где врач всё объяснит.";
    default:
      return TASK_TEMPLATES.handle_objections!;
  }
}

/** Default TASK instruction for an FSM state (Russian). */
export function buildTaskForState(state: ChatbotState, ctx: BuildTaskForStateCtx = {}): string {
  if (state === "collect_qualification") {
    return buildQualificationTask(ctx);
  }
  if (state === "handle_objections") {
    return buildObjectionTask(ctx);
  }

  const template = TASK_TEMPLATES[state];
  if (template) {
    if (state === "greeting" && ctx.isReturningPatient && ctx.patientName) {
      return `Поприветствуй постоянного пациента ${ctx.patientName} тепло и предложи записаться или уточни запрос.`;
    }
    if (state === "collect_problem" && ctx.isReturningPatient && ctx.patientName) {
      return `Пациент ${ctx.patientName} — постоянный клиент. Поприветствуй тепло и узнай, чем помочь (лечение, чистка, консультация).`;
    }
    if (state === "await_decision" && ctx.decisionOutcome === "ready") {
      return "Пациент готов записаться — предложи выбрать удобное время из свободных слотов.";
    }
    if (state === "suggest_doctor" && ctx.hasSuggestedDoctor === false) {
      return "Врачей по запросу не найдено — извинись и предложи оставить контакт или уточни запрос.";
    }
    return template;
  }

  switch (state) {
    case "collect_iin":
      return "Попроси пациента ввести ИИН (12 цифр), чтобы найти существующую запись.";
    case "collect_name":
      return "Уточни имя пациента для оформления записи.";
    case "collect_phone":
      return "Уточни контактный телефон для оформления записи.";
    case "collect_branch":
      return "Спроси удобный филиал только из официального списка.";
    case "show_slots":
      return "Покажи доступные слоты и спроси, какое время удобно.";
    case "manage_appointment":
      return "Помоги пациенту с существующей записью: перенести, отменить или оставить без изменений.";
    case "dental_qa":
      return "Ответь на вопрос пациента, используя материалы и прайс клиники. Мягко предложи запись, если уместно.";
    case "collect_review":
      return "Попроси оценить визит по шкале от 1 до 5 звёзд.";
    case "human_takeover":
      return "Сообщи, что передаёшь диалог оператору, и попроси немного подождать.";
    case "reactivation":
      return "Пациент ответил на реактивацию — тепло продолжи диалог и предложи записаться.";
    default:
      return `Продолжи диалог на этапе «${STATE_LABELS[state] ?? state}» по скрипту клиники.`;
  }
}

/** Assemble the layered system prompt: ROLE → BEHAVIOR → STEP → FACTS → TASK → OUTPUT. */
export function buildChatbotPrompt(opts: BuildChatbotPromptOpts): string {
  const channel = opts.channel ?? "playground";
  const clinicName = opts.facts.clinicName;
  const iinRule = resolveIinRule(opts.fsmState, opts.iinRule);

  const sections = [
    buildRoleSection(clinicName, channel),
    buildBehaviorSection(clinicName, iinRule),
    buildStepSection(opts.fsmState, opts),
    buildFactsBlock(opts.facts, opts.fsmState),
    ["=== TASK ===", opts.task.trim()].join("\n"),
    buildOutputSection(opts.kazakhNote ?? true),
  ];

  return sections.filter(Boolean).join("\n\n");
}

export interface BuildFollowUpMiniPromptOpts {
  clinicName: string;
  state: ChatbotState;
  contextBits: string;
  template?: string;
}

/** Compact prompt for inactivity reminders and lead nurture (Phase 7). */
export function buildFollowUpMiniPrompt(opts: BuildFollowUpMiniPromptOpts): string {
  const stateLabel = STATE_LABELS[opts.state] ?? opts.state;
  const task =
    opts.template?.trim() ||
    `Пациент не отвечает (этап «${stateLabel}»). Отправь одно короткое напоминание без повторения уже заданных вопросов.`;

  const context = opts.contextBits.trim();

  return [
    `Ты — AI-ассистент клиники «${opts.clinicName}».`,
    "Правила: 1–2 коротких предложения, без давления, без повторения прежних вопросов.",
    context ? `Контекст: ${context}` : null,
    `Задача: ${task}`,
    "Ответь обычным текстом, одним коротким сообщением.",
    KAZAKH_NOTE,
  ]
    .filter(Boolean)
    .join("\n");
}
