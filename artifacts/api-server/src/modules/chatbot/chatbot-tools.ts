import type { ChatbotSessionData, ChatbotState } from "./chatbot.types";
import type { ChatbotAgentAction, ChatbotAgentIntent } from "./chatbot-agent.types";
import { hasPatientIdentity } from "./chatbot-patient-identity";
import { assignRankedDoctor, buildDoctorPresentationFallback } from "./booking-fsm";
import { extractDatetimeFromText, extractBranchFromText } from "./ai-classifier";
import {
  formatSlotAlternatives,
  getDoctorAvailableSlots,
  validateAppointmentSlot,
  type SlotValidationResult,
} from "./calendar-slots";
import {
  formatAlmatyDateTimeLong,
  formatAlmatyIso,
  formatAlmatySlotCompact,
  parseAlmatyDatetime,
  tryParseAppointmentDatetimeLocal,
} from "./almaty-time";
import { resolveBranchFromMessage } from "./clinic-knowledge";
import type { DoctorCandidate } from "../analytics/analytics.repository";
import type { ClinicCalendarConfig } from "@workspace/db";
import { updatePatientNameByPhone } from "../../shared/patient-phone-resolver";
import { isReadyToBook, isShortYes } from "./booking-script";
import { orderAgentActions } from "./chatbot-agent-action-inference";

export { inferKnowledgeAgentActions, orderAgentActions } from "./chatbot-agent-action-inference";

function tryMarkBookingReady(
  sessionData: ChatbotSessionData,
  toolNotes: string[],
): { bookingReady: boolean; needsPatientName: boolean; data: ChatbotSessionData } {
  if (!sessionData.suggestedDoctorId || !sessionData.preferredDatetime || !sessionData.selectedBranch) {
    toolNotes.push("book_appointment: не хватает врача, времени или филиала");
    return { bookingReady: false, needsPatientName: false, data: sessionData };
  }
  const parsed = parseAlmatyDatetime(sessionData.preferredDatetime);
  if (!parsed) {
    toolNotes.push("book_appointment: невалидная дата/время — нужна parse_datetime");
    return {
      bookingReady: false,
      needsPatientName: false,
      data: { ...sessionData, preferredDatetime: undefined },
    };
  }
  const normalized = { ...sessionData, preferredDatetime: formatAlmatyIso(parsed) };
  if (!hasPatientIdentity(normalized)) {
    toolNotes.push("book_appointment: нужно имя пациента");
    return { bookingReady: false, needsPatientName: true, data: normalized };
  }
  toolNotes.push("Готово к финализации записи");
  return { bookingReady: true, needsPatientName: false, data: normalized };
}

export interface AgentToolContext {
  clinicId: string;
  phone: string;
  messageText: string;
  dryRun: boolean;
  calendarConfig?: ClinicCalendarConfig | null;
  knowledgeContext: string;
  officialBranches: string[];
  noteAction: (msg: string) => void;
}

export interface AgentToolResult {
  data: ChatbotSessionData;
  toolNotes: string[];
  suggestedDoctor?: DoctorCandidate | null;
  slotsAppendix?: string;
  bookingReady?: boolean;
  needsPatientName?: boolean;
  handoff?: boolean;
}

function mergeIntent(data: ChatbotSessionData, intent?: ChatbotAgentIntent): ChatbotSessionData {
  if (!intent) return data;
  const next = { ...data };
  if (intent.serviceType && intent.serviceType !== "unknown") next.serviceType = intent.serviceType;
  if (intent.urgency) next.urgency = intent.urgency;
  if (intent.selectedBranch) next.selectedBranch = intent.selectedBranch;
  if (intent.patientName) next.patientName = intent.patientName;
  // Never store raw LLM datetime text — only a parseable Almaty ISO, otherwise schedule
  // inserts get Invalid Date / null scheduledAt and disappear from the calendar.
  if (intent.preferredDatetime) {
    const parsed = parseAlmatyDatetime(intent.preferredDatetime);
    if (parsed) next.preferredDatetime = formatAlmatyIso(parsed);
  }
  if (intent.problemDescription) {
    next.problemDescription = next.problemDescription
      ? `${next.problemDescription} ${intent.problemDescription}`.slice(0, 400)
      : intent.problemDescription.slice(0, 400);
  }
  return next;
}

