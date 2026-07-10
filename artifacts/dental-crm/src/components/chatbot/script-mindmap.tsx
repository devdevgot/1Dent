import "@xyflow/react/dist/style.css";
import "./mindmap-canvas.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  countHiddenOffSpineNodes,
  filterFocusGraph,
  getFocusSpineIds,
  getServiceBranchIds,
  hasSavedMindMapPositions,
  layoutFocusSpine,
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
  isBranch?: boolean;
  compactLayout?: boolean;
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

export type MindMapSaveMeta = {
  /** auto = debounced autosave while editing; manual = explicit Save button */
  source?: "auto" | "manual";
};

// ─── Custom node — borderless, branch nodes stay light ────────────────────────

function MindMapNodeComponent({ data, selected }: NodeProps) {
  const d = data as ScriptMindMapNodeData;
  const tone = getFsmTone(d.fsmState);
  const isBranch = d.isBranch ?? (!d.isRoot && !d.isMainPath);
  const compact = d.compactLayout ?? false;
  const fsmLabel = d.fsmState
    ? CHATBOT_FSM_STATES.find((s) => s.value === d.fsmState)?.label ?? d.fsmState
    : null;

  const cardStyle: CSSProperties = isBranch
    ? {
        background: "rgba(255, 255, 255, 0.72)",
        boxShadow: selected
          ? "0 8px 28px rgba(15, 23, 42, 0.08)"
          : "0 1px 2px rgba(15, 23, 42, 0.04)",
      }
    : d.isRoot
      ? {
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
          boxShadow: selected
            ? "0 10px 32px rgba(31, 117, 254, 0.14)"
            : "0 4px 16px rgba(31, 117, 254, 0.08)",
        }
      : {
          background: `linear-gradient(180deg, #ffffff 0%, ${tone.accentSoft} 100%)`,
          boxShadow: selected
            ? `0 10px 28px ${tone.accent}18`
            : "0 2px 8px rgba(15, 23, 42, 0.05)",
        };

  return (
    <div
      className={cn(
        "group relative w-[264px] rounded-[18px] transition-all duration-200 select-none cursor-pointer overflow-hidden",
        compact ? "min-h-[68px]" : "min-h-[96px]",
        selected && "scale-[1.01]",
        !selected && !isBranch && "hover:-translate-y-px",
      )}
      style={cardStyle}
    >
      {!isBranch && (
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: d.isRoot
              ? "linear-gradient(90deg, #1f75fe, #60a5fa)"
              : `linear-gradient(90deg, ${tone.accent}88, ${tone.accent})`,
          }}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !rounded-full !min-w-0 !min-h-0"
        style={{ backgroundColor: isBranch ? "#cbd5e1" : tone.accent }}
      />

      <div className={cn(compact ? "px-3 py-2" : "px-3.5 py-3")}>
        <div className="flex items-start gap-2.5">
          {d.isMainPath && d.mainPathStep != null && d.mainPathStep > 0 ? (
            <span
              className={cn(
                "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
                compact ? "h-4 min-w-4 text-[9px]" : "h-5 min-w-5 text-[10px]",
              )}
              style={{ backgroundColor: `${tone.accent}14`, color: tone.accent }}
            >
              {d.mainPathStep}
            </span>
          ) : d.isRoot ? (
            <span className={cn(
              "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 text-[#1f75fe]",
              compact ? "h-4 w-4" : "h-5 w-5",
            )}>
              <Sparkles className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            </span>
          ) : (
            <span
              className={cn(
                "shrink-0 rounded-full",
                compact ? "mt-1.5 h-1 w-1" : "mt-2 h-1.5 w-1.5",
              )}
              style={{ backgroundColor: isBranch ? "#cbd5e1" : `${tone.accent}55` }}
            />
          )}

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-medium leading-snug",
                compact ? "text-[12px] line-clamp-1" : "text-[13px] line-clamp-2",
                isBranch ? "text-[#64748b]" : d.isRoot ? "text-[#1f75fe]" : "text-[#0f172a]",
              )}
            >
              {d.label || <span className="font-normal italic text-[#94a3b8]">Без названия</span>}
            </p>

            {fsmLabel && !isBranch && !compact && (
              <p className="text-[10px] font-medium mt-1" style={{ color: tone.text }}>
                {fsmLabel}
              </p>
            )}

            {d.content ? (
              <p
                className={cn(
                  "leading-relaxed",
                  compact
                    ? "text-[10px] mt-0.5 line-clamp-1 text-[#94a3b8]"
                    : "text-[11px] mt-1.5 line-clamp-2",
                  !compact && (isBranch ? "text-[#94a3b8]" : "text-[#64748b]"),
                )}
              >
                {d.content}
              </p>
            ) : !compact ? (
              <p className="text-[10px] text-[#94a3b8] mt-1.5 italic">Нажмите для настройки</p>
            ) : null}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !rounded-full !min-w-0 !min-h-0"
        style={{ backgroundColor: isBranch ? "#cbd5e1" : tone.accent }}
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
  type: "bezier" as const,
  style: { stroke: "#e2e8f0", strokeWidth: 1 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#e2e8f0", width: 14, height: 14 },
  labelStyle: { fontSize: 10, fill: "#94a3b8", fontWeight: 500 },
  labelBgStyle: { fill: "transparent", fillOpacity: 0 },
  labelBgPadding: [0, 0] as [number, number],
  labelBgBorderRadius: 0,
};

