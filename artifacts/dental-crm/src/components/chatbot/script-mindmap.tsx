import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { CHATBOT_FSM_STATES } from "@/lib/chatbot-fsm-states";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptMindMapNodeData extends Record<string, unknown> {
  label: string;
  content: string;
  isRoot?: boolean;
  fsmState?: string;
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

// ─── Layout algorithm ─────────────────────────────────────────────────────────

/** Card width used for layout spacing (cards grow vertically with content). */
const NODE_W = 300;
const NODE_H = 168;
/** Horizontal gap between sibling branches. */
const H_GAP = 40;
/** Vertical gap between parent and child row. */
const V_GAP = 56;

function subtreeW(id: string, ch: Record<string, string[]>): number {
  const kids = ch[id] ?? [];
  if (!kids.length) return NODE_W;
  return kids.reduce((s, k) => s + subtreeW(k, ch), 0) + (kids.length - 1) * H_GAP;
}

function placeNode(
  id: string,
  depth: number,
  leftX: number,
  ch: Record<string, string[]>,
  pos: Record<string, { x: number; y: number }>,
) {
  const kids = ch[id] ?? [];
  const y = depth * (NODE_H + V_GAP);
  if (!kids.length) {
    pos[id] = { x: leftX, y };
    return;
  }

  const rowWidth = subtreeW(id, ch);
  pos[id] = { x: leftX + Math.max(0, (rowWidth - NODE_W) / 2), y };

  let curX = leftX;
  for (const childId of kids) {
    placeNode(childId, depth + 1, curX, ch, pos);
    curX += subtreeW(childId, ch) + H_GAP;
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
  let rootX = 0;
  for (const rootId of roots) {
    placeNode(rootId, 0, rootX, ch, pos);
    rootX += subtreeW(rootId, ch) + H_GAP * 3;
  }
  return nodes.map((n) => ({ ...n, position: pos[n.id] ?? n.position }));
}

// ─── Context ──────────────────────────────────────────────────────────────────

type MindMapCbs = {
  addChild: (parentId: string) => void;
  fork: (siblingId: string) => void;
  remove: (id: string) => void;
  update: (id: string, label: string, content: string, fsmState?: string) => void;
};
const MindMapCtx = createContext<MindMapCbs | null>(null);
const useMindMap = () => useContext(MindMapCtx)!;

// ─── Custom node ──────────────────────────────────────────────────────────────

function MindMapNodeComponent({ id, data }: NodeProps) {
  const d = data as ScriptMindMapNodeData;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [content, setContent] = useState(d.content);
  const [fsmState, setFsmState] = useState(d.fsmState ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { addChild, fork, remove, update } = useMindMap();

  const commit = () => {
    setEditing(false);
    update(id, label, content, fsmState || undefined);
  };

  return (
    <div
      className={cn(
        "w-[300px] min-h-[120px] rounded-xl border-2 bg-white shadow-sm transition-all select-none",
        d.isRoot
          ? "border-blue-400 bg-blue-50/80"
          : editing
            ? "border-blue-400 shadow-md"
            : "border-[#e8e3d9] hover:border-blue-300 hover:shadow-md",
      )}
      onClick={() => { if (!editing) { setEditing(true); } }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white"
      />

      <div className="p-3.5 pb-2">
        {editing ? (
          <>
            <input
              autoFocus
              className="w-full text-sm font-semibold bg-transparent border-b border-blue-300 outline-none mb-1.5 pb-0.5 text-[#0f172a]"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && textareaRef.current?.focus()}
              onClick={(e) => e.stopPropagation()}
            />
            <textarea
              ref={textareaRef}
              className="w-full text-xs text-[#64748b] bg-transparent outline-none resize-y leading-relaxed min-h-[72px]"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={commit}
              onClick={(e) => e.stopPropagation()}
              placeholder="Что делает бот на этом шаге…"
            />
            <select
              value={fsmState}
              onChange={(e) => setFsmState(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 w-full text-[10px] border border-[#e8e3d9] rounded-md px-1.5 py-1 bg-white text-[#64748b]"
            >
              {CHATBOT_FSM_STATES.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className={cn("text-sm font-semibold leading-snug break-words", d.isRoot ? "text-blue-800" : "text-[#0f172a]")}>
              {label || <span className="font-normal italic text-[#64748b]">Без названия</span>}
            </p>
            {d.fsmState && (
              <p className="text-[10px] font-medium text-violet-600 mt-1 break-words">
                этап: {CHATBOT_FSM_STATES.find((s) => s.value === d.fsmState)?.label ?? d.fsmState}
              </p>
            )}
            {content ? (
              <p className="text-xs text-[#64748b] mt-1.5 leading-relaxed whitespace-pre-wrap break-words">{content}</p>
            ) : (
              <p className="text-xs text-[#64748b] mt-1 italic">Нажмите для редактирования</p>
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
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white"
      />
    </div>
  );
}

const nodeTypes = { mindmap: MindMapNodeComponent };

// ─── Default initial mind map ─────────────────────────────────────────────────

/** Default first-touch script (Muslim Dent style) — used when clinic has no saved mind map yet. */
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
      "Клиент не уверен или хочет подумать. Мягко уточните, что именно останавливает — цена, страх процедуры или нужно больше информации. Напомните, что консультация бесплатная и ни к чему не обязывает, врач составит индивидуальный план. Упомяните рассрочку 0-0-24 без переплат. Спросите, удобно ли записаться хотя бы на бесплатный осмотр.",
    fsmState: "dental_qa",
  },
  {
    id: "re_offer_booking",
    label: "Повторное предложение записи",
    content:
      "Клиент проявил интерес после работы с сомнениями. Предложите конкретное время для визита на бесплатную консультацию в ближайшие дни. Спросите, какой день и время подойдут.",
    fsmState: "collect_datetime",
  },
  {
    id: "refusal_close",
    label: "Завершение (отказ)",
    content:
      "Клиент отказался записываться. Поблагодарите за обращение, скажите что всегда рады помочь. Оставьте номер для связи: +7 771 800 0065. Напомните, что акции ограничены по времени и они могут вернуться в любой момент.",
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
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.label, content: n.content, isRoot: n.isRoot, fsmState: n.fsmState },
  };
}

function toFlowGraph(raw: ScriptMindMapData): { nodes: Node[]; edges: Edge[] } {
  const edges = raw.edges.map(makeFlowEdge);
  const flowNodes = raw.nodes.map(makeFlowNode);
  const nodes = autoLayout(flowNodes, edges);
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
  const skipAutoSaveRef = useRef(true);

  const markDirty = useCallback(() => {
    skipAutoSaveRef.current = false;
  }, []);

  const placeChildNode = useCallback((parentId: string, newNode: Node, allNodes: Node[], allEdges: Edge[]): Node => {
    const parent = allNodes.find((n) => n.id === parentId);
    if (!parent) return { ...newNode, position: { x: 0, y: NODE_H + V_GAP } };

    const siblings = allEdges
      .filter((e) => e.source === parentId)
      .map((e) => allNodes.find((n) => n.id === e.target))
      .filter(Boolean) as Node[];

    const rightmost = siblings.reduce(
      (max, n) => Math.max(max, n.position.x),
      parent.position.x,
    );

    return {
      ...newNode,
      position: {
        x: siblings.length > 0 ? rightmost + NODE_W + H_GAP : parent.position.x,
        y: parent.position.y + NODE_H + V_GAP,
      },
    };
  }, []);

  const addChild = useCallback((parentId: string) => {
    markDirty();
    const id = genId();
    const newNode = makeFlowNode({ id, label: "Новый шаг", content: "" });
    setEdges((prev) => {
      const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentId, target: id });
      const updated = [...prev, newEdge];
      setNodes((pn) => [...pn, placeChildNode(parentId, newNode, pn, prev)]);
      return updated;
    });
  }, [setNodes, setEdges, markDirty, placeChildNode]);

  const fork = useCallback((siblingId: string) => {
    markDirty();
    const id = genId();
    const newNode = makeFlowNode({ id, label: "Новая ветка", content: "" });
    setEdges((prev) => {
      const parentEdge = prev.find((e) => e.target === siblingId);
      if (!parentEdge) {
        setNodes((pn) => [...pn, { ...newNode, position: { x: pn.length * (NODE_W + H_GAP), y: 0 } }]);
        return prev;
      }
      const newEdge = makeFlowEdge({ id: `e_${id}`, source: parentEdge.source, target: id });
      const updated = [...prev, newEdge];
      setNodes((pn) => {
        const sibling = pn.find((n) => n.id === siblingId);
        const placed = sibling
          ? { ...newNode, position: { x: sibling.position.x + NODE_W + H_GAP, y: sibling.position.y } }
          : placeChildNode(parentEdge.source, newNode, pn, prev);
        return [...pn, placed];
      });
      return updated;
    });
  }, [setNodes, setEdges, markDirty, placeChildNode]);

  const remove = useCallback((id: string) => {
    markDirty();
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
      setNodes((pn) => pn.filter((n) => !toRemove.has(n.id)));
      return newEdges;
    });
  }, [setNodes, setEdges, markDirty]);

  const update = useCallback((id: string, label: string, content: string, fsmState?: string) => {
    markDirty();
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, label, content, fsmState } } : n),
    );
  }, [setNodes, markDirty]);

  const cbs = useMemo<MindMapCbs>(() => ({ addChild, fork, remove, update }), [addChild, fork, remove, update]);

  const serializeData = useCallback((): ScriptMindMapData => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      label: (n.data as ScriptMindMapNodeData).label,
      content: (n.data as ScriptMindMapNodeData).content,
      isRoot: (n.data as ScriptMindMapNodeData).isRoot,
      fsmState: (n.data as ScriptMindMapNodeData).fsmState,
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
  }), [nodes, edges]);

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
  }, [nodes, edges, serializeData]);

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    if (changes.some((c) => c.type === "position" || c.type === "remove")) markDirty();
    onNodesChange(changes);
  }, [onNodesChange, markDirty]);

  return (
    <MindMapCtx.Provider value={cbs}>
      <div className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={EDGE_STYLE}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e8e3d9" />
          <Controls showInteractive={false} className="!shadow-sm !border !border-[#e8e3d9] !rounded-xl !overflow-hidden" />
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#faf8f4]">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-[#e8e3d9] shadow-sm">
        <GitBranch className="h-4 w-4 text-[#1f75fe] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0f172a]">Скрипт диалога</p>
          <p className="text-xs text-[#64748b] leading-tight">
            Нажмите на карточку чтобы редактировать · «+Шаг» добавляет дочерний · «Ветка» разветвляет
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#f1ede4] transition-colors shrink-0"
        >
          <X className="h-4 w-4 text-[#64748b]" />
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
