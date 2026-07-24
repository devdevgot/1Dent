import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksLikeBookingConfirmation } from "./chatbot-agent-turn";

describe("looksLikeBookingConfirmation", () => {
  it("detects common confirmation phrases", () => {
    assert.equal(looksLikeBookingConfirmation("Записал вас на завтра в 15:00"), true);
    assert.equal(looksLikeBookingConfirmation("✅ Запись подтверждена. Ждём вас!"), true);
    assert.equal(looksLikeBookingConfirmation("Вы записаны к врачу Иванову"), true);
  });

  it("does not flag ordinary booking questions", () => {
    assert.equal(looksLikeBookingConfirmation("Когда вам удобно прийти?"), false);
    assert.equal(looksLikeBookingConfirmation("Подскажите филиал"), false);
    assert.equal(looksLikeBookingConfirmation(""), false);
  });
});
