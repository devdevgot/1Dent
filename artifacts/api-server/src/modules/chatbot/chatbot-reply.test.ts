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

  it("does not let the assistant introduce itself as the clinic", () => {
    const reply = mergeReply(
      {
        parts: ["Вы обратились в Муслим Дент.", "Меня зовут Муслим Дент, чем помочь?"],
        pausesMs: [0, 900],
      },
      "fallback",
      { clinicName: "Муслим Дент" },
    );

    const text = joinChatbotReply(reply);
    assert.match(text, /AI-ассистент клиники «Муслим Дент»/);
    assert.doesNotMatch(text.toLowerCase(), /меня зовут муслим дент/);
  });

  it("deduplicates similar parts and caps long replies", () => {
    const reply = mergeReply(
      {
        parts: [
          "Здравствуйте! Чем могу помочь?",
          "Здравствуйте, чем могу помочь?",
          "Расскажите, что вас беспокоит.",
          "Расскажите пожалуйста что вас беспокоит.",
        ],
      },
      "fallback",
      { maxParts: 2 },
    );

    assert.deepEqual(reply.parts, [
      "Здравствуйте! Чем могу помочь?",
      "Расскажите, что вас беспокоит.",
    ]);
  });

  it("drops replies that repeat recent assistant messages", () => {
    const reply = mergeReply(
      {
        parts: ["Расскажите, что вас беспокоит.", "Есть ли боль или дискомфорт?"],
      },
      "fallback",
      { recentAssistantTexts: ["Расскажите, пожалуйста, что вас беспокоит."] },
    );

    assert.deepEqual(reply.parts, ["Есть ли боль или дискомфорт?"]);
  });
});
