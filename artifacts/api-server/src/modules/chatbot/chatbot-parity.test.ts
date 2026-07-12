import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalChatbotPhone, chatbotPhoneLookupKeys } from "./chatbot-phone";
import {
  buildKnowledgeQueryFromTurn,
  excludeTrailingDuplicateUserMessage,
} from "./chatbot-history";
import {
  isBotResumeRequest,
  reopenDoneSessionData,
  shouldAutoResetHumanTakeover,
} from "./chatbot-session-resume";

describe("chatbot parity helpers", () => {
  it("canonicalizes KZ phone formats", () => {
    assert.equal(canonicalChatbotPhone("77001234567"), "+77001234567");
    assert.equal(canonicalChatbotPhone("+77001234567"), "+77001234567");
    assert.equal(canonicalChatbotPhone("8 700 123 45 67"), "+77001234567");
  });

  it("collects lookup keys for legacy phone rows", () => {
    const keys = chatbotPhoneLookupKeys("77001234567");
    assert.ok(keys.includes("77001234567"));
    assert.ok(keys.includes("+77001234567"));
  });

  it("enriches knowledge query from recent history for short replies", () => {
    const query = buildKnowledgeQueryFromTurn("да", [
      { role: "user", content: "Сколько стоит имплантация?" },
      { role: "assistant", content: "Имплантация от 150 000 тг." },
    ]);
    assert.match(query, /имплантац/i);
    assert.match(query, /да/);
  });

  it("excludes duplicate trailing user message from history", () => {
    const history = [
      { role: "assistant" as const, content: "Привет" },
      { role: "user" as const, content: "Здравствуйте" },
    ];
    const trimmed = excludeTrailingDuplicateUserMessage(history, "Здравствуйте");
    assert.equal(trimmed.length, 1);
    assert.equal(trimmed[0]?.role, "assistant");
  });

  it("reopens done session preserving patient identity", () => {
    const next = reopenDoneSessionData({
      patientName: "Айгуль",
      existingPatientId: "p1",
      selectedBranch: "Центр",
      createdProcedureId: "proc1",
      serviceType: "hygiene",
    });
    assert.equal(next.patientName, "Айгуль");
    assert.equal(next.existingPatientId, "p1");
    assert.equal(next.selectedBranch, "Центр");
    assert.equal(next.createdProcedureId, undefined);
    assert.equal(next.serviceType, undefined);
  });

  it("detects bot resume phrases", () => {
    assert.equal(isBotResumeRequest("продолжить диалог с ботом"), true);
    assert.equal(isBotResumeRequest("хочу записаться"), false);
  });

  it("auto-resets takeover after TTL", () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(shouldAutoResetHumanTakeover(old), true);
    const recent = new Date().toISOString();
    assert.equal(shouldAutoResetHumanTakeover(recent), false);
  });
});
