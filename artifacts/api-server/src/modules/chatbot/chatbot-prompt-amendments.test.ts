import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROMPT_AMENDMENTS_MARKER,
  splitComposedPrompt,
  buildPromptWithAmendments,
} from "./chatbot-prompt-amendments.ts";

describe("chatbot-prompt-amendments", () => {
  it("splitComposedPrompt returns whole text as base when no marker", () => {
    const base = "Ты — ассистент клиники.\nПравило 1.";
    assert.deepEqual(splitComposedPrompt(base), { base, amendments: [] });
  });

  it("splitComposedPrompt extracts numbered amendments", () => {
    const prompt = [
      "Базовый промпт Opus.",
      "",
      PROMPT_AMENDMENTS_MARKER,
      "1. Не предлагать скидки без запроса.",
      "2. Уточнять филиал перед записью.",
    ].join("\n");

    const { base, amendments } = splitComposedPrompt(prompt);
    assert.equal(base, "Базовый промпт Opus.");
    assert.deepEqual(amendments, [
      "Не предлагать скидки без запроса.",
      "Уточнять филиал перед записью.",
    ]);
  });

  it("buildPromptWithAmendments returns base only when amendments empty", () => {
    assert.equal(buildPromptWithAmendments("  Base  ", []), "Base");
  });

  it("buildPromptWithAmendments appends marker and numbered rules", () => {
    const result = buildPromptWithAmendments("Base prompt", [
      "Всегда здороваться.",
      "Не выдумывать цены.",
    ]);

    assert.ok(result.startsWith("Base prompt\n\n"));
    assert.ok(result.includes(PROMPT_AMENDMENTS_MARKER));
    assert.ok(result.includes("1. Всегда здороваться."));
    assert.ok(result.includes("2. Не выдумывать цены."));
  });

  it("round-trip split after build preserves base and amendments", () => {
    const base = "Opus base with rules.";
    const amendments = ["Rule A", "Rule B"];
    const composed = buildPromptWithAmendments(base, amendments);
    const split = splitComposedPrompt(composed);
    assert.equal(split.base, base);
    assert.deepEqual(split.amendments, amendments);
  });
});
