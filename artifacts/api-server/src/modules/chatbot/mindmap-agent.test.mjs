import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMindMapScript,
  mergeMindMapWithDefault,
  normalizeMindMapInput,
} from "./mindmap-validator.ts";
import { DEFAULT_BOOKING_MIND_MAP } from "./booking-script.ts";
import {
  buildBranchListMessage,
  resolveBranchIndex,
  isBranchListInquiry,
  isPatientInquiry,
} from "./clinic-knowledge.ts";
import { renderMindMapScript, renderMindMapCompactPath } from "./mindmap-utils.ts";

test("renderMindMapScript survives cyclic back-edges", () => {
  const map = {
    ...DEFAULT_BOOKING_MIND_MAP,
    edges: [
      ...(DEFAULT_BOOKING_MIND_MAP.edges ?? []),
      { id: "cycle", source: "step6-reoffer", target: "step3-decision" },
    ],
  };
  const text = renderMindMapScript(map);
  assert.ok(text.length > 100);
  assert.match(text, /СКРИПТ ДИАЛОГА/);
});

test("renderMindMapCompactPath stops on parent cycle", () => {
  const map = {
    ...DEFAULT_BOOKING_MIND_MAP,
    edges: [
      ...(DEFAULT_BOOKING_MIND_MAP.edges ?? []),
      { id: "cycle", source: "step6-reoffer", target: "step3-decision" },
    ],
  };
  const text = renderMindMapCompactPath(map, "step6-reoffer");
  assert.ok(text.length > 20);
  assert.match(text, /КРАТКИЙ ПУТЬ/);
});

test("validateMindMapScript accepts default booking map", () => {
  const result = validateMindMapScript(DEFAULT_BOOKING_MIND_MAP);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("mergeMindMapWithDefault preserves booking topology for weak LLM output", () => {
  const weak = normalizeMindMapInput({
    nodes: [
      { id: "n1", label: "Приветствие", content: "Добро пожаловать в клинику!", fsmState: "greeting" },
      { id: "n2", label: "Запись", content: "Запишем на приём", fsmState: "collect_datetime" },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  });
  assert.ok(weak);
  const merged = mergeMindMapWithDefault(weak);
  assert.ok(merged.nodes.some((n) => n.id === "booking-root"));
  assert.ok(merged.nodes.some((n) => n.fsmState === "collect_qualification"));
});

test("buildBranchListMessage lists all branches numbered", () => {
  const msg = buildBranchListMessage(["ул. A 1", "ул. B 2"]);
  assert.match(msg, /1️⃣ ул\. A 1/);
  assert.match(msg, /2️⃣ ул\. B 2/);
});

test("resolveBranchIndex maps number and ordinal", () => {
  const branches = ["ул. A", "ул. B", "ул. C"];
  assert.equal(resolveBranchIndex("2", branches), 1);
  assert.equal(resolveBranchIndex("второй", branches), 1);
  assert.equal(resolveBranchIndex("ул. A", branches), null);
});

test("shouldUseAgentTurn: always enabled for playground and whatsapp", async () => {
  const prev = process.env.CHATBOT_AGENT_MODE;
  delete process.env.CHATBOT_AGENT_MODE;
  const { shouldUseAgentTurn } = await import("./chatbot-agent.types.ts");
  assert.equal(shouldUseAgentTurn("playground"), true);
  assert.equal(shouldUseAgentTurn("whatsapp"), true);
  assert.equal(shouldUseAgentTurn("playground", { agentModeEnabled: false }), true);
  assert.equal(shouldUseAgentTurn("whatsapp", { agentModeEnabled: false }), true);
  process.env.CHATBOT_AGENT_MODE = "1";
  assert.equal(shouldUseAgentTurn("whatsapp", { agentModeEnabled: true }), true);
  if (prev !== undefined) process.env.CHATBOT_AGENT_MODE = prev;
  else delete process.env.CHATBOT_AGENT_MODE;
});

test("validateMindMapScript: default booking map covers golden-path FSM states", () => {
  const result = validateMindMapScript(DEFAULT_BOOKING_MIND_MAP);
  assert.equal(result.valid, true);
  const required = [
    "greeting",
    "collect_problem",
    "collect_qualification",
    "suggest_doctor",
    "await_decision",
    "collect_datetime",
  ];
  for (const fsm of required) {
    assert.ok(
      DEFAULT_BOOKING_MIND_MAP.nodes.some((n) => n.fsmState === fsm),
      `default map should include ${fsm}`,
    );
  }
});

test("validateMindMapScript: warns on cyclic back-edges without failing", () => {
  const map = {
    ...DEFAULT_BOOKING_MIND_MAP,
    edges: [
      ...(DEFAULT_BOOKING_MIND_MAP.edges ?? []),
      { id: "cycle", source: "step6-reoffer", target: "step3-decision" },
    ],
  };
  const result = validateMindMapScript(map);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("Cycle")));
});

test("resolveDeterministicNextNodeId: routes service branch from intro", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step1-intro",
    "хочу лечение кариеса, зуб болит",
    {},
    null,
  );
  assert.equal(next, "step1-caries");
});

