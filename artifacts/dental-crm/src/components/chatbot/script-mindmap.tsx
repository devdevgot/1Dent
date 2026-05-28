import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CheckCircle2, GitBranch, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptMindMapNodeData extends Record<string, unknown> {
  label: string;
  content: string;
  isRoot?: boolean;
}

export interface ScriptMindMapData {
  nodes: { id: string; label: string; content: string; isRoot?: boolean }[];
  edges: { id: string; source: string; target: string; label?: string }[];
}

// ─── Layout algorithm ─────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 116;
const H_GAP = 72;
const V_GAP = 18;

function subtreeH(id: string, ch: Record<string, string[]>): number {
  const kids = ch[id] ?? [];
  if (!kids.length) return NODE_H;
  return kids.reduce((s, k) => s + subtreeH(k, ch), 0) + (kids.length - 1) * V_GAP;
}

function placeNode(
  id: string,
  depth: number,
  topY: number,
  ch: Record<string, string[]>,
  pos: Record<string, { x: number; y: number }>,
) {
  const kids = ch[id] ?? [];
  const x = depth * (NODE_W + H_GAP);
  if (!kids.length) {
    pos[id] = { x, y: topY };
  } else {
    const total = subtreeH(id, ch);
    pos[id] = { x, y: topY + (total - NODE_H) / 2 };
    let cur = topY;
    for (const k of kids) {
      placeNode(k, depth + 1, cur, ch, pos);
      cur += subtreeH(k, ch) + V_GAP;
    }
  }
}

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (!nodes.length) return nodes;
  const ch: Record<string, string[]> = {};
  const hasParent: Record<string, boolean> = {};
  nodes.forEach((n) => { ch[n.id] = []; hasParent[n.id] = false; });
  edges.forEach((e) => {
    ch[e.source] = [...(ch[e.source] ?? []), e.target];
    hasParent[e.target] = true;
  });
  const roots = nodes.filter((n) => !hasParent[n.id]).map((n) => n.id);
  const pos: Record<string, { x: number; y: number }> = {};
  let rootY = 0;
  for (const r of roots) {
    placeNode(r, 0, rootY, ch, pos);
    rootY += subtreeH(r, ch) + V_GAP * 4;
  }
  return nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
}

// ─── Context ──────────────────────────────────────────────────────────────────

type MindMapCbs = {
  addChild: (parentId: string) => void;
  fork: (siblingId: string) => void;
  remove: (id: string) => void;
  update: (id: string, label: string, content: string) => void;
};
const MindMapCtx = createContext<MindMapCbs | null>(null);
const useMindMap = () => useContext(MindMapCtx)!;

// ─── Custom node ──────────────────────────────────────────────────────────────

function MindMapNodeComponent({ id, data }: NodeProps) {
  const d = data as ScriptMindMapNodeData;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [content, setContent] = useState(d.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { addChild, fork, remove, update } = useMindMap();

  const commit = () => {
    setEditing(false);
    update(id, label, content);
  };

  return (
    <div
      className={cn(
        "w-[220px] rounded-xl border-2 bg-white shadow-sm transition-all select-none",
        d.isRoot
          ? "border-blue-400 bg-blue-50/80"
          : editing
            ? "border-blue-400 shadow-md"
            : "border-gray-200 hover:border-blue-300 hover:shadow-md",
      )}
      onClick={() => { if (!editing) { setEditing(true); } }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white"
      />

      <div className="p-3 pb-1.5">
        {editing ? (
          <>
            <input
              autoFocus
              className="w-full text-sm font-semibold bg-transparent border-b border-blue-300 outline-none mb-1.5 pb-0.5 text-gray-800"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && textareaRef.current?.focus()}
              onClick={(e) => e.stopPropagation()}
            />
            <textarea
              ref={textareaRef}
              className="w-full text-xs text-gray-500 bg-transparent outline-none resize-none leading-relaxed"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={commit}
              onClick={(e) => e.stopPropagation()}
              placeholder="Что делает бот на этом шаге…"
            />
          </>
        ) : (
          <>
            <p className={cn("text-sm font-semibold leading-tight truncate", d.isRoot ? "text-blue-800" : "text-gray-800")}>
              {label || <span className="font-normal italic text-gray-400">Без названия</span>}
            </p>
            {content ? (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-snug">{content}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 italic">Нажмите для редактирования</p>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-0.5">
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); addChild(id); }}
            className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-colors"
            title="Добавить дочерний шаг"
          >
            <Plus className="h-2.5 w-2.5" />Шаг
          </button>
          <button
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); fork(id); }}
            className="flex items-center gap-0.5 text-[10px] font-medium text-violet-600 hover:bg-violet-100 px-1.5 py-0.5 rounded transition-colors"
            title="Добавить параллельную ветку от того же родителя"
          >
            <GitBranch className="h-2.5 w-2.5" />Ветка
          </button>
          {!d.isRoot && (
            <button
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); remove(id); }}
              className="ml-auto flex items-center text-[10px] font-medium text-red-400 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors"
              title="Удалить узел и все его дочерние"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white"
      />
    </div>
  );
}

