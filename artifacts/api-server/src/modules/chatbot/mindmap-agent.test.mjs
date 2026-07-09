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

test("shouldUseAgentTurn: playground on without env flag", async () => {
  const prev = process.env.CHATBOT_AGENT_MODE;
  delete process.env.CHATBOT_AGENT_MODE;
  const { shouldUseAgentTurn } = await import("./chatbot-agent.types.ts");
  assert.equal(shouldUseAgentTurn("playground"), true);
  assert.equal(shouldUseAgentTurn("whatsapp"), false);
  if (prev !== undefined) process.env.CHATBOT_AGENT_MODE = prev;
});

test("shouldUseAgentTurn: respects per-clinic kill switch", async () => {
  const { shouldUseAgentTurn } = await import("./chatbot-agent.types.ts");
  assert.equal(shouldUseAgentTurn("playground", { agentModeEnabled: false }), false);
  assert.equal(shouldUseAgentTurn("whatsapp", { agentModeEnabled: false }), false);
  assert.equal(shouldUseAgentTurn("playground", { agentModeEnabled: true }), true);
});

test("shouldUseAgentTurn: whatsapp needs env flag when agent mode enabled", async () => {
  const prev = process.env.CHATBOT_AGENT_MODE;
  process.env.CHATBOT_AGENT_MODE = "1";
  const { shouldUseAgentTurn } = await import("./chatbot-agent.types.ts");
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
