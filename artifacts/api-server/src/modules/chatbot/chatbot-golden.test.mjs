import assert from "node:assert/strict";
// Strip-types safe import of logic re-exported by ai-classifier.ts (full module pulls OpenRouter deps).
import { detectServiceTypeFromKeywords } from "./service-type-keywords.ts";
import { splitTextToReply } from "./chatbot-reply-format.ts";
import { buildTaskForState } from "./chatbot-prompt-builder.ts";
import { isRefusing } from "./booking-script.ts";

// isNo lives in chatbot.service.ts (not exported). Mirror CONFIRM_NO matching for golden-path docs.
const CONFIRM_NO = [
  "нет",
  "no",
  "отмена",
  "отменить",
  "cancel",
  "не надо",
  "жоқ",
  "жок",
  "керек емес",
  "болмайды",
  "қажет емес",
];
function isNo(text) {
  const lower = text.toLowerCase().trim();
  return CONFIRM_NO.some((kw) => lower === kw || lower.startsWith(kw + " "));
}

// 1. detectServiceTypeFromKeywords (ai-classifier.ts)
assert.equal(detectServiceTypeFromKeywords("болит зуб"), "therapy");
assert.equal(detectServiceTypeFromKeywords("чистка"), "hygiene");

// 2. splitTextToReply — long multi-sentence text splits into at most 2 bubbles
const longText =
  "Добрый день! У нас есть свободные окна на этой неделе. " +
  "Врач-терапевт может принять вас в удобное время. " +
  "Напишите, когда вам комфортно приехать, и мы закрепим запись в расписании клиники.";
const split = splitTextToReply(longText);
assert.ok(split.parts.length <= 2, `expected at most 2 parts, got ${split.parts.length}`);
assert.ok(split.parts.length >= 2, "expected long text to split into 2 parts");
assert.equal(split.parts.join(" ").replace(/\s+/g, " ").trim(), longText.replace(/\s+/g, " ").trim());

// 3. buildTaskForState await_decision — task should mention booking/recording
const awaitDecisionTask = buildTaskForState("await_decision");
assert.match(awaitDecisionTask, /запис/i);

// 4. isRefusing vs isNo — different keyword sets; bare «нет» is not a refuse signal
assert.equal(isRefusing("не надо"), true);
assert.equal(isNo("нет"), true);
assert.equal(isRefusing("нет"), false, "bare «нет» is handled by isNo, not isRefusing");

console.log("chatbot-golden tests passed");
