import { logger } from "../lib/logger";

const DEBOUNCE_MS = 5_000;

interface DebounceEntry {
  timer: NodeJS.Timeout;
  buffer: string[];
}

const pending = new Map<string, DebounceEntry>();

/**
 * Debounces inbound chatbot messages per (clinicId, senderPhone).
 * If the same sender sends multiple messages within DEBOUNCE_MS they are
 * concatenated and processed as a single combined message.
 * Only the chatbot processing call is debounced — DB storage and alert
 * detection run immediately per-message in the caller.
 */
export function debounceMessage(
  clinicId: string,
  senderPhone: string,
  text: string,
  callback: (combined: string) => void,
): void {
  const key = `${clinicId}:${senderPhone}`;
  const existing = pending.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.buffer.push(text);
    logger.debug({ key, bufferLen: existing.buffer.length }, "[MessageDebounce] appended to buffer, timer reset");
  } else {
    pending.set(key, { timer: undefined as unknown as NodeJS.Timeout, buffer: [text] });
  }

  const entry = pending.get(key)!;
  entry.timer = setTimeout(() => {
    pending.delete(key);
    const combined = entry.buffer.join("\n");
    logger.debug({ key, parts: entry.buffer.length }, "[MessageDebounce] firing with combined message");
    callback(combined);
  }, DEBOUNCE_MS);
}