test("resolveDeterministicNextNodeId: decision yes goes to booking", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step3-decision",
    "да, давайте запишем",
    { suggestedDoctorId: "doc-1" },
    null,
  );
  assert.equal(next, "step3-ready");
});

test("resolveDeterministicNextNodeId: branch number advances to doctor step", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const branches = ["ул. A 1", "ул. B 2"];
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step2-branch",
    "2",
    {},
    null,
    branches,
  );
  assert.equal(next, "step2-doctor");
});

test("resolveDeterministicNextNodeId: branch list inquiry stays on branch step", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const branches = ["ул. A 1", "ул. B 2"];
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step2-branch",
    "какие есть филиалы?",
    {},
    "step2-qualification",
    branches,
  );
  assert.equal(next, "step2-branch");
});

test("isBranchListInquiry detects branch list questions", () => {
  assert.equal(isBranchListInquiry("какие есть филиалы?"), true);
  assert.equal(isBranchListInquiry("2"), false);
});

test("isPatientInquiry detects general off-script questions", () => {
  assert.equal(isPatientInquiry("сколько стоит чистка?"), true);
  assert.equal(isPatientInquiry("да, записывайте"), false);
});

test("resolveDeterministicNextNodeId: price inquiry stays on current node", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step2-branch",
    "сколько стоит лечение?",
    {},
    "step2-doctor",
    ["ул. A 1", "ул. B 2"],
  );
  assert.equal(next, "step2-branch");
});

test("buildAgentFallbackReply: branch step returns branch list not symptoms", async () => {
  const { buildAgentFallbackReply } = await import("./chatbot-agent-orchestrator.ts");
  const reply = buildAgentFallbackReply({
    scriptCtx: {
      currentNodeId: "step2-branch",
      currentNodeLabel: "Выбор филиала",
      currentNodeContent: "Предложи выбрать филиал",
      currentFsmState: "collect_qualification",
      compactPath: "",
      fullScript: "",
      outgoingTransitions: "",
    },
    fsmState: "collect_qualification",
    sessionData: {},
    clinicBranchNames: ["ул. A 1", "ул. B 2"],
    knowledgeContext: "",
    messageText: "какие есть филиалы?",
  });
  assert.match(reply, /филиал/i);
  assert.doesNotMatch(reply, /боль|дискомфорт/i);
});

test("assertAllowedTransition: blocks branch to symptoms regression", async () => {
  const { assertAllowedTransition } = await import("./chatbot-agent-context.ts");
  const result = assertAllowedTransition(
    DEFAULT_BOOKING_MIND_MAP,
    "step2-branch",
    "step2-qualification",
  );
  assert.equal(result.allowed, false);
});

test("inferAgentActionsForTransition: branch pick triggers doctor suggestion", async () => {
  const { inferAgentActionsForTransition } = await import("./chatbot-agent-orchestrator.ts");
  const fromNode = DEFAULT_BOOKING_MIND_MAP.nodes.find((n) => n.id === "step2-branch");
  const toNode = DEFAULT_BOOKING_MIND_MAP.nodes.find((n) => n.id === "step2-doctor");
  const actions = inferAgentActionsForTransition(
    fromNode,
    toNode,
    {},
    "1",
    ["ул. A 1", "ул. B 2"],
    [],
  );
  assert.ok(actions.some((a) => a.type === "set_branch"));
  assert.ok(actions.some((a) => a.type === "suggest_doctor"));
});

test("resolveOfficialBranchFromMessage: maps digit to branch", async () => {
  const { resolveOfficialBranchFromMessage } = await import("./clinic-knowledge.ts");
  assert.equal(resolveOfficialBranchFromMessage("2", ["ул. A", "ул. B"]), "ул. B");
});

test("buildAgentOrchestratorPrompt: playground uses compact script not full mind map dump", async () => {
  const { buildAgentOrchestratorPrompt } = await import("./chatbot-agent-prompt.ts");
  const prompt = buildAgentOrchestratorPrompt({
    clinicName: "Test Clinic",
    channel: "playground",
    script: {
      currentNodeId: "step1-intro",
      currentNodeLabel: "Intro",
      currentNodeContent: "Приветствие",
      currentFsmState: "greeting",
      compactPath: "COMPACT PATH BODY",
      fullScript: "FULL SCRIPT BODY SHOULD NOT APPEAR",
      outgoingTransitions: "transitions",
    },
    facts: { clinicName: "Test Clinic", nowContext: "now" },
    fsmState: "greeting",
  });
  assert.match(prompt, /COMPACT PATH BODY/);
  assert.doesNotMatch(prompt, /FULL SCRIPT BODY SHOULD NOT APPEAR/);
  assert.doesNotMatch(prompt, /Тестовый режим \(playground\)/);
  assert.match(prompt, /ИДЕНТИЧНО реальному WhatsApp/i);
});

