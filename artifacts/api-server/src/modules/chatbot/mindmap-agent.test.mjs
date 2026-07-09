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
