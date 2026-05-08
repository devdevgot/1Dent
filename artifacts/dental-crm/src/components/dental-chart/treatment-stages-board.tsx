import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronDown,
  Stethoscope,
  Scissors,
  Crown,
  Wrench,
  Activity,
  CheckCircle2,
  Sparkles,
  Layers,
  ClipboardList,
  Play,
  Square,
  CircleCheck,
  Ban,
  Timer,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCompleteTreatmentPlanItem,
  useUpdateTreatmentPlanItem,
  getGetActiveTreatmentPlanQueryKey,
  getListTeethQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ToothRecord, TreatmentPlan, TreatmentPlanItem } from "@workspace/api-client-react";
import { CONDITION_CONFIG } from "./fdi-chart";

// ── Stage definitions ─────────────────────────────────────────────────────────

interface StageConfig {
  id: string;
  label: string;
  conditions: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  badgeBg: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    id: "hygiene",
    label: "Гигиена",
    conditions: [],
    color: "#7c3aed",
    bgColor: "#faf5ff",
    borderColor: "#7c3aed",
    textColor: "#6d28d9",
    badgeBg: "#ede9fe",
    Icon: Sparkles,
  },
  {
    id: "therapy",
    label: "Кариес / Терапия",
    conditions: ["cavity", "treated"],
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#2563eb",
    textColor: "#1d4ed8",
    badgeBg: "#dbeafe",
    Icon: Stethoscope,
  },
  {
    id: "root_canal",
    label: "Каналы",
    conditions: ["root_canal"],
    color: "#ea580c",
    bgColor: "#fff7ed",
    borderColor: "#ea580c",
    textColor: "#c2410c",
    badgeBg: "#ffedd5",
    Icon: Activity,
  },
  {
    id: "orthopedics",
    label: "Коронки / Ортопедия",
    conditions: ["crown"],
    color: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#d97706",
    textColor: "#b45309",
    badgeBg: "#fef3c7",
    Icon: Crown,
  },
  {
    id: "implantation",
    label: "Имплантация",
    conditions: ["implant"],
    color: "#059669",
    bgColor: "#f0fdf4",
    borderColor: "#059669",
    textColor: "#047857",
    badgeBg: "#d1fae5",
    Icon: Wrench,
  },
  {
    id: "surgery",
    label: "Удаление",
    conditions: ["extraction_needed"],
    color: "#dc2626",
    bgColor: "#fef2f2",
    borderColor: "#dc2626",
    textColor: "#b91c1c",
    badgeBg: "#fee2e2",
    Icon: Scissors,
  },
  {
    id: "other",
    label: "Прочее",
    conditions: ["missing"],
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#9ca3af",
    textColor: "#374151",
    badgeBg: "#f3f4f6",
    Icon: Layers,
  },
];

const DEFAULT_ORDER = STAGE_CONFIGS.map((s) => s.id);

const STAGE_TITLE_KEYWORDS: Record<string, string[]> = {
  hygiene:      ["гигиен", "чистк", "профилактик", "отбелива"],
  therapy:      ["кариес", "пломб", "реставрац", "препарир", "герметик", "шлифовк", "полировк"],
  root_canal:   ["канал", "пульп", "эндодонт", "штифт", "культ", "депульп", "апекс", "корнев"],
  orthopedics:  ["коронк", "ортопед", "слепок", "примерк", "цементир", "вкладк", "протез", "люминир"],
  implantation: ["имплант", "абатмент", "синус", "остеотом"],
  surgery:      ["удален", "экстракц", "альвеол", "лунк", "кюретаж"],
};

function conditionToStageId(condition: string | null | undefined): string | null {
  if (!condition) return null;
  for (const stage of STAGE_CONFIGS) {
    if (stage.conditions.includes(condition)) return stage.id;
  }
  return null;
}

function titleToStageId(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [stageId, keywords] of Object.entries(STAGE_TITLE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return stageId;
  }
  return null;
}

// ── Data grouping ─────────────────────────────────────────────────────────────

type StageData = { teeth: ToothRecord[]; planItems: TreatmentPlanItem[] };

