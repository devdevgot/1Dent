import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectMindMapCycles, validateMindMapScript } from "./mindmap-validator";

describe("mindmap-validator", () => {
  it("detects cycles in mind map edges", () => {
    const map = {
      nodes: [
        { id: "a", label: "A", content: "" },
        { id: "b", label: "B", content: "" },
        { id: "c", label: "C", content: "" },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "a" },
      ],
    };

    const cycles = detectMindMapCycles(map);
    assert.equal(cycles.length, 1);
    assert.match(cycles[0], /a → b → c → a/);
  });

  it("ignores intentional objection re-offer cycles", () => {
    const result = validateMindMapScript({
      nodes: [
        { id: "step3-decision", label: "Decision", content: "", fsmState: "await_decision", isRoot: true },
        { id: "step3-think", label: "Think", content: "", fsmState: "handle_objections" },
        { id: "step6-reoffer", label: "Reoffer", content: "", fsmState: "await_decision" },
      ],
      edges: [
        { id: "e1", source: "step3-decision", target: "step3-think" },
        { id: "e2", source: "step3-think", target: "step6-reoffer" },
        { id: "e3", source: "step6-reoffer", target: "step3-decision" },
      ],
    });

    assert.equal(result.valid, true);
    assert.equal(result.warnings.filter((w) => w.startsWith("Cycle in graph:")).length, 0);
  });

  it("reports unexpected cycle warnings during validation", () => {
    const result = validateMindMapScript({
      nodes: [
        { id: "a", label: "A", content: "", isRoot: true },
        { id: "b", label: "B", content: "" },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    });

    assert.ok(result.warnings.some((w) => w.startsWith("Cycle in graph:")));
  });
});
