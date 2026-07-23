import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeReply,
  parseChatbotReplyJson,
  replyFromText,
  joinChatbotReply,
  conciseReply,
  estimateTypingPause,
  splitSentencesSafe,
  stripPromoFromText,
  splitTextToReply,
} from "./chatbot-reply-format.ts";
import {
  enrichReplyWithFsmFollowUp,
  replyFromAgentText,
} from "./chatbot-reply-enrich.ts";

describe("chatbot-reply", () => {
  it("estimateTypingPause stays within 300–800ms", () => {
    assert.equal(estimateTypingPause(""), 300);
    assert.equal(estimateTypingPause("x".repeat(50)), 700);
    assert.equal(estimateTypingPause("x".repeat(200)), 800);
  });

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

  it("replyFromAgentText merges reply and replyParts", () => {
    const reply = replyFromAgentText("Инфо об имплантах.", ["Подскажите удобное время для визита?"]);
    assert.deepEqual(reply.parts, [
      "Инфо об имплантах.",
      "Подскажите удобное время для визита?",
    ]);
  });

  it("enrichReplyWithFsmFollowUp appends visit time after service info", () => {
    const enriched = enrichReplyWithFsmFollowUp(replyFromText("Имплантация требует консультации специалиста."), {
      fsmState: "collect_problem",
      sessionData: {},
      clinicBranchNames: [],
      messageText: "Хочу поставить имплант",
    });
    assert.equal(enriched.parts.length, 2);
    assert.match(enriched.parts[1]!, /удобное время/i);
  });

  it("enrichReplyWithFsmFollowUp splits branch teaser and full list", () => {
    const branches = ["ул. A 1", "ул. B 2", "ул. C 3", "ул. D 4"];
    const enriched = enrichReplyWithFsmFollowUp(replyFromText("У нас есть 4 филиала в городе."), {
      fsmState: "collect_qualification",
      mindMapNodeId: "step2-branch",
      sessionData: { qualificationPhase: "branch" },
      clinicBranchNames: branches,
      messageText: "хорошо",
    });
    assert.equal(enriched.parts.length, 2);
    assert.match(enriched.parts[1]!, /1️⃣ ул\. A 1/);
    assert.match(enriched.parts[1]!, /4️⃣ ул\. D 4/);
  });

  it("enrichReplyWithFsmFollowUp prepends branch thank-you after selection", () => {
    const enriched = enrichReplyWithFsmFollowUp(replyFromText("Отличный выбор."), {
      fsmState: "suggest_doctor",
      sessionData: { selectedBranch: "ул. B 2" },
      clinicBranchNames: ["ул. A 1", "ул. B 2"],
      messageText: "2",
      branchJustSelected: "ул. B 2",
    });
    assert.match(enriched.parts[0]!, /Спасибо/i);
    assert.match(enriched.parts[0]!, /ул\. B 2/);
  });

  it("splitSentencesSafe does not break after address abbreviations", () => {
    const sentences = splitSentencesSafe(
      "У нас 4 филиала в Алматы. Наш главный находится по адресу: ул. Абая 10. Какой вам удобнее?",
    );
    assert.deepEqual(sentences, [
      "У нас 4 филиала в Алматы.",
      "Наш главный находится по адресу: ул. Абая 10.",
      "Какой вам удобнее?",
    ]);
  });

  it("splitSentencesSafe keeps «г.» and «мкр.» inside one sentence", () => {
    const sentences = splitSentencesSafe("Мы находимся в г. Алматы, мкр. Самал-2, д. 33. Ждём вас!");
    assert.deepEqual(sentences, ["Мы находимся в г. Алматы, мкр. Самал-2, д. 33.", "Ждём вас!"]);
  });

  it("stripPromoFromText keeps the street address after «ул.»", () => {
    const text = "У нас 4 филиала в Алматы. Наш главный находится по адресу: ул. Абая 10.";
    assert.equal(stripPromoFromText(text), text);
  });

  it("conciseReply does not cut the address in a bubble", () => {
    const reply = conciseReply({
      parts: ["У нас 4 филиала в Алматы. Наш главный находится по адресу: ул. Абая 10."],
    });
    assert.match(reply.parts[0]!, /ул\. Абая 10/);
  });

  it("splitTextToReply does not split a bubble right after «ул.»", () => {
    const reply = splitTextToReply(
      "Наш главный филиал находится по адресу: ул. Абая 10, рядом с метро и парковкой. Подскажите, когда вам удобно прийти на консультацию к врачу?",
      2,
    );
    for (const part of reply.parts) {
      assert.doesNotMatch(part, /ул\.$/);
    }
    assert.match(reply.parts.join("\n"), /ул\. Абая 10/);
  });

  it("conciseReply strips marketing filler but keeps clean questions", () => {
    const trimmed = conciseReply({
      parts: [
        "Готовы записаться?",
        "Когда вам удобно прийти?",
      ],
    });
    assert.match(trimmed.parts[0]!, /Готовы записаться/i);
    assert.match(trimmed.parts[1]!, /удобно прийти/i);
  });

  it("enrichReplyWithFsmFollowUp appends branch list after generic branch question", () => {
    const branches = ["ул. A 1", "ул. B 2"];
    const enriched = enrichReplyWithFsmFollowUp(replyFromText("Какой адрес или филиал вам удобнее?"), {
      fsmState: "collect_qualification",
      mindMapNodeId: "step2-branch",
      sessionData: { qualificationPhase: "branch" },
      clinicBranchNames: branches,
      messageText: "Нет",
    });
    assert.equal(enriched.parts.length, 2);
    assert.match(enriched.parts[1]!, /1️⃣ ул\. A 1/);
  });
});