const nodeTypes = { mindmap: MindMapNodeComponent };

// ─── Default initial mind map ─────────────────────────────────────────────────

const DEFAULT_NODES: ScriptMindMapData["nodes"] = [
  { id: "greeting", label: "Приветствие", content: "Поприветствовать пациента и узнать, что беспокоит", isRoot: true },
  { id: "problem", label: "Выяснение проблемы", content: "Уточнить симптомы и причину обращения" },
  { id: "pain", label: "Острая боль", content: "Уточнить симптомы: где болит, как давно, острая/ноющая" },
  { id: "planned", label: "Плановое лечение", content: "Уточнить желаемую процедуру и пожелания по врачу" },
  { id: "cosmetic", label: "Эстетика / Чистка", content: "Рассказать об услуге, предложить консультацию" },
  { id: "doctor_pain", label: "Подбор врача", content: "Предложить подходящего специалиста и свободные слоты" },
  { id: "doctor_plan", label: "Подбор врача", content: "Предложить подходящего специалиста и свободные слоты" },
  { id: "confirm", label: "Подтверждение записи", content: "Уточнить дату, время и имя — подтвердить детали" },
  { id: "operator", label: "Передача оператору", content: "Соединить с живым менеджером клиники" },
];

const DEFAULT_EDGES: ScriptMindMapData["edges"] = [
  { id: "e1", source: "greeting", target: "problem" },
  { id: "e2", source: "problem", target: "pain", label: "Болит зуб" },
  { id: "e3", source: "problem", target: "planned", label: "Лечение" },
  { id: "e4", source: "problem", target: "cosmetic", label: "Эстетика" },
  { id: "e5", source: "pain", target: "doctor_pain" },
  { id: "e6", source: "planned", target: "doctor_plan" },
  { id: "e7", source: "doctor_pain", target: "confirm" },
  { id: "e8", source: "doctor_plan", target: "confirm" },
  { id: "e9", source: "cosmetic", target: "operator" },
];

// ─── Converters ───────────────────────────────────────────────────────────────

