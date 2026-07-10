import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  CheckCircle2,
  GitBranch,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CHATBOT_FSM_STATES } from "@/lib/chatbot-fsm-states";
import {
  filterFocusGraph,
  getServiceBranchIds,
  hasSavedMindMapPositions,
  layoutMindMapPipeline,
  LAYOUT_NODE_W,
  LAYOUT_V_GAP,
  resolveMainPathIds,
} from "./mindmap-layout";
import { getFsmTone } from "./mindmap-theme";
import { MindMapNodePanel } from "./mindmap-node-panel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptMindMapNodeData extends Record<string, unknown> {
  label: string;
  content: string;
  isRoot?: boolean;
  fsmState?: string;
  isMainPath?: boolean;
  mainPathStep?: number;
}

export interface ScriptMindMapData {
  nodes: {
    id: string;
    label: string;
    content: string;
    isRoot?: boolean;
    fsmState?: string;
    position?: { x: number; y: number };
  }[];
  edges: { id: string; source: string; target: string; label?: string }[];
}

export type ScriptMindMapMode = "inline" | "fullscreen";

// ─── Custom node — polished step card ─────────────────────────────────────────

function MindMapNodeComponent({ data, selected }: NodeProps) {
  const d = data as ScriptMindMapNodeData;
  const tone = getFsmTone(d.fsmState);
  const fsmLabel = d.fsmState
    ? CHATBOT_FSM_STATES.find((s) => s.value === d.fsmState)?.label ?? d.fsmState
    : null;

  return (
    <div
      className={cn(
        "group relative w-[280px] min-h-[108px] rounded-2xl border bg-white/95 backdrop-blur-sm transition-all duration-200 select-none cursor-pointer overflow-hidden",
        d.isRoot
          ? "shadow-[0_8px_30px_rgba(31,117,254,0.18)]"
          : selected
            ? "shadow-[0_12px_40px_rgba(15,23,42,0.12)] scale-[1.02]"
            : "shadow-[0_4px_20px_rgba(15,23,42,0.06)] hover:shadow-[0_10px_32px_rgba(15,23,42,0.10)] hover:-translate-y-0.5",
      )}
      style={{
        borderColor: selected ? tone.accent : d.isRoot ? tone.accent : tone.border,
        boxShadow: selected ? `0 0 0 3px ${tone.accent}22` : undefined,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl"
        style={{ backgroundColor: d.isRoot ? "#1f75fe" : tone.accent }}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white !shadow-sm"
        style={{ backgroundColor: tone.accent }}
      />

      <div className="pl-4 pr-3.5 py-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {d.isRoot ? (
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1f75fe] text-white shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            ) : d.isMainPath && d.mainPathStep != null && d.mainPathStep > 0 ? (
              <span
                className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold text-white shadow-sm"
                style={{ backgroundColor: tone.accent }}
              >
                {d.mainPathStep}
              </span>
            ) : (
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                style={{ backgroundColor: tone.badge, color: tone.badgeText }}
              >
                •
              </span>
            )}
            <p
              className={cn(
                "text-[13px] font-semibold leading-snug line-clamp-2",
                d.isRoot ? "text-[#1f75fe]" : "text-[#0f172a]",
              )}
            >
              {d.label || <span className="font-normal italic text-[#94a3b8]">Без названия</span>}
            </p>
          </div>
          {d.isMainPath && !d.isRoot && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#1f75fe]/80 bg-[#1f75fe]/8 px-1.5 py-0.5 rounded-md">
              путь
            </span>
          )}
        </div>

        {fsmLabel && (
          <span
            className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: tone.badge, color: tone.badgeText }}
          >
            {fsmLabel}
          </span>
        )}

        {d.content ? (
          <p className="text-[12px] text-[#64748b] mt-2 leading-relaxed line-clamp-2">{d.content}</p>
        ) : (
          <p className="text-[11px] text-[#94a3b8] mt-2 italic">Нажмите, чтобы настроить шаг</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2 !border-white !shadow-sm"
        style={{ backgroundColor: tone.accent }}
      />
    </div>
  );
}

