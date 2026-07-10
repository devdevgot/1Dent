import type { ChatbotSessionData, ChatbotState } from "./chatbot.types";
import type { ChatbotAgentAction, ChatbotAgentIntent } from "./chatbot-agent.types";
import { assignRankedDoctor, buildDoctorPresentationFallback } from "./booking-fsm";
import { extractDatetimeFromText, extractBranchFromText } from "./ai-classifier";
import {
  formatSlotAlternatives,
  getDoctorAvailableSlots,
} from "./calendar-slots";
import { resolveBranchFromMessage } from "./clinic-knowledge";
import type { DoctorCandidate } from "../analytics/analytics.repository";
import type { ClinicCalendarConfig } from "@workspace/db";

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
  handoff?: boolean;
}

function mergeIntent(data: ChatbotSessionData, intent?: ChatbotAgentIntent): ChatbotSessionData {
  if (!intent) return data;
  const next = { ...data };
  if (intent.serviceType && intent.serviceType !== "unknown") next.serviceType = intent.serviceType;
  if (intent.urgency) next.urgency = intent.urgency;
  if (intent.selectedBranch) next.selectedBranch = intent.selectedBranch;
  if (intent.patientName) next.patientName = intent.patientName;
  if (intent.preferredDatetime) next.preferredDatetime = intent.preferredDatetime;
  if (intent.problemDescription) {
    next.problemDescription = next.problemDescription
      ? `${next.problemDescription} ${intent.problemDescription}`.slice(0, 400)
      : intent.problemDescription.slice(0, 400);
  }
  return next;
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
  let handoff = false;

  for (const action of actions) {
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
          slotsAppendix = formatSlotAlternatives(slots.slice(0, 8));
          toolNotes.push(`Слоты: ${slots.length} доступно`);
        }
        break;
      }
      case "parse_datetime": {
        const text = action.datetimeText ?? ctx.messageText;
        const extracted = await extractDatetimeFromText(text);
        if (extracted?.iso) {
          sessionData.preferredDatetime = extracted.iso;
          toolNotes.push(`Время: ${extracted.iso}`);
        }
        break;
      }
      case "book_appointment": {
        if (sessionData.suggestedDoctorId && sessionData.preferredDatetime && sessionData.selectedBranch) {
          bookingReady = true;
          toolNotes.push("Готово к финализации записи");
        } else {
          toolNotes.push("book_appointment: не хватает врача, времени или филиала");
        }
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

  return { data: sessionData, toolNotes, suggestedDoctor, slotsAppendix, bookingReady, handoff };
}

export function deriveFsmStateFromAgent(
  sessionData: ChatbotSessionData,
  fsmHint?: string | null,
  mindMapFsm?: string,
): ChatbotState {
  const hint = (fsmHint ?? mindMapFsm ?? sessionData.activeMindMapNodeId) as ChatbotState | undefined;
  const valid: ChatbotState[] = [
    "greeting",
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
  if (sessionData.preferredDatetime && sessionData.suggestedDoctorId) return "collect_datetime";
  if (sessionData.suggestedDoctorId) return "suggest_doctor";
  if (sessionData.serviceType) return "collect_qualification";
  return "collect_problem";
}

export { buildDoctorPresentationFallback };