function buildSlotValidationFeedback(validation: SlotValidationResult, datetime: Date): string {
  const formatted = formatAlmatyDateTimeLong(datetime);
  if (validation.ok) {
    return `✅ ${formatted} — свободно. Подтверждаем запись? (Да / другое время)`;
  }

  const alt = validation.nearestSlots?.length
    ? `\n\nБлижайшие слоты:\n${formatSlotAlternatives(validation.nearestSlots, formatAlmatySlotCompact)}`
    : "";

  switch (validation.reason) {
    case "occupied":
      return `На ${formatted} уже занято.${alt}\n\nВыберите другое время.`;
    case "day_full":
      return `На этот день полная запись.${alt}\n\nПредложите другой день.`;
    case "outside_hours":
    case "past":
      return `Время ${formatted} недоступно.${alt}\n\nУкажите другое время в рабочие часы.`;
    default:
      return `Время ${formatted} недоступно.${alt}`;
  }
}

async function validateParsedDatetime(
  sessionData: ChatbotSessionData,
  ctx: AgentToolContext,
): Promise<{ data: ChatbotSessionData; feedback: string; slotOk: boolean }> {
  if (!sessionData.preferredDatetime || !sessionData.suggestedDoctorId) {
    return { data: sessionData, feedback: "", slotOk: true };
  }

  const datetime =
    parseAlmatyDatetime(sessionData.preferredDatetime) ??
    new Date(sessionData.preferredDatetime);
  if (Number.isNaN(datetime.getTime())) {
    const cleared = { ...sessionData, preferredDatetime: undefined };
    return { data: cleared, feedback: "Не удалось распознать дату и время. Укажите, пожалуйста, ещё раз.", slotOk: false };
  }
  sessionData = { ...sessionData, preferredDatetime: formatAlmatyIso(datetime) };

  const validation = await validateAppointmentSlot(
    ctx.clinicId,
    sessionData.suggestedDoctorId,
    datetime,
    ctx.calendarConfig ?? undefined,
    sessionData.existingProcedureId,
  );

  const feedback = buildSlotValidationFeedback(validation, datetime);
  if (!validation.ok) {
    return {
      data: { ...sessionData, preferredDatetime: undefined },
      feedback,
      slotOk: false,
    };
  }

  return { data: sessionData, feedback, slotOk: true };
}

