import type { ChatMessage } from "./ai-classifier";

/** Build a richer knowledge query when the patient sends a short reply ("да", "завтра"). */
export function buildKnowledgeQueryFromTurn(
  messageText: string,
  recentMessages: ChatMessage[],
): string {
  const trimmed = messageText.trim();
  if (trimmed.length >= 20) return trimmed;

  const recentUser = recentMessages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join(" ");
  const recentAssistant = recentMessages
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => m.content)
    .join(" ");

  const combined = [recentUser, trimmed, recentAssistant].filter(Boolean).join(" ").trim();
  return combined || trimmed;
}

export function excludeTrailingDuplicateUserMessage(
  messages: ChatMessage[],
  currentText: string,
): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1]!;
  if (last.role === "user" && last.content.trim() === currentText.trim()) {
    return messages.slice(0, -1);
  }
  return messages;
}
