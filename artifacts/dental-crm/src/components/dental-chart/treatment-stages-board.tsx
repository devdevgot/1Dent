import { useState, useCallback, useEffect } from "react";
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
  CircleDot,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
    if (stageByCondition) {
      result.get(stageByCondition)!.planItems.push(item);
      continue;
    }
    if (item.toothFdi != null) {
      const stageId = toothToStageId.get(item.toothFdi);
      if (stageId) {
        result.get(stageId)!.planItems.push(item);
        continue;
      }
    }
    const stageByTitle = titleToStageId(item.title);
    if (stageByTitle) {
      result.get(stageByTitle)!.planItems.push(item);
      continue;
    }
    result.get("other")!.planItems.push(item);
  }

  return result;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ru-KZ") + " ₸";
}

// ── SortableSection ───────────────────────────────────────────────────────────

interface SortableSectionProps {
  stage: StageConfig;
  teeth: ToothRecord[];
  planItems: TreatmentPlanItem[];
  isExpanded: boolean;
  onToggle: () => void;
}

function SortableSection({
  stage,
  teeth,
  planItems,
  isExpanded,
  onToggle,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="select-none"
    >
      {/* Section card */}
      <div
        className={cn(
          "rounded-xl border bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow",
          isDragging && "shadow-lg",
        )}
      >
        {/* Colored top accent line */}
        <div className="h-0.5 w-full" style={{ backgroundColor: stage.color }} />

        {/* Header row */}
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

          {/* Icon */}
          <span
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ backgroundColor: stage.badgeBg, color: stage.color }}
          >
            <Icon className="w-3.5 h-3.5" />
          </span>

          {/* Label */}
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-gray-800 leading-tight">
              {stage.label}
            </span>
            <span className="block text-[11px] text-gray-400 mt-0.5 leading-tight">
              {pendingItems.length > 0
                ? `${pendingItems.length} ожидает · ${completedItems.length} выполнено`
                : completedItems.length > 0
                ? `${completedItems.length} выполнено`
                : "нет услуг"}
            </span>
          </span>

          {/* Right side: count + price */}
          <div className="flex items-center gap-2 shrink-0">
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
          <div className="border-t border-gray-100">
            {/* Teeth with nested plan items */}
            {teeth.map((tooth, idx) => {
              const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
              const toothItems = planItems.filter((p) => p.toothFdi === tooth.toothFdi);
              return (
                <div
                  key={tooth.toothFdi}
                  className={cn(
                    "px-3 py-2",
                    idx < teeth.length - 1 || orphanItems.length > 0
                      ? "border-b border-gray-50"
                      : "",
                  )}
                >
                  {/* Tooth row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor: condCfg?.crownFill ?? "#e5e7eb",
                        border: `1.5px solid ${condCfg?.stroke ?? "#9ca3af"}`,
                      }}
                    />
                    <span className="text-[12px] font-semibold text-gray-700">
                      Зуб {tooth.toothFdi}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                      style={{
                        backgroundColor: stage.badgeBg,
                        color: stage.textColor,
                      }}
                    >
                      {condCfg?.label ?? tooth.condition}
                    </span>
                  </div>

                  {/* Tooth plan items */}
                  {toothItems.length > 0 ? (
                    <div className="space-y-1 pl-4">
                      {toothItems.map((item) => (
                        <PlanItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  ) : (
                    <p className="pl-4 text-[11px] text-gray-400 italic">нет позиций плана</p>
                  )}
                </div>
              );
            })}

            {/* Orphan plan items (no linked tooth in this stage) */}
            {orphanItems.length > 0 && (
              <div className="px-3 py-2 space-y-1">
                {orphanItems.map((item) => (
                  <PlanItemRow key={item.id} item={item} showTooth />
                ))}
              </div>
            )}

            {/* Empty state */}
            {teeth.length === 0 && planItems.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-4">Нет данных</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PlanItemRow ───────────────────────────────────────────────────────────────

function PlanItemRow({
  item,
  showTooth,
}: {
  item: TreatmentPlanItem;
  showTooth?: boolean;
}) {
  const isDone = item.status === "completed";
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-0.5",
        isDone && "opacity-55",
      )}
    >
      {isDone ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
      ) : (
        <CircleDot className="w-3 h-3 text-gray-300 shrink-0" />
      )}
      <span
        className={cn(
          "flex-1 min-w-0 text-[12px] leading-tight text-gray-700",
          isDone && "line-through text-gray-400",
        )}
      >
        {item.title}
      </span>
      {showTooth && item.toothFdi && (
        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium shrink-0">
          з.{item.toothFdi}
        </span>
      )}
      {item.price > 0 && (
        <span className="text-[11px] text-gray-500 font-medium shrink-0">
          {formatPrice(item.price)}
        </span>
      )}
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
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
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

  const totalItems = activePlan?.items.filter((i) => i.status !== "cancelled").length ?? 0;
  const completedItems = activePlan?.items.filter((i) => i.status === "completed").length ?? 0;
  const planTotal = activePlan?.totalCost ?? 0;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

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
        </div>
        {planTotal > 0 && (
          <span className="text-[12px] font-semibold text-gray-600">
            {formatPrice(planTotal)}
          </span>
        )}
      </div>

      {/* Progress bar (only if there's a plan with items) */}
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
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage sections */}
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
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