const EDGE_STYLE = {
  type: "smoothstep" as const,
  style: { stroke: "#93c5fd", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#93c5fd" },
  labelStyle: { fontSize: 10, fill: "#6b7280", fontWeight: 500 },
  labelBgStyle: { fill: "#f9fafb", fillOpacity: 0.95 },
  labelBgPadding: [4, 3] as [number, number],
  labelBgBorderRadius: 4,
};

function makeFlowEdge(e: ScriptMindMapData["edges"][number]): Edge {
  return { ...e, ...EDGE_STYLE, ...(e.label ? { label: e.label } : {}) };
}

function makeFlowNode(n: ScriptMindMapData["nodes"][number]): Node {
  return {
    id: n.id,
    type: "mindmap",
    position: { x: 0, y: 0 },
    data: { label: n.label, content: n.content, isRoot: n.isRoot },
  };
}

function toFlowGraph(raw: ScriptMindMapData): { nodes: Node[]; edges: Edge[] } {
  const edges = raw.edges.map(makeFlowEdge);
  const nodes = autoLayout(raw.nodes.map(makeFlowNode), edges);
  return { nodes, edges };
}

function genId() {
  return `n_${crypto.randomUUID().slice(0, 8)}`;
}

// ─── ScriptMindMap canvas ─────────────────────────────────────────────────────

interface ScriptMindMapProps {
  initialData?: ScriptMindMapData | null;
  onSave: (data: ScriptMindMapData) => void;
  saveStatus?: "idle" | "saving" | "saved";
}

export function ScriptMindMap({ initialData, onSave, saveStatus = "idle" }: ScriptMindMapProps) {
  const seed = initialData?.nodes?.length ? initialData : { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES };
  const { nodes: initNodes, edges: initEdges } = toFlowGraph(seed);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const addChild = useCallback((parentId: string) => {
    const id = genId();
    const newNode = makeFlowNode({ id, label: "Новый шаг", content: "" });
    setEdges((prev) => {
      const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentId, target: id });
      const updated = [...prev, newEdge];
      setNodes((pn) => autoLayout([...pn, newNode], updated));
      return updated;
    });
  }, [setNodes, setEdges]);

  const fork = useCallback((siblingId: string) => {
    const id = genId();
    const newNode = makeFlowNode({ id, label: "Новая ветка", content: "" });
    setEdges((prev) => {
      const parentEdge = prev.find((e) => e.target === siblingId);
      if (!parentEdge) {
        setNodes((pn) => autoLayout([...pn, newNode], prev));
        return prev;
      }
      const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentEdge.source, target: id });
      const updated = [...prev, newEdge];
      setNodes((pn) => autoLayout([...pn, newNode], updated));
      return updated;
    });
  }, [setNodes, setEdges]);

  const remove = useCallback((id: string) => {
    setEdges((prevEdges) => {
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
      setNodes((pn) => {
        const newNodes = pn.filter((n) => !toRemove.has(n.id));
        return autoLayout(newNodes, newEdges);
      });
      return newEdges;
    });
  }, [setNodes, setEdges]);

  const update = useCallback((id: string, label: string, content: string) => {
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, label, content } } : n),
    );
  }, [setNodes]);

  const cbs = useMemo<MindMapCbs>(() => ({ addChild, fork, remove, update }), [addChild, fork, remove, update]);

  const handleSave = useCallback(() => {
    onSave({
      nodes: nodes.map((n) => ({
        id: n.id,
        label: (n.data as ScriptMindMapNodeData).label,
        content: (n.data as ScriptMindMapNodeData).content,
        isRoot: (n.data as ScriptMindMapNodeData).isRoot,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === "string" ? e.label : undefined,
      })),
    });
  }, [nodes, edges, onSave]);

  return (
    <MindMapCtx.Provider value={cbs}>
      <div className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={EDGE_STYLE}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} className="!shadow-sm !border !border-gray-200 !rounded-xl !overflow-hidden" />
          <Panel position="top-right" className="m-3">
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all",
                saveStatus === "saved"
                  ? "bg-emerald-500 text-white shadow-emerald-200"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200",
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
              {saveStatus === "saving" ? "Сохранение…" : saveStatus === "saved" ? "Сохранено" : "Сохранить"}
            </button>
          </Panel>
        </ReactFlow>
      </div>
    </MindMapCtx.Provider>
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
        <GitBranch className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Скрипт диалога</p>
          <p className="text-xs text-gray-400 leading-tight">
            Нажмите на карточку чтобы редактировать · «+Шаг» добавляет дочерний · «Ветка» разветвляет
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <ScriptMindMap
          key={open ? "open" : "closed"}
          initialData={initialData}
          onSave={onSave}
          saveStatus={saveStatus}
        />
      </div>
    </div>
  );
}