const MAIN_PATH_EDGE_STYLE = {
  type: "bezier" as const,
  style: { stroke: "#93c5fd", strokeWidth: 1.25 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#93c5fd", width: 14, height: 14 },
  labelStyle: { fontSize: 10, fill: "#64748b", fontWeight: 500 },
  labelBgStyle: { fill: "transparent", fillOpacity: 0 },
  labelBgPadding: [0, 0] as [number, number],
  labelBgBorderRadius: 0,
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
  onSave: (data: ScriptMindMapData, meta?: MindMapSaveMeta) => void;
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
  const [showAllBranches, setShowAllBranches] = useState(false);
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

  const focusSpineIds = useMemo(
    () =>
      getFocusSpineIds(
        mainPathIds,
        allNodes.map((n) => ({ id: n.id })),
      ),
    [mainPathIds, allNodes],
  );

  const hiddenNodeCount = useMemo(
    () => countHiddenOffSpineNodes(allNodes.map((n) => n.id), focusSpineIds),
    [allNodes, focusSpineIds],
  );

  const pathIdsForDisplay = showAllBranches ? mainPathIds : focusSpineIds;

  const enrichedNodes = useMemo(
    () =>
      allNodes.map((n) => {
        const pathIndex = pathIdsForDisplay.indexOf(n.id);
        const isMainPath = pathIndex >= 0;
        const d = n.data as ScriptMindMapNodeData;
        return {
          ...n,
          data: {
            ...d,
            isMainPath,
            mainPathStep: isMainPath ? pathIndex : undefined,
            isBranch: !d.isRoot && !isMainPath,
            compactLayout: !showAllBranches,
          },
        };
      }),
    [allNodes, pathIdsForDisplay, showAllBranches],
  );

  const { nodes: displayNodes, edges: displayEdges } = useMemo(() => {
    if (showAllBranches) return { nodes: enrichedNodes, edges: styledAllEdges };
    return filterFocusGraph(enrichedNodes, styledAllEdges, focusSpineIds, branchHiddenIds);
  }, [showAllBranches, enrichedNodes, styledAllEdges, focusSpineIds, branchHiddenIds]);

  const branchCount = hiddenNodeCount;

  const fitCanvas = useCallback(() => {
    const rf = flowRef.current;
    if (!rf) return;
    const focusIds = showAllBranches ? undefined : focusSpineIds;
    requestAnimationFrame(() => {
      rf.fitView({
        padding: showAllBranches ? 0.16 : 0.08,
        minZoom: 0.45,
        maxZoom: showAllBranches ? 0.9 : 1.35,
        duration: 280,
        nodes: focusIds?.map((id) => ({ id })),
      });
    });
  }, [showAllBranches, focusSpineIds]);

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
    if (showAllBranches) {
      setAllNodes((prev) => layoutMindMapPipeline(prev, allEdges));
    } else {
      setAllNodes((prev) => layoutFocusSpine(prev, focusSpineIds));
    }
    setTimeout(fitCanvas, 80);
  }, [allEdges, setAllNodes, markDirty, fitCanvas, showAllBranches, focusSpineIds]);

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
    onSaveRef.current(serializeData(), { source: "manual" });
  }, [serializeData, markDirty]);

  useEffect(() => {
    if (skipAutoSaveRef.current) return;
    const timer = setTimeout(() => onSaveRef.current(serializeData(), { source: "auto" }), 1200);
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
    <div className="relative flex h-full w-full min-h-0 bg-[#f6f8fb]">
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
          connectionLineStyle={{ stroke: "#cbd5e1", strokeWidth: 1 }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="#e8edf3"
          />
          <Controls
            showInteractive={false}
            className="!rounded-xl !overflow-hidden !bg-white/80 !backdrop-blur-sm"
          />
          {mode === "fullscreen" && (
            <MiniMap
              className="!rounded-xl !bg-white/80 !backdrop-blur-sm"
              nodeColor={(n) => {
                const d = n.data as ScriptMindMapNodeData;
                if (d.isBranch) return "#e2e8f0";
                if (d.isRoot) return "#93c5fd";
                return getFsmTone(d.fsmState).accent;
              }}
              maskColor="rgb(246 248 251 / 0.85)"
              pannable
              zoomable
            />
          )}
          <Panel position="top-left" className="m-3">
            <div className="rounded-xl bg-white/75 backdrop-blur-sm shadow-[0_2px_12px_rgba(15,23,42,0.05)] px-3 py-2">
              <p className="text-[11px] font-medium text-[#475569]">
                {showAllBranches ? "Все ветки" : "Основной сценарий"}
                <span className="text-[#94a3b8]"> · {displayNodes.length} шагов</span>
              </p>
              {!showAllBranches && branchCount > 0 && (
                <p className="text-[10px] text-[#94a3b8] mt-0.5">
                  +{branchCount} веток скрыто
                </p>
              )}
            </div>
          </Panel>
          <Panel position="top-right" className="m-3 flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-xl bg-white/75 backdrop-blur-sm shadow-[0_2px_12px_rgba(15,23,42,0.05)] p-1.5">
              {hiddenNodeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllBranches((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    showAllBranches
                      ? "text-[#1f75fe] bg-[#1f75fe]/8 hover:bg-[#1f75fe]/12"
                      : "text-[#64748b] hover:bg-[#f1f5f9]",
                  )}
                >
                  {showAllBranches ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      Основной сценарий
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      Все ветки (+{hiddenNodeCount})
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={relayoutAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
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
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  saveStatus === "saved"
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-white bg-[#1f75fe] hover:bg-[#1a65e8]",
                  saveStatus === "saving" && "opacity-70 cursor-not-allowed",
                )}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saveStatus === "saving" ? "…" : saveStatus === "saved" ? "OK" : "Сохранить"}
              </button>
            </div>
          </Panel>
          {mode === "inline" && (
            <Panel position="bottom-left" className="m-3">
              <div className="flex items-center gap-1.5 text-[10px] text-[#94a3b8] px-2 py-1">
                <LayoutGrid className="h-3 w-3" />
                Клик по узлу — редактирование
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
  onSave: (data: ScriptMindMapData, meta?: MindMapSaveMeta) => void;
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
            По умолчанию — основной сценарий сверху вниз · «Все ветки» для полной карты
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
