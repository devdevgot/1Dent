import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

export const LAYOUT_NODE_W = 300;
export const LAYOUT_NODE_H = 120;
export const LAYOUT_H_GAP = 32;
export const LAYOUT_V_GAP = 80;
export const LAYOUT_MAX_COLS = 3;

/** Default booking spine — used for focus mode when ids match. */
export const DEFAULT_MAIN_PATH_IDS = [
  "booking-root",
  "step1-intro",
  "step2-qualification",
  "step2-branch",
  "step2-doctor",
  "step3-decision",
  "step3-ready",
  "step4-booking",
  "step4-confirm",
];

export function hasSavedMindMapPositions(
  nodes: Array<{ position?: { x: number; y: number } }>,
): boolean {
  return nodes.some((n) => {
    const p = n.position;
    if (!p) return false;
    return Math.abs(p.x) > 8 || Math.abs(p.y) > 8;
  });
}

/** Longest-path layering for DAG (supports merge nodes like step2-qualification). */
export function computeDagLevels(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
  rootIds: string[],
): Map<string, number> {
  const parents: Record<string, string[]> = {};
  nodeIds.forEach((id) => { parents[id] = []; });
  edges.forEach((e) => {
    if (!parents[e.target]) parents[e.target] = [];
    parents[e.target].push(e.source);
  });

  const level = new Map<string, number>();
  rootIds.forEach((id) => level.set(id, 0));

  let changed = true;
  let guard = 0;
  while (changed && guard++ < nodeIds.length + 4) {
    changed = false;
    for (const id of nodeIds) {
      const ps = parents[id] ?? [];
      if (ps.length === 0) continue;
      const next = Math.max(...ps.map((p) => level.get(p) ?? 0)) + 1;
      if ((level.get(id) ?? -1) < next) {
        level.set(id, next);
        changed = true;
      }
    }
  }

  for (const id of nodeIds) {
    if (!level.has(id)) level.set(id, 0);
  }
  return level;
}

function gridCols(count: number): number {
  return Math.min(LAYOUT_MAX_COLS, Math.max(1, count));
}

function gridWidth(count: number): number {
  const cols = gridCols(count);
  return cols * LAYOUT_NODE_W + (cols - 1) * LAYOUT_H_GAP;
}

/** Pipeline layout: vertical levels, siblings in 2–3 column grid (max ~960px wide). */
export function layoutMindMapPipeline(nodes: Node[], edges: Edge[]): Node[] {
  if (!nodes.length) return nodes;

  const nodeIds = nodes.map((n) => n.id);
  const ch: Record<string, string[]> = {};
  const hasParent: Record<string, boolean> = {};
  nodeIds.forEach((id) => { ch[id] = []; hasParent[id] = false; });
  edges.forEach((e) => {
    ch[e.source] = [...(ch[e.source] ?? []), e.target];
    hasParent[e.target] = true;
  });

  const roots = nodes.filter((n) => !hasParent[n.id]).map((n) => n.id);
  const edgePairs = edges.map((e) => ({ source: e.source, target: e.target }));
  const levels = computeDagLevels(nodeIds, edgePairs, roots.length ? roots : [nodeIds[0]!]);

  const byLevel = new Map<number, string[]>();
  for (const id of nodeIds) {
    const l = levels.get(id) ?? 0;
    byLevel.set(l, [...(byLevel.get(l) ?? []), id]);
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  const pos: Record<string, { x: number; y: number }> = {};

  for (const level of sortedLevels) {
    const ids = byLevel.get(level) ?? [];
    const cols = gridCols(ids.length);
    const rowW = gridWidth(ids.length);
    const leftX = -rowW / 2;
    const y = level * (LAYOUT_NODE_H + LAYOUT_V_GAP);

    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos[id] = {
        x: leftX + col * (LAYOUT_NODE_W + LAYOUT_H_GAP),
        y: y + row * (LAYOUT_NODE_H + LAYOUT_V_GAP * 0.45),
      };
    });
  }

  return nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
}

