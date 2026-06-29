import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDisableReasoning, isThinkingModel } from "./openrouter-client";

describe("openrouter-client reasoning helpers", () => {
  it("allows disabling reasoning for Gemini Flash models", () => {
    assert.equal(canDisableReasoning("google/gemini-2.5-flash"), true);
    assert.equal(canDisableReasoning("google/gemini-2.5-flash-lite"), true);
  });

  it("does not disable reasoning for Gemini Pro or o-series models", () => {
    assert.equal(canDisableReasoning("google/gemini-2.5-pro"), false);
    assert.equal(canDisableReasoning("openai/o3-mini"), false);
    assert.equal(canDisableReasoning("deepseek/deepseek-r1"), false);
  });

  it("detects thinking models", () => {
    assert.equal(isThinkingModel("google/gemini-2.5-flash"), true);
    assert.equal(isThinkingModel("openai/o3-mini"), true);
    assert.equal(isThinkingModel("anthropic/claude-3.5-haiku"), false);
  });
});
