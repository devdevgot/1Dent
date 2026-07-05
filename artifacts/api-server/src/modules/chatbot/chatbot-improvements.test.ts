import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMarketingOptOutReply } from "./repeat-sale-reply";

function parseReviewScoreFromText(text: string): number | null {
  const t = text.trim();
  const digit = t.match(/^([1-5])$/);
  if (digit) return Number(digit[1]);
  const star = t.match(/([1-5])\s*(?:\/\s*5|звезд|⭐|★)/i);
  if (star) return Number(star[1]);
  return null;
}

function starScoreToNpsPercent(score: number): number {
  return Math.round(((score - 1) / 4) * 100);
}

describe("chatbot improvements (unit)", () => {
  it("parses 1-5 star scores from text", () => {
    assert.equal(parseReviewScoreFromText("5"), 5);
    assert.equal(parseReviewScoreFromText("3/5"), 3);
    assert.equal(parseReviewScoreFromText("hello"), null);
  });

  it("converts star score to NPS percent", () => {
    assert.equal(starScoreToNpsPercent(5), 100);
    assert.equal(starScoreToNpsPercent(1), 0);
  });

  it("detects marketing opt-out keywords", () => {
    assert.equal(isMarketingOptOutReply("стоп"), true);
    assert.equal(isMarketingOptOutReply("да"), false);
  });
});