/** Service-type branches (e.g. 7 услуг под intro) — hide in focus mode. */
export function getServiceBranchIds(
  nodes: Array<{ id: string; fsmState?: string; label?: string }>,
  edges: Array<{ source: string; target: string }>,
): Set<string> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const childCount: Record<string, number> = {};
  edges.forEach((e) => { childCount[e.source] = (childCount[e.source] ?? 0) + 1; });

  const hidden = new Set<string>();
  for (const e of edges) {
    const parent = nodeById.get(e.source);
    if ((childCount[e.source] ?? 0) <= 3) continue;
    const child = nodeById.get(e.target);
    if (child?.fsmState === "collect_problem") {
      hidden.add(e.target);
    }
  }
  return hidden;
}

export function resolveMainPathIds(
  nodes: Array<{ id: string; isRoot?: boolean; fsmState?: string }>,
  edges: Array<{ source: string; target: string }>,
): string[] {
  const known = DEFAULT_MAIN_PATH_IDS.filter((id) => nodes.some((n) => n.id === id));
  if (known.length >= 4) return known;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const children: Record<string, string[]> = {};
  const hasParent: Record<string, boolean> = {};
  nodes.forEach((n) => { children[n.id] = []; hasParent[n.id] = false; });
  edges.forEach((e) => {
    children[e.source] = [...(children[e.source] ?? []), e.target];
    hasParent[e.target] = true;
  });

  let cur =
    nodes.find((n) => n.isRoot || n.id === "booking-root")?.id ??
    nodes.find((n) => !hasParent[n.id])?.id ??
    nodes[0]?.id;
  if (!cur) return [];

  const path: string[] = [cur];
  const spineFsm = [
    "greeting",
    "collect_qualification",
    "suggest_doctor",
    "await_decision",
    "collect_datetime",
    "confirm_appointment",
  ];

  for (let step = 0; step < 12; step++) {
    const kids = children[cur] ?? [];
    if (!kids.length) break;

    const next =
      kids.find((id) => spineFsm.includes(nodeById.get(id)?.fsmState ?? "")) ??
      kids.find((id) => (children[id]?.length ?? 0) > 0) ??
      kids[0];
    if (!next || path.includes(next)) break;
    path.push(next);
    cur = next;
  }

  return path;
}

function pathExistsViaHidden(
  edges: Array<{ source: string; target: string }>,
  from: string,
  to: string,
  hiddenIds: Set<string>,
): boolean {
  if (from === to) return true;
  const queue = [from];
  const seen = new Set<string>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.source !== cur) continue;
      if (e.target === to) return true;
      if (seen.has(e.target)) continue;
      if (!hiddenIds.has(e.target)) continue;
      seen.add(e.target);
      queue.push(e.target);
    }
  }
  return false;
}

export function filterFocusGraph(
  nodes: Node[],
  edges: Edge[],
  mainPathIds: string[],
  hideBranchIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const keep = new Set(mainPathIds.filter((id) => !hideBranchIds.has(id)));
  const visibleNodes = nodes.filter((n) => keep.has(n.id));
  const edgePairs = edges.map((e) => ({ source: e.source, target: e.target }));

  const visibleEdges: Edge[] = edges.filter((e) => keep.has(e.source) && keep.has(e.target));

  for (let i = 0; i < mainPathIds.length - 1; i++) {
    const from = mainPathIds[i]!;
    const to = mainPathIds[i + 1]!;
    if (!keep.has(from) || !keep.has(to)) continue;
    const hasDirect = visibleEdges.some((e) => e.source === from && e.target === to);
    if (hasDirect) continue;
    if (pathExistsViaHidden(edgePairs, from, to, hideBranchIds)) {
      visibleEdges.push({
        id: `focus-bridge-${from}-${to}`,
        source: from,
        target: to,
        type: "smoothstep",
        style: { stroke: "#93c5fd", strokeWidth: 2, strokeDasharray: "6 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#93c5fd" },
      } as Edge);
    }
  }

  return { nodes: visibleNodes, edges: visibleEdges };
}