test("buildAgentOrchestratorPrompt: includes multi-message replyParts schema", async () => {
  const { buildAgentOrchestratorPrompt } = await import("./chatbot-agent-prompt.ts");
  const prompt = buildAgentOrchestratorPrompt({
    clinicName: "Test Clinic",
    channel: "playground",
    script: {
      currentNodeId: "step1-intro",
      currentNodeLabel: "Intro",
      currentNodeContent: "Приветствие",
      currentFsmState: "greeting",
      compactPath: "",
      fullScript: "",
      outgoingTransitions: "",
    },
    facts: { clinicName: "Test Clinic", nowContext: "now" },
    fsmState: "greeting",
  });
  assert.match(prompt, /replyParts/);
  assert.match(prompt, /удобное время/i);
});

test("parseChatbotAgentTurn: parses parts alias as replyParts", async () => {
  const { parseChatbotAgentTurn } = await import("./chatbot-agent-parser.ts");
  const turn = parseChatbotAgentTurn(
    JSON.stringify({
      reply: "У нас несколько филиалов.",
      parts: ["1️⃣ ул. A", "Какой удобнее?"],
      actions: [],
    }),
  );
  assert.equal(turn?.reply, "У нас несколько филиалов.");
  assert.deepEqual(turn?.replyParts, ["1️⃣ ул. A", "Какой удобнее?"]);
});

test("parseChatbotAgentTurn: recovers from markdown-wrapped JSON", async () => {
  const { parseChatbotAgentTurn } = await import("./chatbot-agent-parser.ts");
  const turn = parseChatbotAgentTurn(
    '```json\n{"reply":"Здравствуйте!","replyParts":["Чем помочь?"],"actions":[]}\n```',
  );
  assert.equal(turn?.reply, "Здравствуйте!");
  assert.deepEqual(turn?.replyParts, ["Чем помочь?"]);
});

test("parseChatbotAgentTurn: recovers reply from truncated JSON", async () => {
  const { parseChatbotAgentTurn } = await import("./chatbot-agent-parser.ts");
  const turn = parseChatbotAgentTurn(
    '{"reply":"Какой филиал удобнее?","replyParts":["Напишите номер"],"mindMapNodeId":"step2-branch","actions":[',
  );
  assert.equal(turn?.reply, "Какой филиал удобнее?");
});

test("parseChatbotAgentTurn: accepts plain-text reply when JSON missing", async () => {
  const { parseChatbotAgentTurn } = await import("./chatbot-agent-parser.ts");
  const turn = parseChatbotAgentTurn("Подскажите удобный филиал для записи.");
  assert.equal(turn?.reply, "Подскажите удобный филиал для записи.");
});

test("parseChatbotAgentTurn: parses replyParts array", async () => {
  const { parseChatbotAgentTurn } = await import("./chatbot-agent-parser.ts");
  const turn = parseChatbotAgentTurn(
    JSON.stringify({
      reply: "Инфо об имплантах.",
      replyParts: ["Подскажите удобное время для визита?"],
      actions: [],
    }),
  );
  assert.equal(turn?.reply, "Инфо об имплантах.");
  assert.deepEqual(turn?.replyParts, ["Подскажите удобное время для визита?"]);
});

test("buildAgentFallbackReply: after qualification advances to branch list", async () => {
  const { buildAgentFallbackReply } = await import("./chatbot-agent-orchestrator.ts");
  const reply = buildAgentFallbackReply({
    scriptCtx: {
      currentNodeId: "step2-qualification",
      currentNodeLabel: "Квалификация",
      currentNodeContent: "Профессиональная чистка со скидкой 10%",
      currentFsmState: "collect_qualification",
      compactPath: "",
      fullScript: "",
      outgoingTransitions: "",
    },
    fsmState: "collect_qualification",
    sessionData: { serviceType: "hygiene" },
    clinicBranchNames: ["ул. A 1", "ул. B 2"],
    knowledgeContext: "",
    messageText: "Плановый осмотр, не лечил ранее",
    targetNodeId: "step2-branch",
    targetFsmState: "collect_qualification",
  });
  assert.match(reply, /филиал/i);
  assert.doesNotMatch(reply, /скидк/i);
});

test("resolveDeterministicNextNodeId: qualification answer advances to branch", async () => {
  const { resolveDeterministicNextNodeId } = await import("./chatbot-agent-orchestrator.ts");
  const next = resolveDeterministicNextNodeId(
    DEFAULT_BOOKING_MIND_MAP,
    "step2-qualification",
    "Плановый осмотр, не лечил ранее",
    { serviceType: "hygiene" },
    null,
  );
  assert.equal(next, "step2-branch");
});

test("buildAgentFallbackReply: stays contextual on qualification", async () => {
  const { buildAgentFallbackReply } = await import("./chatbot-agent-orchestrator.ts");
  const reply = buildAgentFallbackReply({
    scriptCtx: {
      currentNodeId: "step2-qualification",
      currentNodeLabel: "Квалификация",
      currentNodeContent: "Уточни симптомы",
      currentFsmState: "collect_qualification",
      compactPath: "",
      fullScript: "",
      outgoingTransitions: "",
    },
    fsmState: "collect_qualification",
    sessionData: {},
    clinicBranchNames: [],
    knowledgeContext: "",
  });
  assert.doesNotMatch(reply, /чем могу помочь/i);
  assert.match(reply, /боль|дискомфорт/i);
});
