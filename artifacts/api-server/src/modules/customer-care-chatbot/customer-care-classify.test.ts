import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { customerCareChatbotService } from "./customer-care-chatbot.service";

describe("CustomerCareChatbotService.classifyReplyIntent", () => {
  it("classifies booking and reschedule intents", () => {
    assert.equal(customerCareChatbotService.classifyReplyIntent("Хочу записаться"), "want_booking");
    assert.equal(customerCareChatbotService.classifyReplyIntent("Давайте перенесём"), "reschedule");
    assert.equal(customerCareChatbotService.classifyReplyIntent("Подтверждаю, приду"), "confirm_visit");
    assert.equal(customerCareChatbotService.classifyReplyIntent("Спасибо"), "thanks_ok");
  });
});
