import { parseLlmJson, sanitizeJsonResponse } from "../../lib/openrouter-client";
import { logger } from "../../lib/logger";
import type {
  ChatbotAgentTurn,
  ChatbotAgentAction,
  ChatbotAgentIntent,
} from "./chatbot-agent.types";

function normalizeAction(raw: unknown): ChatbotAgentAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o["type"];
  if (typeof type !== "string") return null;
  return {
    type: type as ChatbotAgentAction["type"],
    excludeCurrentDoctor: o["excludeCurrentDoctor"] === true,
    branch: typeof o["branch"] === "string" ? o["branch"] : undefined,
    name: typeof o["name"] === "string" ? o["name"] : undefined,
    datetimeText: typeof o["datetimeText"] === "string" ? o["datetimeText"] : undefined,
  };
}

function normalizeIntent(raw: unknown): ChatbotAgentIntent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    serviceType: typeof o["serviceType"] === "string" ? o["serviceType"] : undefined,
    urgency:
      o["urgency"] === "urgent" || o["urgency"] === "soon" || o["urgency"] === "planned"
        ? o["urgency"]
        : undefined,
    selectedBranch:
      o["selectedBranch"] === null
        ? null
        : typeof o["selectedBranch"] === "string"
          ? o["selectedBranch"]
          : undefined,
    patientName:
      o["patientName"] === null
        ? null
        : typeof o["patientName"] === "string"
          ? o["patientName"]
          : undefined,
    preferredDatetime:
      o["preferredDatetime"] === null
        ? null
        : typeof o["preferredDatetime"] === "string"
          ? o["preferredDatetime"]
          : undefined,
    problemDescription:
      typeof o["problemDescription"] === "string" ? o["problemDescription"] : undefined,
  };
}

function extractJsonCandidate(raw: string): string {
  return sanitizeJsonResponse(raw);
}

function repairTruncatedAgentJson(raw: string): string | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate.startsWith("{")) return null;

  let repaired = candidate;
  if (!repaired.trimEnd().endsWith("}")) {
    repaired = `${repaired.replace(/,\s*$/, "")}}`;
  }

  const openBrackets =
    (repaired.match(/\[/g) ?? []).length - (repaired.match(/\]/g) ?? []).length;
  const openBraces = (repaired.match(/\{/g) ?? []).length - (repaired.match(/\}/g) ?? []).length;
  repaired += "]".repeat(Math.max(0, openBrackets));
  repaired += "}".repeat(Math.max(0, openBraces));

  return repaired;
}

function readReplyText(parsed: Record<string, unknown>): string {
  for (const key of ["reply", "text", "message", "content"]) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readReplyParts(parsed: Record<string, unknown>): string[] {
  for (const key of ["replyParts", "parts", "messages"]) {
    const raw = parsed[key];
    if (!Array.isArray(raw)) continue;
    const parts = raw
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts;
  }
  return [];
}

function buildTurnFromParsed(parsed: Record<string, unknown>): ChatbotAgentTurn | null {
  const reply = readReplyText(parsed);
  const replyParts = readReplyParts(parsed);
  if (!reply && replyParts.length === 0) return null;

  const actionsRaw = parsed["actions"];
  const actions = Array.isArray(actionsRaw)
    ? actionsRaw.map(normalizeAction).filter((a): a is ChatbotAgentAction => a != null)
    : [];

  return {
    reply: reply || replyParts[0] || "",
    replyParts: reply ? replyParts : replyParts.slice(1),
    mindMapNodeId:
      parsed["mindMapNodeId"] === null
        ? null
        : typeof parsed["mindMapNodeId"] === "string"
          ? parsed["mindMapNodeId"]
          : undefined,
    fsmHint: typeof parsed["fsmHint"] === "string" ? parsed["fsmHint"] : undefined,
    intent: normalizeIntent(parsed["intent"]),
    actions,
    handoff: parsed["handoff"] === true,
  };
}

function decodeJsonStringLiteral(raw: string): string | null {
  try {
    return (JSON.parse(`"${raw}"`) as string).trim() || null;
  } catch {
    return null;
  }
}

function extractReplyFieldsRegex(raw: string): ChatbotAgentTurn | null {
  const replyMatch = raw.match(/"(?:reply|text|message)"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  const reply = replyMatch?.[1] ? decodeJsonStringLiteral(replyMatch[1]) : null;

  const parts: string[] = [];
  const partsBlock = raw.match(/"(?:replyParts|parts)"\s*:\s*\[([\s\S]*?)\]/);
  if (partsBlock?.[1]) {
    const partMatches = partsBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g);
    for (const m of partMatches) {
      const part = decodeJsonStringLiteral(m[1] ?? "");
      if (part) parts.push(part);
    }
  }

  if (!reply && parts.length === 0) return null;

  return {
    reply: reply || parts[0] || "",
    replyParts: reply ? parts : parts.slice(1),
    actions: [],
  };
}

function looksLikeJsonPayload(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("```") || trimmed.includes('"reply"');
}

/** Parse LLM JSON into ChatbotAgentTurn. */
export function parseChatbotAgentTurn(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;

  const candidates = [
    extractJsonCandidate(raw),
    repairTruncatedAgentJson(raw),
    raw.trim(),
  ].filter((c): c is string => Boolean(c?.trim()));

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const parsed = parseLlmJson<Record<string, unknown>>(candidate);
    if (parsed && typeof parsed === "object") {
      const turn = buildTurnFromParsed(parsed);
      if (turn) return turn;
    }
  }

  const regexTurn = extractReplyFieldsRegex(raw);
  if (regexTurn) return regexTurn;

  const recovered = parseAgentReplyOnly(raw);
  if (!recovered) {
    logger.warn({ rawSnippet: raw.slice(0, 200) }, "[AgentTurn] Failed to parse agent JSON");
  }
  return recovered;
}

/** Recover at least the reply field when full JSON is malformed. */
export function parseAgentReplyOnly(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;

  const regexTurn = extractReplyFieldsRegex(raw);
  if (regexTurn) return regexTurn;

  for (const candidate of [extractJsonCandidate(raw), repairTruncatedAgentJson(raw), raw].filter(
    (c): c is string => Boolean(c?.trim()),
  )) {
    const parsed = parseLlmJson<Record<string, unknown>>(candidate);
    if (parsed) {
      const turn = buildTurnFromParsed(parsed);
      if (turn) return turn;
      const reply = readReplyText(parsed);
      if (reply) return { reply, actions: [] };
    }
  }

  const plain = raw.trim();
  if (plain.length >= 2 && plain.length <= 2000 && !looksLikeJsonPayload(plain)) {
    return { reply: plain, actions: [] };
  }

  return null;
}
