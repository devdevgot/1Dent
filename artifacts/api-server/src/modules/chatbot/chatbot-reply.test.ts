import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeReply,
  parseChatbotReplyJson,
  replyFromText,
  joinChatbotReply,
} from "./chatbot-reply-format";

describe("chatbot-reply", () => {
  it("parses valid multi-part JSON replies", () => {
    const parsed = parseChatbotReplyJson(
      JSON.stringify({
        parts: ["Здравствуйте!", "Чем могу помочь?"],
        pausesMs: [0, 900],
      }),
    );
    assert.deepEqual(parsed?.parts, ["Здравствуйте!", "Чем могу помочь?"]);
    assert.deepEqual(parsed?.pausesMs, [0, 900]);
  });

  it("merges AI reply or falls back to plain text", () => {
    const fromAi = mergeReply(replyFromText("Привет"), "fallback");
    assert.equal(joinChatbotReply(fromAi), "Привет");

    const fallback = mergeReply(null, "Проверьте API-ключ");
    assert.equal(joinChatbotReply(fallback), "Проверьте API-ключ");
  });

  it("rejects empty parts arrays", () => {
    assert.equal(parseChatbotReplyJson(JSON.stringify({ parts: [] })), null);
    assert.equal(parseChatbotReplyJson(JSON.stringify({ parts: ["  "] })), null);
  });
});
