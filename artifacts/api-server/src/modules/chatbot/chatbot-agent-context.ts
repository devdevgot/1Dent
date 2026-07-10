import type { ScriptMindMapData } from "./mindmap-utils";
import {
  getMindMapOutgoingEdges,
  findMindMapRootId,
  renderMindMapScript,
  renderMindMapCompactPath,
} from "./mindmap-utils";

export interface AgentScriptContext {
  currentNodeId: string;
  currentNodeLabel: string;
  currentNodeContent: string;
  currentFsmState?: string;
  compactPath: string;
  fullScript: string;
  outgoingTransitions: string;
}

function formatOutgoingTransitions(
  mindMap: ScriptMindMapData,
  nodeId: string,
): string {
  const outgoing = getMindMapOutgoingEdges(mindMap, nodeId);
  if (outgoing.length === 0) {
    return "Доступные переходы: оставайся на текущем узле или выбери соседний узел по смыслу диалога.";
  }
  const lines = outgoing.map(({ edge, target }, i) => {
    const trigger = edge.label?.trim() ? `«${edge.label.trim()}»` : "—";
    return `${i + 1}. → «${target.label}» (id: ${target.id}, fsm: ${target.fsmState ?? "—"}) — если ${trigger}`;
  });
  return ["Доступные переходы (выбери mindMapNodeId из списка):", ...lines].join("\n");
}

/** Build script context visible to the agent orchestrator. */
export function buildScriptContextForAgent(
  mindMap: ScriptMindMapData | null | undefined,
  activeNodeId?: string,
): AgentScriptContext {
  if (!mindMap?.nodes?.length) {
    return {
      currentNodeId: "booking-root",
      currentNodeLabel: "Запись",
      currentNodeContent: "Помоги пациенту записаться на приём.",
      compactPath: "",
      fullScript: "",
      outgoingTransitions: "",
    };
  }

  const rootId = findMindMapRootId(mindMap) ?? mindMap.nodes[0]!.id;
  const nodeId = activeNodeId && mindMap.nodes.some((n) => n.id === activeNodeId) ? activeNodeId : rootId;
  const node = mindMap.nodes.find((n) => n.id === nodeId)!;

  return {
    currentNodeId: node.id,
    currentNodeLabel: node.label,
    currentNodeContent: node.content?.trim() ?? "",
    currentFsmState: node.fsmState,
    compactPath: renderMindMapCompactPath(mindMap, nodeId),
    fullScript: renderMindMapScript(mindMap),
    outgoingTransitions: formatOutgoingTransitions(mindMap, nodeId),
  };
}

/** Validate mind map node transition: same node, outgoing edge, or any node if no edges defined. */
export function assertAllowedTransition(
  mindMap: ScriptMindMapData | null | undefined,
  fromNodeId: string | undefined,
  toNodeId: string | undefined,
): { allowed: boolean; reason?: string } {
  if (!toNodeId?.trim()) {
    return { allowed: true };
  }
  if (!mindMap?.nodes?.length) {
    return { allowed: true };
  }
  if (!mindMap.nodes.some((n) => n.id === toNodeId)) {
    return { allowed: false, reason: `Unknown node id: ${toNodeId}` };
  }
  if (!fromNodeId || fromNodeId === toNodeId) {
    return { allowed: true };
  }

  const outgoing = getMindMapOutgoingEdges(mindMap, fromNodeId);
  if (outgoing.length === 0) {
    return { allowed: true };
  }

  const direct = outgoing.some((o) => o.target.id === toNodeId);
  if (direct) return { allowed: true };

  const targetNode = mindMap.nodes.find((n) => n.id === toNodeId);
  const fromNode = mindMap.nodes.find((n) => n.id === fromNodeId);

  if (fromNodeId === "step2-branch" && toNodeId === "step2-qualification") {
    return { allowed: false, reason: "Cannot regress from branch selection to symptoms" };
  }

  if (targetNode?.fsmState && fromNode?.fsmState && targetNode.fsmState === fromNode.fsmState) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Transition ${fromNodeId} → ${toNodeId} is not connected by an edge`,
  };
}