/** Execute agent-declared tools (validated server-side). */
export async function executeChatbotAgentTools(
  data: ChatbotSessionData,
  actions: ChatbotAgentAction[],
  intent: ChatbotAgentIntent | undefined,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  let sessionData = mergeIntent(data, intent);
  const toolNotes: string[] = [];
  let suggestedDoctor: DoctorCandidate | null = null;
  let slotsAppendix = "";
  let bookingReady = false;
  let needsPatientName = false;
  let handoff = false;
  let bookAppointmentAttempted = false;

  const ordered = orderAgentActions(actions);

  for (const action of ordered) {
    switch (action.type) {
      case "set_branch": {
        const branch =
          action.branch ??
          (await resolveBranchFromMessage(ctx.messageText, ctx.knowledgeContext, extractBranchFromText, {
            allowFreeText: true,
            officialBranches: ctx.officialBranches,
          }));
        if (branch) {
          sessionData.selectedBranch = branch;
          toolNotes.push(`Филиал: ${branch}`);
        }
        break;
      }
      case "set_patient_name": {
        const name = action.name?.trim() || intent?.patientName?.trim();
        if (name) {
          sessionData.patientName = name.slice(0, 120);
          toolNotes.push(`Имя: ${sessionData.patientName}`);
          if (!ctx.dryRun) {
            await updatePatientNameByPhone(ctx.clinicId, ctx.phone, sessionData.patientName).catch(() => {});
          }
        }
        break;
      }
      case "suggest_doctor": {
        const ranked = await assignRankedDoctor(ctx.clinicId, sessionData, ctx.dryRun);
        sessionData = ranked.data;
        suggestedDoctor = ranked.top;
        if (ranked.top) {
          toolNotes.push(`Врач: ${ranked.top.name} (${ranked.top.rankPercent}/100)`);
        } else {
          toolNotes.push("Нет доступных врачей для подбора");
          handoff = true;
        }
        break;
      }
      case "rerank_doctor": {
        const excluded = [...(sessionData.excludedDoctorIds ?? [])];
        if (action.excludeCurrentDoctor !== false && sessionData.suggestedDoctorId) {
          excluded.push(sessionData.suggestedDoctorId);
        }
        sessionData.excludedDoctorIds = excluded;
        const reranked = await assignRankedDoctor(
          ctx.clinicId,
          { ...sessionData, excludedDoctorIds: excluded },
          ctx.dryRun,
        );
        sessionData = reranked.data;
        suggestedDoctor = reranked.top;
        if (reranked.top) {
          toolNotes.push(`Альтернативный врач: ${reranked.top.name}`);
        }
        break;
      }
      case "show_slots": {
        if (sessionData.suggestedDoctorId) {
          const slots = await getDoctorAvailableSlots(
            ctx.clinicId,
            sessionData.suggestedDoctorId,
            ctx.calendarConfig ?? undefined,
          );
          const formatted = formatSlotAlternatives(slots.slice(0, 4), formatAlmatySlotCompact);
          slotsAppendix = formatted ? `Свободные слоты:\n${formatted}` : "";
          toolNotes.push(`Слоты: ${slots.length} доступно`);
        }
        break;
      }
      case "parse_datetime": {
        const text = action.datetimeText ?? ctx.messageText;
        const localDate = tryParseAppointmentDatetimeLocal(text);
        if (localDate) {
          sessionData.preferredDatetime = formatAlmatyIso(localDate);
          toolNotes.push(`Время: ${sessionData.preferredDatetime}`);
        } else {
          const extracted = await extractDatetimeFromText(text);
          if (extracted) {
            sessionData.preferredDatetime = formatAlmatyIso(extracted);
            toolNotes.push(`Время: ${sessionData.preferredDatetime}`);
          }
        }

        if (sessionData.preferredDatetime && sessionData.suggestedDoctorId) {
          const validated = await validateParsedDatetime(sessionData, ctx);
          sessionData = validated.data;
          if (validated.feedback) {
            slotsAppendix = validated.feedback;
            toolNotes.push(validated.slotOk ? "Слот свободен" : "Слот недоступен");
          }
        }
        break;
      }
      case "book_appointment": {
        bookAppointmentAttempted = true;
        const marked = tryMarkBookingReady(sessionData, toolNotes);
        sessionData = marked.data;
        bookingReady = marked.bookingReady;
        if (marked.needsPatientName) needsPatientName = true;
        break;
      }
      case "handoff_operator":
        handoff = true;
        toolNotes.push("Передача оператору");
        break;
      case "cancel_appointment":
      case "reschedule_appointment":
        toolNotes.push(`Запрошено: ${action.type}`);
        break;
      default:
        break;
    }
  }

  // Second pass: prerequisites may have been collected earlier in this same turn
  // after book_appointment was first evaluated (or user confirmed after tools ran).
  if (
    !bookingReady &&
    (bookAppointmentAttempted || isShortYes(ctx.messageText) || isReadyToBook(ctx.messageText))
  ) {
    const marked = tryMarkBookingReady(sessionData, toolNotes);
    sessionData = marked.data;
    bookingReady = marked.bookingReady;
    if (marked.needsPatientName) needsPatientName = true;
  }

  if (
    sessionData.patientName &&
    intent?.patientName &&
    !actions.some((a) => a.type === "set_patient_name") &&
    !ctx.dryRun
  ) {
    await updatePatientNameByPhone(ctx.clinicId, ctx.phone, sessionData.patientName).catch(() => {});
  }

  return { data: sessionData, toolNotes, suggestedDoctor, slotsAppendix, bookingReady, needsPatientName, handoff };
}

export function deriveFsmStateFromAgent(
  sessionData: ChatbotSessionData,
  fsmHint?: string | null,
  mindMapFsm?: string,
): ChatbotState {
  const hint = (fsmHint ?? undefined) as ChatbotState | undefined;
  const valid: ChatbotState[] = [
    "greeting",
    "collect_name",
    "collect_problem",
    "collect_qualification",
    "suggest_doctor",
    "await_decision",
    "collect_datetime",
    "collect_branch",
    "handle_objections",
    "confirm_appointment",
    "manage_appointment",
    "done",
    "human_takeover",
    "reactivation",
    "dental_qa",
    "collect_review",
  ];
  if (hint && valid.includes(hint as ChatbotState)) return hint as ChatbotState;
  if (sessionData.createdProcedureId) return "done";
  if (
    sessionData.suggestedDoctorId &&
    sessionData.preferredDatetime &&
    sessionData.selectedBranch &&
    !hasPatientIdentity(sessionData)
  ) {
    return "collect_name";
  }
  if (sessionData.preferredDatetime && sessionData.suggestedDoctorId) return "collect_datetime";
  if (sessionData.suggestedDoctorId) return "suggest_doctor";
  if (sessionData.serviceType) return "collect_qualification";
  return "collect_problem";
}

export { buildDoctorPresentationFallback };
