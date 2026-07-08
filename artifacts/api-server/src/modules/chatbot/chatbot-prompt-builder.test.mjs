import assert from "node:assert/strict";
import {
  buildChatbotPrompt,
  buildTaskForState,
  buildFactsBlock,
  filterFactsForState,
  buildFollowUpMiniPrompt,
} from "./chatbot-prompt-builder.ts";

const baseFacts = {
  clinicName: "Test Clinic",
  nowContext: "Сегодня: 8 июл 2026, 22:00, Asia/Almaty",
  officialBranches: ["Центр", "Юг"],
  patientRequest: "болит зуб",
  urgency: "soon",
  suggestedDoctor: { name: "Dr. Test", specialty: "терапевт", rankPercent: 85 },
  slots: ["9 июл 14:00", "9 июл 16:00"],
  knowledgeSnippet: "Клиника на ул. Пример 1",
};

const greetingPrompt = buildChatbotPrompt({
  fsmState: "greeting",
  channel: "whatsapp",
  facts: baseFacts,
  task: buildTaskForState("greeting"),
});

assert.match(greetingPrompt, /=== ROLE ===/);
assert.match(greetingPrompt, /=== BEHAVIOR ===/);
assert.match(greetingPrompt, /=== STEP ===/);
assert.match(greetingPrompt, /=== FACTS ===/);
assert.match(greetingPrompt, /=== TASK ===/);
assert.match(greetingPrompt, /=== OUTPUT ===/);
assert.doesNotMatch(greetingPrompt, /Dr\. Test/);

const doctorPrompt = buildChatbotPrompt({
  fsmState: "suggest_doctor",
  channel: "whatsapp",
  facts: baseFacts,
  task: buildTaskForState("suggest_doctor", { hasSuggestedDoctor: true }),
});

assert.match(doctorPrompt, /Dr\. Test/);
assert.match(doctorPrompt, /9 июл 14:00/);
assert.doesNotMatch(doctorPrompt, /=== МАТЕРИАЛЫ КЛИНИКИ ===/);

const filtered = filterFactsForState(baseFacts, "greeting");
assert.equal(filtered.suggestedDoctor, undefined);
assert.equal(filtered.officialBranches, undefined);

const factsBlock = buildFactsBlock(baseFacts, "collect_qualification");
assert.match(factsBlock, /Центр/);
assert.match(factsBlock, /болит зуб/);

const qualTask = buildTaskForState("collect_qualification", { qualificationPhase: "symptoms" });
assert.match(qualTask, /симптом|боль|дискомфорт/i);

const branchTask = buildTaskForState("collect_qualification", { qualificationPhase: "branch" });
assert.match(branchTask, /филиал/i);

const mini = buildFollowUpMiniPrompt({
  clinicName: "Test Clinic",
  state: "await_decision",
  contextBits: "Обсуждали врача Dr. Test.",
});
assert.match(mini, /Test Clinic/);
assert.ok(mini.length < 600);

console.log("chatbot-prompt-builder tests passed");