const nodeTypes = { mindmap: MindMapNodeComponent };

// ─── Default initial mind map ─────────────────────────────────────────────────

const DEFAULT_NODES: ScriptMindMapData["nodes"] = [
  {
    id: "greeting",
    label: "Приветствие",
    content:
      "Тепло поприветствуйте клиента от имени клиники Muslim Dent. Скажите, что рады помочь с любым вопросом по здоровью зубов. Спросите, какая услуга или проблема их интересует (лечение кариеса, чистка, отбеливание, брекеты, импланты, протезирование или что-то другое).",
    isRoot: true,
    fsmState: "greeting",
  },
  {
    id: "clarify_problem",
    label: "Уточнение проблемы",
    content:
      "На основе ответа клиента уточните детали проблемы. Если клиент назвал конкретную услугу — подтвердите и спросите, беспокоит ли что-то прямо сейчас (боль, дискомфорт) или это плановый визит.",
    fsmState: "collect_problem",
  },
  {
    id: "branch_selection",
    label: "Выбор филиала",
    content:
      "Спросите, какой филиал удобнее для посещения. Адреса, часы работы и контакты — только из материалов клиники (сайт и ссылки в настройках чатбота).",
    fsmState: "collect_branch",
  },
  {
    id: "booking",
    label: "Запись на приём",
    content:
      "Клиент готов записаться. Спросите, на какую дату и время удобно прийти. Часы работы — из материалов клиники. Предложите ближайшие доступные дни.",
    fsmState: "collect_datetime",
  },
  {
    id: "confirm_booking",
    label: "Подтверждение записи",
    content:
      "Подтвердите запись: повторите дату, время, адрес филиала и услугу. Контакт — из материалов клиники. Напомните взять документ, удостоверяющий личность. Спросите, есть ли ещё вопросы.",
    fsmState: "confirm_appointment",
  },
  {
    id: "handle_doubts",
    label: "Работа с сомнениями",
    content:
      "Клиент не уверен или хочет подумать. Мягко уточните, что именно останавливает — цена, страх процедуры или нужно больше информации.",
    fsmState: "dental_qa",
  },
  {
    id: "re_offer_booking",
    label: "Повторное предложение записи",
    content:
      "Клиент проявил интерес после работы с сомнениями. Предложите конкретное время для визита на бесплатную консультацию.",
    fsmState: "collect_datetime",
  },
  {
    id: "refusal_close",
    label: "Завершение (отказ)",
    content:
      "Клиент отказался записываться. Поблагодарите за обращение, скажите что всегда рады помочь.",
    fsmState: "done",
  },
];

const DEFAULT_EDGES: ScriptMindMapData["edges"] = [
  { id: "e1", source: "greeting", target: "clarify_problem" },
  { id: "e2", source: "clarify_problem", target: "branch_selection" },
  { id: "e3", source: "branch_selection", target: "booking", label: "Готов записаться" },
  { id: "e4", source: "booking", target: "confirm_booking" },
  { id: "e5", source: "branch_selection", target: "handle_doubts", label: "Нужно подумать" },
  { id: "e6", source: "handle_doubts", target: "re_offer_booking", label: "Согласен" },
  { id: "e7", source: "branch_selection", target: "refusal_close", label: "Отказ" },
  { id: "e8", source: "re_offer_booking", target: "booking" },
];

// ─── Converters ───────────────────────────────────────────────────────────────

