import type { ScriptMindMapData, ScriptMindMapNode } from "./mindmap-utils";
import { DEFAULT_BOOKING_MIND_MAP } from "./booking-script.ts";
import type { ChatbotState } from "./chatbot.types";

const REQUIRED_FSM_STATES: ChatbotState[] = [
  "greeting",
  "collect_problem",
  "collect_qualification",
  "suggest_doctor",
  "await_decision",
  "collect_datetime",
];

const VALID_FSM_STATES = new Set<string>([
  "greeting",
  "collect_iin",
  "collect_name",
  "collect_phone",
  "collect_problem",
  "collect_qualification",
  "suggest_doctor",
  "manage_appointment",
  "show_slots",
  "collect_datetime",
  "collect_branch",
  "await_decision",
  "handle_objections",
  "confirm_appointment",
  "dental_qa",
  "collect_review",
  "done",
  "human_takeover",
  "reactivation",
]);

export interface MindMapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function normalizeMindMapInput(raw: unknown): ScriptMindMapData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const nodesRaw = obj["nodes"];
  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) return null;

  const nodes: ScriptMindMapNode[] = [];
  for (let i = 0; i < nodesRaw.length; i++) {
    const row = nodesRaw[i];
    if (!row || typeof row !== "object") continue;
    const n = row as Record<string, unknown>;
    const id = String(n["id"] ?? `node-${i + 1}`).trim();
    const label = String(n["label"] ?? `Шаг ${i + 1}`).trim();
    const content = String(n["content"] ?? n["detail"] ?? n["description"] ?? "").trim();
    const fsmState = n["fsmState"] != null ? String(n["fsmState"]) : undefined;
    const isRoot = Boolean(n["isRoot"]);
    const pos = n["position"];
    const position =
      pos && typeof pos === "object"
        ? {
            x: Number((pos as Record<string, unknown>)["x"] ?? 0),
            y: Number((pos as Record<string, unknown>)["y"] ?? 0),
          }
        : { x: (i % 4) * 160 - 240, y: Math.floor(i / 4) * 140 };

    nodes.push({ id, label, content, fsmState, isRoot, position });
  }

  const edgesRaw = obj["edges"];
  const edges = Array.isArray(edgesRaw)
    ? edgesRaw
        .filter((e) => e && typeof e === "object")
        .map((e, idx) => {
          const edge = e as Record<string, unknown>;
          return {
            id: String(edge["id"] ?? `e-${idx}`),
            source: String(edge["source"] ?? ""),
            target: String(edge["target"] ?? ""),
            label: edge["label"] != null ? String(edge["label"]) : undefined,
          };
        })
        .filter((e) => e.source && e.target)
    : [];

  return { nodes, edges };
}

/** Validate mind map structure for runtime + agent mode. */
export function validateMindMapScript(raw: unknown): MindMapValidationResult {
  const map = normalizeMindMapInput(raw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!map) {
    return { valid: false, errors: ["Mind map must have at least one node"], warnings: [] };
  }

  const ids = new Set<string>();
  for (const node of map.nodes) {
    if (!node.id) errors.push("Node missing id");
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
    if (!node.label?.trim()) warnings.push(`Node ${node.id} has empty label`);
    if (node.fsmState && !VALID_FSM_STATES.has(node.fsmState)) {
      warnings.push(`Node ${node.id} has unknown fsmState: ${node.fsmState}`);
    }
  }

  for (const edge of map.edges ?? []) {
    if (!ids.has(edge.source)) errors.push(`Edge ${edge.id} references missing source ${edge.source}`);
    if (!ids.has(edge.target)) errors.push(`Edge ${edge.id} references missing target ${edge.target}`);
  }

  const hasRoot =
    map.nodes.some((n) => n.isRoot) ||
    map.nodes.some((n) => n.id === "booking-root") ||
    (map.edges?.length ?? 0) === 0;
  if (!hasRoot && (map.edges?.length ?? 0) > 0) {
    const targets = new Set((map.edges ?? []).map((e) => e.target));
    const roots = map.nodes.filter((n) => !targets.has(n.id));
    if (roots.length === 0) warnings.push("No root node detected in graph");
  }

  const fsmPresent = new Set(map.nodes.map((n) => n.fsmState).filter(Boolean));
  for (const required of REQUIRED_FSM_STATES) {
    if (!fsmPresent.has(required)) {
      warnings.push(`Missing recommended FSM state node: ${required}`);
    }
  }

  const usesBooking =
    map.nodes.some((n) => n.id === "booking-root") ||
    fsmPresent.has("collect_qualification") ||
    fsmPresent.has("await_decision");
  if (!usesBooking) {
    warnings.push("Mind map may not support full booking flow (no booking-root / qualification / decision)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Merge LLM-generated content onto default booking topology when graph is weak. */
export function mergeMindMapWithDefault(generated: ScriptMindMapData): ScriptMindMapData {
  const validation = validateMindMapScript(generated);
  const hasBookingRoot = generated.nodes.some((n) => n.id === "booking-root");
  const hasQual = generated.nodes.some((n) => n.fsmState === "collect_qualification");

  if (validation.valid && hasBookingRoot && hasQual) {
    return {
      nodes: generated.nodes,
      edges: generated.edges ?? [],
    };
  }

  const defaultMap = DEFAULT_BOOKING_MIND_MAP;
  const genByFsm = new Map<string, ScriptMindMapNode>();
  const genByLabel = new Map<string, ScriptMindMapNode>();
  for (const n of generated.nodes) {
    if (n.fsmState) genByFsm.set(n.fsmState, n);
    genByLabel.set(n.label.toLowerCase().trim(), n);
  }

  const mergedNodes = defaultMap.nodes.map((def) => {
    const fromFsm = def.fsmState ? genByFsm.get(def.fsmState) : undefined;
    const fromLabel = genByLabel.get(def.label.toLowerCase().trim());
    const src = fromFsm ?? fromLabel;
    if (!src?.content?.trim()) return def;
    return {
      ...def,
      content: src.content.trim(),
      label: src.label?.trim() ? src.label : def.label,
    };
  });

  const defaultIds = new Set(defaultMap.nodes.map((n) => n.id));
  const extraNodes = generated.nodes.filter((n) => !defaultIds.has(n.id));
  for (const extra of extraNodes) {
    if (extra.fsmState === "collect_problem" || extra.label.toLowerCase().includes("лечение")) {
      mergedNodes.push(extra);
    }
  }

  const extraEdges = (generated.edges ?? []).filter(
    (e) => !defaultMap.edges?.some((d) => d.source === e.source && d.target === e.target),
  );

  return {
    nodes: mergedNodes,
    edges: [...(defaultMap.edges ?? []), ...extraEdges],
  };
}

export { normalizeMindMapInput };