function buildStageItems(
  teeth: ToothRecord[],
  activePlan: TreatmentPlan | null,
): Map<string, StageData> {
  const result = new Map<string, StageData>();
  for (const stage of STAGE_CONFIGS) {
    result.set(stage.id, { teeth: [], planItems: [] });
  }

  const toothToStageId = new Map<number, string>();
  for (const tooth of teeth) {
    const cond = tooth.condition ?? "healthy";
    if (cond === "healthy") continue;
    const stageId = conditionToStageId(cond);
    if (stageId) {
      result.get(stageId)!.teeth.push(tooth);
      toothToStageId.set(tooth.toothFdi, stageId);
    }
  }

  if (!activePlan) return result;

  for (const item of activePlan.items) {
    if (item.status === "cancelled") continue;

    const stageByCondition = conditionToStageId(item.condition);
    if (stageByCondition) { result.get(stageByCondition)!.planItems.push(item); continue; }

    if (item.toothFdi != null) {
      const stageId = toothToStageId.get(item.toothFdi);
      if (stageId) { result.get(stageId)!.planItems.push(item); continue; }
    }

    const stageByTitle = titleToStageId(item.title);
    if (stageByTitle) { result.get(stageByTitle)!.planItems.push(item); continue; }

    result.get("other")!.planItems.push(item);
  }

  return result;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ru-KZ") + " ₸";
}

function formatElapsed(startedAt: number): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ── Item action callbacks type ────────────────────────────────────────────────

interface ItemActions {
  onStart: (itemId: string) => void;
  onStopTimer: (itemId: string) => void;
  onComplete: (itemId: string) => void;
  onCancel: (itemId: string) => void;
  getTimerStart: (itemId: string) => number | undefined;
  tick: number; // forces re-render every second when timers active
  completingId: string | null;
  cancellingId: string | null;
}

// ── PlanItemCard ──────────────────────────────────────────────────────────────

