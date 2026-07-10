import type { ChatbotReply } from "./chatbot-reply-format";
import { defaultPauses, normalizeReply } from "./chatbot-reply-format";
import type { ChatbotSessionData, ChatbotState } from "./chatbot.types";
import {
  buildBranchListMessage,
  buildBranchPromptFallback,
  buildSymptomsPromptFallback,
  isBranchSelectionNode,
} from "./clinic-knowledge";

export interface EnrichReplyContext {
  fsmState: ChatbotState;
  mindMapNodeId?: string;
  sessionData: ChatbotSessionData;
  clinicBranchNames: string[];
  messageText: string;
  /** Branch saved during this turn via set_branch tool */
  branchJustSelected?: string | null;
}

/** Build ChatbotReply from agent JSON reply + optional follow-up parts. */
export function replyFromAgentText(reply: string, replyParts?: string[]): ChatbotReply {
  const parts: string[] = [];
  const main = reply.trim();
  if (main) parts.push(main);
  if (replyParts?.length) {
    for (const part of replyParts) {
      const trimmed = part.trim();
      if (trimmed && !parts.some((existing) => textsOverlap(existing, trimmed))) {
        parts.push(trimmed);
      }
    }
  }
  if (parts.length === 0) return { parts: [], pausesMs: [0] };
  return normalizeReply({ parts, pausesMs: defaultPauses(parts) });
}

/** Append a missing funnel follow-up bubble when the model returns only one message. */
export function enrichReplyWithFsmFollowUp(reply: ChatbotReply, ctx: EnrichReplyContext): ChatbotReply {
  let normalized = normalizeReply(reply);
  if (normalized.parts.length === 0) return normalized;

  if (ctx.branchJustSelected) {
    normalized = prependBranchThankYou(normalized, ctx.branchJustSelected);
  }

  if (normalized.parts.length >= 2) return capReplyParts(normalized, 3);

  const first = normalized.parts[0]!;
  const branches = ctx.clinicBranchNames;

  if (branches.length > 1 && mentionsBranchTeaser(first, branches.length) && !hasFullBranchList(first, branches)) {
    const listMsg = buildBranchListMessage(branches);
    if (!textsOverlap(first, listMsg)) {
      return capReplyParts(
        normalizeReply({ parts: [first, listMsg], pausesMs: defaultPauses([first, listMsg]) }),
        3,
      );
    }
  }

  if (hasFollowUpCue(first)) return capReplyParts(normalized, 3);

  const followUp = resolveFsmFollowUp(ctx);
  if (!followUp || textsOverlap(first, followUp)) return capReplyParts(normalized, 3);

  return capReplyParts(
    normalizeReply({
      parts: [first, followUp],
      pausesMs: defaultPauses([first, followUp]),
    }),
    3,
  );
}

function prependBranchThankYou(reply: ChatbotReply, branch: string): ChatbotReply {
  const thank = `Спасибо! Записываем вас в филиал «${branch}».`;
  const parts = [...reply.parts];
  const first = parts[0] ?? "";

  if (textsOverlap(first, thank) || first.toLowerCase().includes(branch.toLowerCase().slice(0, 8))) {
    return reply;
  }

  return normalizeReply({
    parts: [thank, ...parts],
    pausesMs: defaultPauses([thank, ...parts]),
  });
}

function capReplyParts(reply: ChatbotReply, max: number): ChatbotReply {
  const normalized = normalizeReply(reply);
  if (normalized.parts.length <= max) return normalized;
  const parts = normalized.parts.slice(0, max);
  return normalizeReply({ parts, pausesMs: defaultPauses(parts) });
}

function hasFollowUpCue(text: string): boolean {
  const t = text.trim();
  if (/\?\s*$/.test(t)) return true;
  return /подскаж|напишите|выберите|удобн.*время|какое\s+время|какая\s+дата|номер\s+или\s+название|подходит\s+вам|запишем|готовы\s+записаться|есть\s+ли\s+(сейчас\s+)?боль|наш(и|их)\s+филиал/i.test(
    t,
  );
}

function hasFullBranchList(text: string, branches: string[]): boolean {
  const emojiCount = (text.match(/[1-4]️⃣/g) ?? []).length;
  if (emojiCount >= Math.min(2, branches.length)) return true;

  const found = branches.filter((b) => {
    const snippet = b.toLowerCase().slice(0, Math.min(14, b.length));
    return snippet.length >= 4 && text.toLowerCase().includes(snippet);
  });
  return found.length >= Math.min(2, branches.length);
}

function mentionsBranchTeaser(text: string, branchCount: number): boolean {
  if (branchCount <= 1) return false;
  const t = text.toLowerCase();
  return (
    /\d+\s+филиал/.test(t) ||
    /несколько\s+филиал/.test(t) ||
    /у\s+нас\s+(есть\s+)?\d+\s+филиал/.test(t) ||
    /есть\s+\d+\s+филиал/.test(t) ||
    (/филиал/.test(t) && /у\s+нас|наш(и|их)/.test(t))
  );
}

function isServiceRequest(text: string): boolean {
  return /хочу|нужн|интересует|поставить|сделать|имплант|чистк|лечени|консультац|болит|боль\s+в|кариес|удалить|протез|брекет|отбелив/i.test(
    text,
  );
}

function resolveFsmFollowUp(ctx: EnrichReplyContext): string | null {
  const { fsmState, sessionData, clinicBranchNames, messageText, mindMapNodeId } = ctx;
  const nodeId = mindMapNodeId ?? sessionData.activeMindMapNodeId ?? "";

  if (ctx.branchJustSelected) return null;

  if (
    clinicBranchNames.length > 1 &&
    (isBranchSelectionNode(nodeId, fsmState) || fsmState === "collect_branch" || nodeId === "step2-branch")
  ) {
    return buildBranchListMessage(clinicBranchNames);
  }

  switch (fsmState) {
    case "collect_problem":
      if (isServiceRequest(messageText)) {
        return "Подскажите удобное время для визита?";
      }
      return "Расскажите, что вас беспокоит?";

    case "collect_qualification":
      if (nodeId === "step2-branch" || sessionData.qualificationPhase === "branch") {
        if (clinicBranchNames.length > 1) return buildBranchListMessage(clinicBranchNames);
        if (clinicBranchNames.length === 1) return `Запишем вас в филиал «${clinicBranchNames[0]}»?`;
      }
      if (!sessionData.selectedBranch && clinicBranchNames.length > 1) {
        return buildBranchPromptFallback(false, clinicBranchNames);
      }
      return buildSymptomsPromptFallback();

    case "collect_branch":
      return buildBranchPromptFallback(false, clinicBranchNames);

    case "suggest_doctor":
      if (sessionData.suggestedDoctorName) {
        return `Подходит вам ${sessionData.suggestedDoctorName} или подобрать другого врача?`;
      }
      return null;

    case "await_decision":
      return "Готовы записаться на приём?";

    case "collect_datetime":
      return "Какая дата и время вам удобны для визита?";

    default:
      return null;
  }
}

function textsOverlap(a: string, b: string): boolean {
  const aNorm = normalizeForSimilarity(a);
  const bNorm = normalizeForSimilarity(b);
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (aNorm.length > 12 && bNorm.includes(aNorm)) return true;
  if (bNorm.length > 12 && aNorm.includes(bNorm)) return true;

  const aWords = new Set(aNorm.split(" ").filter((w) => w.length > 2));
  const bWords = new Set(bNorm.split(" ").filter((w) => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return false;
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }
  return overlap / Math.min(aWords.size, bWords.size) >= 0.9;
}

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