const EDGE_STYLE = {
  type: "smoothstep" as const,
  style: { stroke: "#cbd5e1", strokeWidth: 1.75 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#cbd5e1", width: 18, height: 18 },
  labelStyle: { fontSize: 11, fill: "#475569", fontWeight: 600 },
  labelBgStyle: { fill: "#ffffff", fillOpacity: 0.98 },
  labelBgPadding: [6, 5] as [number, number],
  labelBgBorderRadius: 8,
};

const MAIN_PATH_EDGE_STYLE = {
  type: "smoothstep" as const,
  style: { stroke: "#1f75fe", strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#1f75fe", width: 20, height: 20 },
  labelStyle: { fontSize: 11, fill: "#1d4ed8", fontWeight: 600 },
  labelBgStyle: { fill: "#eff6ff", fillOpacity: 0.98 },
  labelBgPadding: [6, 5] as [number, number],
  labelBgBorderRadius: 8,
};

function makeFlowEdge(
  e: ScriptMindMapData["edges"][number],
  mainPathIds: string[],
): Edge {
  const onMainPath = mainPathIds.includes(e.source) && mainPathIds.includes(e.target);
  const base = onMainPath ? MAIN_PATH_EDGE_STYLE : EDGE_STYLE;
  return { ...e, ...base, ...(e.label ? { label: e.label } : {}) };
}

function makeFlowNode(n: ScriptMindMapData["nodes"][number]): Node {
  return {
    id: n.id,
    type: "mindmap",
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      content: n.content,
      isRoot: n.isRoot,
      fsmState: n.fsmState,
    },
  };
}

function toFlowGraph(raw: ScriptMindMapData, forceLayout: boolean): { nodes: Node[]; edges: Edge[] } {
  const mainPathIds = resolveMainPathIds(
    raw.nodes.map((n) => ({ id: n.id, isRoot: n.isRoot, fsmState: n.fsmState })),
    raw.edges.map((e) => ({ source: e.source, target: e.target })),
  );
  const edges = raw.edges.map((e) => makeFlowEdge(e, mainPathIds));
  let flowNodes = raw.nodes.map(makeFlowNode);
  const useSaved = !forceLayout && hasSavedMindMapPositions(raw.nodes);
  if (!useSaved) {
    flowNodes = layoutMindMapPipeline(flowNodes, edges);
  }
  return { nodes: flowNodes, edges };
}

function genId() {
  return `n_${crypto.randomUUID().slice(0, 8)}`;
}

// ─── ScriptMindMap canvas ─────────────────────────────────────────────────────

interface ScriptMindMapProps {
  initialData?: ScriptMindMapData | null;
  onSave: (data: ScriptMindMapData) => void;
  saveStatus?: "idle" | "saving" | "saved";
  mode?: ScriptMindMapMode;
}

export function ScriptMindMap({
  initialData,
  onSave,
  saveStatus = "idle",
  mode = "fullscreen",
}: ScriptMindMapProps) {
  const seed = initialData?.nodes?.length ? initialData : { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES };
  const [showAllBranches, setShowAllBranches] = useState(mode === "fullscreen");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const skipAutoSaveRef = useRef(true);

  const { nodes: initNodes, edges: initEdges } = toFlowGraph(seed, false);
  const [allNodes, setAllNodes, onNodesChange] = useNodesState(initNodes);
  const [allEdges, setAllEdges, onEdgesChange] = useEdgesState(initEdges);

  const branchHiddenIds = useMemo(
    () => getServiceBranchIds(
      allNodes.map((n) => ({
        id: n.id,
        fsmState: (n.data as ScriptMindMapNodeData).fsmState,
        label: (n.data as ScriptMindMapNodeData).label,
      })),
      allEdges.map((e) => ({ source: e.source, target: e.target })),
    ),
    [allNodes, allEdges],
  );

  const mainPathIds = useMemo(
    () =>
      resolveMainPathIds(
        allNodes.map((n) => ({
          id: n.id,
          isRoot: (n.data as ScriptMindMapNodeData).isRoot,
          fsmState: (n.data as ScriptMindMapNodeData).fsmState,
        })),
        allEdges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [allNodes, allEdges],
  );

  const styledAllEdges = useMemo(
    () =>
      allEdges.map((e) =>
        makeFlowEdge(
          {
            id: e.id,
            source: e.source,
            target: e.target,
            label: typeof e.label === "string" ? e.label : undefined,
          },
          mainPathIds,
        ),
      ),
    [allEdges, mainPathIds],
  );

  const enrichedNodes = useMemo(
    () =>
      allNodes.map((n) => {
        const pathIndex = mainPathIds.indexOf(n.id);
        return {
          ...n,
          data: {
            ...(n.data as ScriptMindMapNodeData),
            isMainPath: pathIndex >= 0,
            mainPathStep: pathIndex >= 0 ? pathIndex : undefined,
          },
        };
      }),
    [allNodes, mainPathIds],
  );

  const { nodes: displayNodes, edges: displayEdges } = useMemo(() => {
    if (showAllBranches) return { nodes: enrichedNodes, edges: styledAllEdges };
    return filterFocusGraph(enrichedNodes, styledAllEdges, mainPathIds, branchHiddenIds);
  }, [showAllBranches, enrichedNodes, styledAllEdges, mainPathIds, branchHiddenIds]);

  const branchCount = branchHiddenIds.size;

  const fitCanvas = useCallback(() => {
    const rf = flowRef.current;
    if (!rf) return;
    const focusIds = showAllBranches ? undefined : mainPathIds;
    requestAnimationFrame(() => {
      rf.fitView({
        padding: showAllBranches ? 0.2 : 0.35,
        minZoom: 0.5,
        maxZoom: showAllBranches ? 0.9 : 1.05,
        duration: 280,
        nodes: focusIds?.map((id) => ({ id })),
      });
    });
  }, [showAllBranches, mainPathIds]);

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas, displayNodes.length, mode]);

  const markDirty = useCallback(() => {
    skipAutoSaveRef.current = false;
  }, []);

  const placeChildNode = useCallback((parentId: string, newNode: Node, nodes: Node[], edges: Edge[]): Node => {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return { ...newNode, position: { x: 0, y: LAYOUT_V_GAP } };

    const siblings = edges
      .filter((e) => e.source === parentId)
      .map((e) => nodes.find((n) => n.id === e.target))
      .filter(Boolean) as Node[];

    const cols = Math.min(3, siblings.length + 1);
    const col = siblings.length % cols;
    const row = Math.floor(siblings.length / cols);

    return {
      ...newNode,
      position: {
        x: parent.position.x + col * (LAYOUT_NODE_W + 32) - (cols > 1 ? (cols - 1) * (LAYOUT_NODE_W + 32) / 2 : 0),
        y: parent.position.y + LAYOUT_V_GAP + row * (LAYOUT_V_GAP * 0.45),
      },
    };
  }, []);

  const relayoutAll = useCallback(() => {
    markDirty();
    setAllNodes((prev) => layoutMindMapPipeline(prev, allEdges));
    setTimeout(fitCanvas, 80);
  }, [allEdges, setAllNodes, markDirty, fitCanvas]);

  const addChild = useCallback(
    (parentId: string) => {
      markDirty();
      const id = genId();
      const newNode = makeFlowNode({ id, label: "Новый шаг", content: "" });
      setAllEdges((prev) => {
        const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentId, target: id }, mainPathIds);
        setAllNodes((pn) => [...pn, placeChildNode(parentId, newNode, pn, prev)]);
        return [...prev, newEdge];
      });
      setSelectedId(id);
    },
    [setAllNodes, setAllEdges, markDirty, placeChildNode, mainPathIds],
  );

  const fork = useCallback(
    (siblingId: string) => {
      markDirty();
      const id = genId();
      const newNode = makeFlowNode({ id, label: "Новая ветка", content: "" });
      setAllEdges((prev) => {
        const parentEdge = prev.find((e) => e.target === siblingId);
        if (!parentEdge) {
          setAllNodes((pn) => [...pn, { ...newNode, position: { x: pn.length * (LAYOUT_NODE_W + 32), y: 0 } }]);
          return prev;
        }
        const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentEdge.source, target: id }, mainPathIds);
        setAllNodes((pn) => {
          const sibling = pn.find((n) => n.id === siblingId);
          const placed = sibling
            ? { ...newNode, position: { x: sibling.position.x + LAYOUT_NODE_W + 32, y: sibling.position.y } }
            : placeChildNode(parentEdge.source, newNode, pn, prev);
          return [...pn, placed];
        });
        return [...prev, newEdge];
      });
      setSelectedId(id);
    },
    [setAllNodes, setAllEdges, markDirty, placeChildNode, mainPathIds],
  );

  const remove = useCallback(
    (id: string) => {
      markDirty();
      if (selectedId === id) setSelectedId(null);
      setAllEdges((prevEdges) => {
        const ch: Record<string, string[]> = {};
        prevEdges.forEach((e) => { ch[e.source] = [...(ch[e.source] ?? []), e.target]; });
        const toRemove = new Set<string>();
        const q = [id];
        while (q.length) {
          const cur = q.pop()!;
          toRemove.add(cur);
          (ch[cur] ?? []).forEach((k) => q.push(k));
        }
        const newEdges = prevEdges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
        setAllNodes((pn) => pn.filter((n) => !toRemove.has(n.id)));
        return newEdges;
      });
    },
    [setAllNodes, setAllEdges, markDirty, selectedId],
  );

  const update = useCallback(
    (id: string, label: string, content: string, fsmState?: string) => {
      markDirty();
      setAllNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label, content, fsmState } } : n,
        ),
      );
    },
    [setAllNodes, markDirty],
  );

  const serializeData = useCallback((): ScriptMindMapData => ({
    nodes: allNodes.map((n) => ({
      id: n.id,
      label: (n.data as ScriptMindMapNodeData).label,
      content: (n.data as ScriptMindMapNodeData).content,
      isRoot: (n.data as ScriptMindMapNodeData).isRoot,
      fsmState: (n.data as ScriptMindMapNodeData).fsmState,
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: allEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
  }), [allNodes, allEdges]);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleSave = useCallback(() => {
    markDirty();
    onSaveRef.current(serializeData());
  }, [serializeData, markDirty]);

  useEffect(() => {
    if (skipAutoSaveRef.current) return;
    const timer = setTimeout(() => onSaveRef.current(serializeData()), 1200);
    return () => clearTimeout(timer);
  }, [allNodes, allEdges, serializeData]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (changes.some((c) => c.type === "position" || c.type === "remove")) markDirty();
      onNodesChange(changes);
    },
    [onNodesChange, markDirty],
  );

  const selectedNode = allNodes.find((n) => n.id === selectedId);
  const selectedData = selectedNode?.data as ScriptMindMapNodeData | undefined;

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  return (
    <div className="relative flex h-full w-full min-h-0 bg-[#f8fafc]">
      <div className="flex-1 min-w-0">
        <ReactFlow
          nodes={displayNodes.map((n) => ({ ...n, selected: n.id === selectedId }))}
          edges={displayEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          onInit={(inst) => { flowRef.current = inst; fitCanvas(); }}
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={EDGE_STYLE}
          className="mindmap-flow"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.2}
            color="#cbd5e1"
            className="!bg-[radial-gradient(ellipse_at_top,#f8fbff_0%,#f1f5f9_45%,#eef2f7_100%)]"
          />
          <Controls
            showInteractive={false}
            className="!shadow-[0_8px_24px_rgba(15,23,42,0.08)] !border !border-white/80 !rounded-2xl !overflow-hidden !bg-white/90 !backdrop-blur-md"
          />
          {mode === "fullscreen" && (
            <MiniMap
              className="!rounded-2xl !border !border-white/80 !shadow-[0_8px_24px_rgba(15,23,42,0.08)] !bg-white/90 !backdrop-blur-md"
              nodeColor={(n) => {
                const d = n.data as ScriptMindMapNodeData;
                if (d.isRoot) return "#1f75fe";
                return getFsmTone(d.fsmState).accent;
              }}
              maskColor="rgb(248 250 252 / 0.82)"
              pannable
              zoomable
            />
          )}
          <Panel position="top-left" className="m-3">
            <div className="rounded-2xl border border-white/80 bg-white/90 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.08)] px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-[#0f172a]">Сценарий записи</p>
              <p className="text-[10px] text-[#64748b] mt-0.5">
                {showAllBranches ? "Все ветки" : "Главный путь"} · {displayNodes.length} узлов
              </p>
            </div>
          </Panel>
          <Panel position="top-right" className="m-3 flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/80 bg-white/90 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.08)] p-2">
              {branchCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllBranches((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                    showAllBranches
                      ? "bg-[#f8fafc] text-[#64748b] hover:bg-[#f1f5f9]"
                      : "bg-[#1f75fe] text-white shadow-sm hover:bg-[#1a65e8]",
                  )}
                >
                  {showAllBranches ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      Главный путь
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      Все ветки (+{branchCount})
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={relayoutAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#f8fafc] text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
                title="Перестроить расположение узлов"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Перестроить
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  saveStatus === "saved"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-[#1f75fe] text-white shadow-sm hover:bg-[#1a65e8]",
                  saveStatus === "saving" && "opacity-70 cursor-not-allowed",
                )}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveStatus === "saving" ? "…" : saveStatus === "saved" ? "Сохранено" : "Сохранить"}
              </button>
            </div>
            {!showAllBranches && branchCount > 0 && (
              <p className="text-[10px] text-[#64748b] bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/80 shadow-sm max-w-[240px] text-right">
                Скрыто {branchCount} веток услуг · «Все ветки» для полной карты
              </p>
            )}
          </Panel>
          {mode === "inline" && (
            <Panel position="bottom-left" className="m-3">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#64748b] bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/80 shadow-sm">
                <LayoutGrid className="h-3 w-3 text-[#1f75fe]" />
                Клик по узлу — редактирование справа
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {selectedNode && selectedData && (
        <div
          className={cn(
            "shrink-0 border-l border-[#e8e3d9] bg-white z-10 shadow-[-8px_0_32px_rgba(15,23,42,0.06)]",
            mode === "inline"
              ? "absolute inset-y-0 right-0 w-[min(100%,340px)]"
              : "relative w-[min(100%,380px)]",
          )}
        >
          <MindMapNodePanel
            nodeId={selectedNode.id}
            data={selectedData}
            onClose={() => setSelectedId(null)}
            onUpdate={update}
            onAddChild={addChild}
            onFork={fork}
            onRemove={remove}
          />
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ScriptMindMapModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: ScriptMindMapData | null;
  onSave: (data: ScriptMindMapData) => void;
  saveStatus?: "idle" | "saving" | "saved";
}

export function ScriptMindMapModal({
  open,
  onClose,
  initialData,
  onSave,
  saveStatus,
}: ScriptMindMapModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f1f5f9] font-manrope">
      <div className="shrink-0 flex items-center gap-4 px-5 py-4 bg-white border-b border-[#e8e3d9] shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#60a5fa] text-white shadow-sm shrink-0">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[#0f172a]">Скрипт диалога</p>
          <p className="text-xs text-[#64748b] leading-tight mt-0.5">
            Главный путь подсвечен синим · цвет узла = этап FSM · клик — редактирование
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-[#f1f5f9] transition-colors shrink-0"
        >
          <X className="h-5 w-5 text-[#64748b]" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <ScriptMindMap
          key="fullscreen"
          initialData={initialData}
          onSave={onSave}
          saveStatus={saveStatus}
          mode="fullscreen"
        />
      </div>
    </div>
  );
}