function PlanItemCard({
  item,
  showTooth,
  actions,
}: {
  item: TreatmentPlanItem;
  showTooth?: boolean;
  actions: ItemActions;
}) {
  const isDone = item.status === "completed";
  const isPending = item.status === "pending";
  const timerStart = actions.getTimerStart(item.id);
  const isRunning = timerStart !== undefined;
  const isCompleting = actions.completingId === item.id;
  const isCancelling = actions.cancellingId === item.id;
  const isBusy = isCompleting || isCancelling;

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-200",
        isDone
          ? "border-emerald-100 bg-emerald-50/40"
          : isRunning
          ? "border-blue-200 bg-blue-50/30 shadow-sm"
          : "border-gray-100 bg-white",
      )}
    >
      {/* Main row */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        {/* Status icon */}
        <div className="shrink-0 mt-0.5">
          {isDone ? (
            <CircleCheck className="w-4 h-4 text-emerald-500" />
          ) : isRunning ? (
            <span className="flex w-4 h-4 items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </span>
          ) : (
            <span className="w-4 h-4 rounded-full border-2 border-gray-200 inline-block" />
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "block text-[12.5px] font-medium leading-snug",
              isDone ? "line-through text-gray-400" : "text-gray-700",
            )}
          >
            {item.title}
          </span>

          {/* Badges row */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {showTooth && item.toothFdi && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                з.{item.toothFdi}
              </span>
            )}
            {item.price > 0 && (
              <span className="text-[10px] text-gray-400 font-medium">
                {formatPrice(item.price)}
              </span>
            )}
            {isDone && (
              <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                Выполнено
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Timer + action bar (only for pending items) */}
      {isPending && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 pb-2.5",
            isRunning ? "justify-between" : "justify-end",
          )}
        >
          {/* Running timer display */}
          {isRunning && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <Timer className="w-3.5 h-3.5" />
              <span className="text-[12px] font-mono font-bold tabular-nums">
                {formatElapsed(timerStart!)}
              </span>
              {/* Stop timer (without completing) */}
              <button
                onClick={() => actions.onStopTimer(item.id)}
                disabled={isBusy}
                className="ml-1 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Сбросить таймер"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {!isRunning ? (
              <>
                {/* Start */}
                <button
                  onClick={() => actions.onStart(item.id)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  Начать
                </button>

                {/* Cancel */}
                <button
                  onClick={() => actions.onCancel(item.id)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Отменить позицию"
                >
                  {isCancelling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Ban className="w-3 h-3" />
                  )}
                  Отменить
                </button>
              </>
            ) : (
              <>
                {/* Complete */}
                <button
                  onClick={() => actions.onComplete(item.id)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isCompleting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Square className="w-3 h-3 fill-white" />
                  )}
                  Завершить
                </button>

                {/* Cancel */}
                <button
                  onClick={() => actions.onCancel(item.id)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Отменить позицию"
                >
                  {isCancelling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Ban className="w-3 h-3" />
                  )}
                  Отменить
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SortableSection ───────────────────────────────────────────────────────────

interface SortableSectionProps {
  stage: StageConfig;
  teeth: ToothRecord[];
  planItems: TreatmentPlanItem[];
  isExpanded: boolean;
  onToggle: () => void;
  actions: ItemActions;
}

function SortableSection({
  stage,
  teeth,
  planItems,
  isExpanded,
  onToggle,
  actions,
}: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const Icon = stage.Icon;

  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );

  const pendingItems = planItems.filter((p) => p.status === "pending");
  const completedItems = planItems.filter((p) => p.status === "completed");
  const totalCount = teeth.length + orphanItems.length;

  const sectionTotal = planItems.reduce((sum, item) => sum + item.price, 0);

  // Count actively running timers in this section
  const runningCount = planItems.filter(
    (p) => p.status === "pending" && actions.getTimerStart(p.id) !== undefined,
  ).length;

  return (
    <div ref={setNodeRef} style={style} className="select-none">
      <div
        className={cn(
          "rounded-xl border bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow",
          isDragging && "shadow-lg",
          runningCount > 0 && "border-blue-200 shadow-blue-100",
        )}
      >
        {/* Top accent line */}
        <div className="h-0.5 w-full" style={{ backgroundColor: stage.color }} />

        {/* Header */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50/70 transition-colors text-left"
        >
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="touch-none cursor-grab active:cursor-grabbing shrink-0 text-gray-300 hover:text-gray-400 transition-colors"
            aria-label="Перетащить раздел"
          >
            <GripVertical className="w-4 h-4" />
          </span>

          {/* Icon badge */}
          <span
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ backgroundColor: stage.badgeBg, color: stage.color }}
          >
            <Icon className="w-3.5 h-3.5" />
          </span>

          {/* Label + subtitle */}
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-gray-800 leading-tight">
              {stage.label}
            </span>
            <span className="block text-[11px] text-gray-400 mt-0.5 leading-tight">
              {runningCount > 0
                ? `${runningCount} в процессе · `
                : ""}
              {pendingItems.length > 0
                ? `${pendingItems.length} ожидает · ${completedItems.length} выполнено`
                : completedItems.length > 0
                ? `${completedItems.length} выполнено`
                : "нет услуг"}
            </span>
          </span>

          {/* Price + count + chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                Идёт
              </span>
            )}
            {sectionTotal > 0 && (
              <span className="text-[11px] font-medium text-gray-500">
                {formatPrice(sectionTotal)}
              </span>
            )}
            <span
              className="text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full"
              style={{ backgroundColor: stage.badgeBg, color: stage.color }}
            >
              {totalCount}
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-gray-400 transition-transform duration-200",
                isExpanded && "rotate-180",
              )}
            />
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
            {/* Teeth with nested plan items */}
            {teeth.map((tooth) => {
              const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
              const toothItems = planItems.filter((p) => p.toothFdi === tooth.toothFdi);
              return (
                <div key={tooth.toothFdi} className="space-y-1.5">
                  {/* Tooth header */}
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor: condCfg?.crownFill ?? "#e5e7eb",
                        border: `1.5px solid ${condCfg?.stroke ?? "#9ca3af"}`,
                      }}
                    />
                    <span className="text-[12px] font-semibold text-gray-600">
                      Зуб {tooth.toothFdi}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                      style={{ backgroundColor: stage.badgeBg, color: stage.textColor }}
                    >
                      {condCfg?.label ?? tooth.condition}
                    </span>
                  </div>

                  {/* Items for this tooth */}
                  {toothItems.length > 0 ? (
                    <div className="pl-3.5 space-y-1.5">
                      {toothItems.map((item) => (
                        <PlanItemCard key={item.id} item={item} actions={actions} />
                      ))}
                    </div>
                  ) : (
                    <p className="pl-3.5 text-[11px] text-gray-400 italic">нет позиций плана</p>
                  )}
                </div>
              );
            })}

            {/* Orphan plan items */}
            {orphanItems.length > 0 && (
              <div className="space-y-1.5">
                {teeth.length > 0 && (
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide pt-1">
                    Без привязки к зубу
                  </div>
                )}
                {orphanItems.map((item) => (
                  <PlanItemCard key={item.id} item={item} showTooth actions={actions} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {teeth.length === 0 && planItems.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-2">Нет данных</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TreatmentStagesBoard ──────────────────────────────────────────────────────

interface TreatmentStagesBoardProps {
  patientId: string;
  teeth: ToothRecord[];
  activePlan: TreatmentPlan | null;
}

export function TreatmentStagesBoard({ patientId, teeth, activePlan }: TreatmentStagesBoardProps) {
  const STORAGE_KEY = `1dent:stages-order:${patientId}`;
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Section order (DnD) ───────────────────────────────────────────────────

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`1dent:stages-order:${patientId}`);
      if (raw) {
        const parsed: string[] = JSON.parse(raw);
        const valid = parsed.filter((id) => DEFAULT_ORDER.includes(id));
        const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {}
    return DEFAULT_ORDER;
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`1dent:stages-order:${patientId}`);
      if (raw) {
        const parsed: string[] = JSON.parse(raw);
        const valid = parsed.filter((id) => DEFAULT_ORDER.includes(id));
        const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id));
        setOrder([...valid, ...missing]);
      } else {
        setOrder(DEFAULT_ORDER);
      }
    } catch {
      setOrder(DEFAULT_ORDER);
    }
    setExpandedIds(new Set());
  }, [patientId]);

  // ── Timers ────────────────────────────────────────────────────────────────

  /** Map<itemId, startedAt (ms timestamp)> */
  const [activeTimers, setActiveTimers] = useState<Map<string, number>>(new Map());

  // Load persisted timers when plan changes
  useEffect(() => {
    if (!activePlan) { setActiveTimers(new Map()); return; }
    const map = new Map<string, number>();
    for (const item of activePlan.items) {
      if (item.status !== "pending") continue;
      const raw = localStorage.getItem(`1dent:timer:${item.id}`);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (!isNaN(ts)) map.set(item.id, ts);
      }
    }
    setActiveTimers(map);
  }, [activePlan?.id, patientId]);

  // Tick every second while any timer is running
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTimers.size > 0) {
      tickRef.current = setInterval(() => setTick((n) => n + 1), 1000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeTimers.size]);

  // ── Mutation state ────────────────────────────────────────────────────────

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const planId = activePlan?.id ?? "";

  const completeMutation = useCompleteTreatmentPlanItem({
    mutation: {
      onSuccess: (_data, vars) => {
        // Clear timer for completed item
        localStorage.removeItem(`1dent:timer:${vars.itemId}`);
        setActiveTimers((prev) => {
          const next = new Map(prev);
          next.delete(vars.itemId);
          return next;
        });
        setCompletingId(null);
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        toast({ title: "Процедура завершена", description: "Зубная карта обновлена" });
      },
      onError: () => {
        setCompletingId(null);
        toast({ title: "Ошибка", description: "Не удалось завершить процедуру", variant: "destructive" });
      },
    },
  });

  const cancelMutation = useUpdateTreatmentPlanItem({
    mutation: {
      onSuccess: (_data, vars) => {
        localStorage.removeItem(`1dent:timer:${vars.itemId}`);
        setActiveTimers((prev) => {
          const next = new Map(prev);
          next.delete(vars.itemId);
          return next;
        });
        setCancellingId(null);
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        toast({ title: "Позиция отменена" });
      },
      onError: () => {
        setCancellingId(null);
        toast({ title: "Ошибка", description: "Не удалось отменить позицию", variant: "destructive" });
      },
    },
  });

  // ── Item action handlers ──────────────────────────────────────────────────

  const handleStart = useCallback((itemId: string) => {
    const now = Date.now();
    try { localStorage.setItem(`1dent:timer:${itemId}`, String(now)); } catch {}
    setActiveTimers((prev) => new Map(prev).set(itemId, now));
    // Auto-expand the section containing this item
    if (activePlan) {
      const item = activePlan.items.find((i) => i.id === itemId);
      if (item) {
        const stageId = conditionToStageId(item.condition)
          ?? titleToStageId(item.title)
          ?? "other";
        setExpandedIds((prev) => new Set(prev).add(stageId));
      }
    }
  }, [activePlan]);

  const handleStopTimer = useCallback((itemId: string) => {
    try { localStorage.removeItem(`1dent:timer:${itemId}`); } catch {}
    setActiveTimers((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const handleComplete = useCallback((itemId: string) => {
    if (!planId || completingId || cancellingId) return;
    setCompletingId(itemId);
    completeMutation.mutate({ id: patientId, planId, itemId });
  }, [planId, patientId, completingId, cancellingId, completeMutation]);

  const handleCancel = useCallback((itemId: string) => {
    if (!planId || completingId || cancellingId) return;
    setCancellingId(itemId);
    cancelMutation.mutate({ id: patientId, planId, itemId, data: { status: "cancelled" } });
  }, [planId, patientId, completingId, cancellingId, cancelMutation]);

  const getTimerStart = useCallback(
    (itemId: string) => activeTimers.get(itemId),
    [activeTimers],
  );

  const actions: ItemActions = {
    onStart: handleStart,
    onStopTimer: handleStopTimer,
    onComplete: handleComplete,
    onCancel: handleCancel,
    getTimerStart,
    tick,
    completingId,
    cancellingId,
  };

  // ── Stage filtering + DnD ─────────────────────────────────────────────────

  const stageItems = buildStageItems(teeth, activePlan);

  const activeStages = order
    .map((id) => STAGE_CONFIGS.find((s) => s.id === id))
    .filter((stage): stage is StageConfig => {
      if (!stage) return false;
      const items = stageItems.get(stage.id);
      return !!items && (items.teeth.length > 0 || items.planItems.length > 0);
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setOrder((prev) => {
        const oldIdx = prev.indexOf(String(active.id));
        const newIdx = prev.indexOf(String(over.id));
        const next = arrayMove(prev, oldIdx, newIdx);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [STORAGE_KEY],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (activeStages.length === 0) return null;

  // ── Summary stats ─────────────────────────────────────────────────────────

  const planItems = activePlan?.items.filter((i) => i.status !== "cancelled") ?? [];
  const totalItems = planItems.length;
  const completedItems = planItems.filter((i) => i.status === "completed").length;
  const planTotal = activePlan?.totalCost ?? 0;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const runningGlobal = activeTimers.size;

  return (
    <div className="mt-4 space-y-3">
      {/* Plan header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <span className="text-[13px] font-semibold text-gray-700">
            {activePlan
              ? `План лечения №${activePlan.planNumber}`
              : "По зубной карте"}
          </span>
          {runningGlobal > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              {runningGlobal} идёт
            </span>
          )}
        </div>
        {planTotal > 0 && (
          <span className="text-[12px] font-semibold text-gray-600">
            {formatPrice(planTotal)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="px-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-400">
              Выполнено {completedItems} из {totalItems}
            </span>
            <span className="text-[11px] font-semibold text-gray-500">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={activeStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {activeStages.map((stage) => {
              const items = stageItems.get(stage.id)!;
              return (
                <SortableSection
                  key={stage.id}
                  stage={stage}
                  teeth={items.teeth}
                  planItems={items.planItems}
                  isExpanded={expandedIds.has(stage.id)}
                  onToggle={() => toggleExpanded(stage.id)}
                  actions={actions}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
