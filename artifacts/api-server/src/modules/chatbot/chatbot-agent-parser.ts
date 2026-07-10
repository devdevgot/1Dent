import { parseLlmJson } from "../../lib/openrouter-client";
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
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw.trim();
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

function buildTurnFromParsed(parsed: Record<string, unknown>): ChatbotAgentTurn | null {
  const reply = typeof parsed["reply"] === "string" ? parsed["reply"].trim() : "";
  const replyPartsRaw = parsed["replyParts"];
  const replyParts = Array.isArray(replyPartsRaw)
    ? replyPartsRaw
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
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

/** Parse LLM JSON into ChatbotAgentTurn. */
export function parseChatbotAgentTurn(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;

  const candidates = [extractJsonCandidate(raw), repairTruncatedAgentJson(raw)].filter(
    (c): c is string => Boolean(c?.trim()),
  );

  for (const candidate of candidates) {
    try {
      const parsed = parseLlmJson<Record<string, unknown>>(candidate);
      if (parsed && typeof parsed === "object") {
        const turn = buildTurnFromParsed(parsed);
        if (turn) return turn;
      }
    } catch {
      /* try next candidate */
    }
  }

  try {
    const parsed = parseLlmJson<Record<string, unknown>>(raw);
    if (parsed && typeof parsed === "object") {
      const turn = buildTurnFromParsed(parsed);
      if (turn) return turn;
    }
  } catch (err) {
    logger.warn({ err, rawSnippet: raw.slice(0, 200) }, "[AgentTurn] Failed to parse agent JSON");
  }

  return parseAgentReplyOnly(raw);
}

/** Recover at least the reply field when full JSON is malformed. */
export function parseAgentReplyOnly(raw: string | null): ChatbotAgentTurn | null {
  if (!raw?.trim()) return null;

  for (const candidate of [extractJsonCandidate(raw), repairTruncatedAgentJson(raw), raw].filter(
    (c): c is string => Boolean(c?.trim()),
  )) {
    const parsed = parseLlmJson<Record<string, unknown>>(candidate);
    if (parsed && typeof parsed["reply"] === "string" && parsed["reply"].trim()) {
      return { reply: parsed["reply"].trim(), actions: [] };
    }
  }

  const match = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match?.[1]) {
    try {
      const reply = JSON.parse(`"${match[1]}"`) as string;
      if (reply.trim()) return { reply: reply.trim(), actions: [] };
    } catch {
      /* ignore */
    }
  }

  const plain = raw.trim();
  if (
    plain.length >= 2 &&
    plain.length <= 500 &&
    !plain.startsWith("{") &&
    !plain.includes('"mindMapNodeId"')
  ) {
    return { reply: plain, actions: [] };
  }

  return null;
}
