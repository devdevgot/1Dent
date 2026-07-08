import type { ChatbotState } from "./chatbot.types";

export interface ScriptMindMapNode {
  id: string;
  label: string;
  content: string;
  isRoot?: boolean;
  fsmState?: ChatbotState | string;
  position?: { x: number; y: number };
}

export interface ScriptMindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ScriptMindMapData {
  nodes: ScriptMindMapNode[];
  edges: ScriptMindMapEdge[];
}

const SERVICE_TYPE_KEYWORDS: Record<string, string[]> = {
  therapy: ["болит", "боль", "кариес", "пульпит", "чувствитель", "терап"],
  hygiene: ["чистк", "гигиен", "налёт", "налет", "отбел", "профилакт"],
  surgery: ["удал", "имплант", "синус", "хирург", "жулу", "суыру"],
  orthopedics: ["корон", "протез", "винир", "мост", "ортопед"],
  orthodontics: ["брекет", "прикус", "элайнер", "ортодонт", "выровн"],
  consultation: ["консульт", "осмотр", "справк", "вопрос"],
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function edgeMatches(
  edge: ScriptMindMapEdge,
  targetNode: ScriptMindMapNode | undefined,
  serviceType?: string,
  userText?: string,
): number {
  let score = 0;
  const haystack = normalizeText(`${userText ?? ""} ${targetNode?.label ?? ""} ${targetNode?.content ?? ""}`);
  const label = edge.label?.trim();

  if (label) {
    const labelNorm = normalizeText(label);
    if (haystack.includes(labelNorm)) score += 3;
    for (const token of labelNorm.split(/[\s,/|–-]+/).filter((t) => t.length > 3)) {
      if (haystack.includes(token)) score += 1;
    }
  }

  if (serviceType && SERVICE_TYPE_KEYWORDS[serviceType]) {
    for (const kw of SERVICE_TYPE_KEYWORDS[serviceType]!) {
      if (haystack.includes(kw) || label?.toLowerCase().includes(kw)) score += 2;
    }
  }

  if (targetNode?.label) {
    const targetNorm = normalizeText(targetNode.label);
    if (targetNorm.length > 2 && haystack.includes(targetNorm)) score += 2;
  }

  return score;
}

/** Find parent node whose children include the target FSM state (for service-type branches). */
export function findMindMapBranchParent(
  mindMap: ScriptMindMapData | null | undefined,
  childFsmState: ChatbotState | string,
): ScriptMindMapNode | null {
  if (!mindMap?.nodes?.length) return null;

  const nodeById = new Map(mindMap.nodes.map((n) => [n.id, n]));
  let best: ScriptMindMapNode | null = null;
  let bestCount = 0;

  for (const node of mindMap.nodes) {
    const childCount = mindMap.edges.filter((edge) => {
      if (edge.source !== node.id) return false;
      return nodeById.get(edge.target)?.fsmState === childFsmState;
    }).length;
    if (childCount > bestCount) {
      bestCount = childCount;
      best = node;
    }
  }

  return bestCount > 0 ? best : null;
}

function followMindMapPathToState(
  mindMap: ScriptMindMapData,
  fromNodeId: string,
  targetState: ChatbotState | string,
  maxDepth = 3,
): ScriptMindMapNode | null {
  const nodeById = new Map(mindMap.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: fromNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const node = nodeById.get(current.id);
    if (!node) continue;
    if (node.fsmState === targetState) return node;

    if (current.depth >= maxDepth) continue;
    for (const edge of mindMap.edges) {
      if (edge.source === current.id) {
        queue.push({ id: edge.target, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

/** Sync active mind-map node id when FSM state changes. */
export function resolveMindMapNodeIdForState(
  mindMap: ScriptMindMapData | null | undefined,
  state: ChatbotState | string,
  opts: { serviceType?: string; userText?: string; activeNodeId?: string } = {},
): string | undefined {
  if (opts.activeNodeId && mindMap?.nodes?.length) {
    const active = mindMap.nodes.find((n) => n.id === opts.activeNodeId);
    if (active?.fsmState === state) return opts.activeNodeId;

    const nextOnPath = followMindMapPathToState(mindMap, opts.activeNodeId, state);
    if (nextOnPath) return nextOnPath.id;
  }

  const node = resolveActiveMindMapNode(mindMap, state, {
    serviceType: opts.serviceType,
    userText: opts.userText,
    parentFsmState: state,
  });
  return node?.id;
}

/** Find node linked to an FSM state (first match). */
export function findMindMapNodeByFsmState(
  mindMap: ScriptMindMapData | null | undefined,
  state: ChatbotState | string,
): ScriptMindMapNode | null {
  if (!mindMap?.nodes?.length) return null;
  return mindMap.nodes.find((n) => n.fsmState === state) ?? null;
}

/** Pick best child branch from a parent node using edge labels + serviceType + user text. */
export function matchMindMapBranch(
  mindMap: ScriptMindMapData | null | undefined,
  parentNodeId: string,
  opts: { serviceType?: string; userText?: string } = {},
): { node: ScriptMindMapNode; edge: ScriptMindMapEdge } | null {
  if (!mindMap?.nodes?.length) return null;

  const nodeById = new Map(mindMap.nodes.map((n) => [n.id, n]));
  const childEdges = mindMap.edges.filter((e) => e.source === parentNodeId);
  if (childEdges.length === 0) return null;

  let best: { node: ScriptMindMapNode; edge: ScriptMindMapEdge; score: number } | null = null;
  for (const edge of childEdges) {
    const node = nodeById.get(edge.target);
    if (!node) continue;
    const score = edgeMatches(edge, node, opts.serviceType, opts.userText);
    if (!best || score > best.score) best = { node, edge, score };
  }

  if (!best || best.score <= 0) return null;
  return { node: best.node, edge: best.edge };
}

/** Resolve active mind-map node for the current FSM state (+ optional branch match). */
export function resolveActiveMindMapNode(
  mindMap: ScriptMindMapData | null | undefined,
  state: ChatbotState | string,
  opts: { serviceType?: string; userText?: string; parentFsmState?: ChatbotState | string } = {},
): ScriptMindMapNode | null {
  if (!mindMap?.nodes?.length) return null;

  const branchState = opts.parentFsmState ?? state;

  if (opts.serviceType || opts.userText) {
    const branchParent = findMindMapBranchParent(mindMap, branchState);
    if (branchParent) {
      const branch = matchMindMapBranch(mindMap, branchParent.id, opts);
      if (branch) return branch.node;
    }

    const parent = findMindMapNodeByFsmState(mindMap, branchState);
    if (parent) {
      const branch = matchMindMapBranch(mindMap, parent.id, opts);
      if (branch) return branch.node;
    }
  }

  return findMindMapNodeByFsmState(mindMap, state);
}

/** Render mind map as prompt text (includes edge labels and fsmState). */
export function renderMindMapScript(
  mindMap: ScriptMindMapData | null | undefined,
): string {
  if (!mindMap?.nodes?.length) return "";

  const { nodes, edges = [] } = mindMap;
  const childrenMap: Record<string, Array<{ targetId: string; label?: string }>> = {};
  const hasParent = new Set<string>();

  for (const edge of edges) {
    if (!childrenMap[edge.source]) childrenMap[edge.source] = [];
    childrenMap[edge.source].push({ targetId: edge.target, label: edge.label });
    hasParent.add(edge.target);
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  if (roots.length === 0) return "";

  function renderNode(id: string, depth: number): string {
    const node = nodeById.get(id);
    if (!node) return "";
    const indent = "  ".repeat(depth);
    const bullet = depth === 0 ? "▶" : "–";
    let out = `${indent}${bullet} ${node.label}`;
    if (node.fsmState) out += ` [этап: ${node.fsmState}]`;
    if (node.content?.trim()) out += `\n${indent}  ${node.content.trim()}`;
    out += "\n";

    for (const child of childrenMap[id] ?? []) {
      if (child.label?.trim()) {
        out += `${indent}  ↳ если «${child.label.trim()}»:\n`;
      }
      out += renderNode(child.targetId, depth + (child.label?.trim() ? 2 : 1));
    }
    return out;
  }

  let text =
    "\n\nСКРИПТ ДИАЛОГА — МАЙНД-МЭП КЛИНИКИ (это ГЛАВНЫЙ сценарий — строго следуй структуре веток при общении с пациентом):\n";
  for (const root of roots) {
    text += renderNode(root.id, 0);
  }
  return text;
}

/** Extra prompt section for the currently active script node. */
export function buildActiveMindMapContext(
  mindMap: ScriptMindMapData | null | undefined,
  state: ChatbotState | string,
  opts: { serviceType?: string; userText?: string; activeNodeId?: string } = {},
): string {
  let node: ScriptMindMapNode | null = null;
  if (opts.activeNodeId && mindMap?.nodes?.length) {
    node = mindMap.nodes.find((n) => n.id === opts.activeNodeId) ?? null;
  }
  if (!node) {
    node = resolveActiveMindMapNode(mindMap, state, {
      serviceType: opts.serviceType,
      userText: opts.userText,
      parentFsmState: state,
    });
  }
  if (!node) return "";

  let text = `\n\nТЕКУЩИЙ УЗЕЛ СКРИПТА: «${node.label}»`;
  if (node.fsmState) text += ` (этап ${node.fsmState})`;
  if (node.content?.trim()) text += `\nИнструкция узла: ${node.content.trim()}`;
  text += "\nСледуй этому узлу в текущем ответе.";
  return text;
}
