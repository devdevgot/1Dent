import assert from "node:assert/strict";
import {
  usesBookingFlow,
  buildDefaultBookingMindMap,
  isReadyToBook,
  isHesitating,
  detectObjectionType,
} from "./booking-script.ts";
import {
  hasClinicKnowledge,
  buildBranchPromptFallback,
  resolveBranchFromMessage,
} from "./clinic-knowledge.ts";
import {
  isPositiveRepeatSaleReplyKeywords,
  isNeutralRepeatSaleQuestion,
  isExplicitNegativeRepeatSaleReply,
} from "./repeat-sale-reply.ts";

const mindMap = buildDefaultBookingMindMap();

assert.equal(usesBookingFlow(mindMap), true);
assert.equal(usesBookingFlow({ nodes: [], edges: [] }), true);
assert.equal(usesBookingFlow(null), true);

assert.equal(hasClinicKnowledge(""), false);
assert.equal(hasClinicKnowledge("   "), false);
assert.equal(hasClinicKnowledge("=== сайт ===\nул. Пример 1"), true);

assert.match(buildBranchPromptFallback(true), /клиник/i);
assert.doesNotMatch(buildBranchPromptFallback(false), /Тургут|Майлина/);

assert.equal(isReadyToBook("давайте запишите"), true);
assert.equal(isHesitating("хочу подумать"), true);
assert.equal(detectObjectionType("это дорого"), "price");

assert.equal(isPositiveRepeatSaleReplyKeywords("Продолжить"), true);
assert.equal(isPositiveRepeatSaleReplyKeywords("продолжить запись"), true);
assert.equal(isPositiveRepeatSaleReplyKeywords("continue"), true);
assert.equal(isExplicitNegativeRepeatSaleReply("нет, спасибо"), true);
assert.equal(isNeutralRepeatSaleQuestion("сколько стоит осмотр?"), true);
assert.equal(isNeutralRepeatSaleQuestion("когда можно прийти"), true);
assert.equal(isPositiveRepeatSaleReplyKeywords("хм"), false);

assert.ok(mindMap.nodes.some((n) => n.id === "step2-qualification"));
assert.ok(mindMap.nodes.some((n) => n.fsmState === "await_decision"));
assert.ok(!mindMap.nodes.some((n) => (n.content ?? "").includes("Тургут Озала")));

const resolved = await resolveBranchFromMessage(
  "ул. Тестовая 1",
  "",
  async () => null,
  { allowFreeText: true },
);
assert.equal(resolved, "ул. Тестовая 1");

console.log("booking-script tests passed");
