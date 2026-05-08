import { useState, useCallback } from "react";
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
  horizontalListSortingStrategy,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToothRecord } from "@workspace/api-client-react";
import { CONDITION_CONFIG } from "./fdi-chart";

type TreatmentPlanItem = {
  id: string;
  toothFdi?: number | null;
  condition?: string | null;
  title: string;
  price: number;
  status: string;
};

type TreatmentPlan = {
  id: string;
  items: TreatmentPlanItem[];
};

interface StageConfig {
  id: string;
  label: string;
  /** Tooth conditions that map into this stage */
  conditions: string[];
  /** Plan-item categories (from procedure template category) that map here */
  planCategories?: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    id: "hygiene",
    label: "Гигиена",
    conditions: [],
    planCategories: ["hygiene"],
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    borderColor: "#ddd6fe",
    textColor: "#6d28d9",
    Icon: Sparkles,
  },
  {
    id: "therapy",
    label: "Кариес / Терапия",
    conditions: ["cavity", "treated"],
    planCategories: ["therapy", "restoration", "periodontology", "radiology", "pediatric"],
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
    textColor: "#1d4ed8",
    Icon: Stethoscope,
  },
  {
    id: "root_canal",
    label: "Каналы",
    conditions: ["root_canal"],
    color: "#ea580c",
    bgColor: "#fff7ed",
    borderColor: "#fed7aa",
    textColor: "#c2410c",
    Icon: Activity,
  },
  {
    id: "orthopedics",
    label: "Коронки / Ортопедия",
    conditions: ["crown"],
    planCategories: ["orthopedics"],
    color: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
    textColor: "#b45309",
    Icon: Crown,
  },
  {
    id: "implantation",
    label: "Имплантация",
    conditions: ["implant"],
    planCategories: ["implantation"],
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#a7f3d0",
    textColor: "#047857",
    Icon: Wrench,
  },
  {
    id: "surgery",
    label: "Удаление",
    conditions: ["extraction_needed"],
    planCategories: ["surgery"],
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
    textColor: "#b91c1c",
    Icon: Scissors,
  },
  {
    id: "other",
    label: "Прочее",
    conditions: ["missing"],
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#e5e7eb",
    textColor: "#374151",
    Icon: Layers,
  },
];

const DEFAULT_ORDER = STAGE_CONFIGS.map((s) => s.id);

type StageData = { teeth: ToothRecord[]; planItems: TreatmentPlanItem[] };

/** Map each plan item's condition string → stage id */
function conditionToStageId(condition: string): string | null {
  for (const stage of STAGE_CONFIGS) {
    if (stage.conditions.includes(condition)) return stage.id;
  }
  return null;
}

/** Map a plan-item category string → stage id via planCategories */
function planCategoryToStageId(category: string | null | undefined): string | null {
  if (!category) return null;
  for (const stage of STAGE_CONFIGS) {
    if (stage.planCategories?.includes(category)) return stage.id;
  }
  return null;
}

function buildStageItems(
  teeth: ToothRecord[],
  activePlan: TreatmentPlan | null,
): Map<string, StageData> {
  const result = new Map<string, StageData>();
  for (const stage of STAGE_CONFIGS) {
    result.set(stage.id, { teeth: [], planItems: [] });
  }

  // 1. Bucket teeth by condition
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

  // 2. Bucket plan items
  for (const item of activePlan.items) {
    if (item.status === "cancelled") continue;

    // Try item.condition first (set from tooth condition at creation time)
    if (item.condition) {
      const stageId = conditionToStageId(item.condition);
      if (stageId) {
        result.get(stageId)!.planItems.push(item);
        continue;
      }
    }

    // Try linking via toothFdi → tooth's stage
    if (item.toothFdi != null) {
      const stageId = toothToStageId.get(item.toothFdi);
      if (stageId) {
        result.get(stageId)!.planItems.push(item);
        continue;
      }
    }

    // Fallback: try to map via a "category" field if present on the item (some items carry it)
    const itemAsAny = item as Record<string, unknown>;
    const cat = (itemAsAny["category"] ?? itemAsAny["procedureCategory"]) as string | undefined;
    if (cat) {
      const stageId = planCategoryToStageId(cat);
      if (stageId) {
        result.get(stageId)!.planItems.push(item);
        continue;
      }
    }

    // Ultimate fallback → "Прочее"
    result.get("other")!.planItems.push(item);
  }

  return result;
}

interface SortableStageCardProps {
  stage: StageConfig;
  teeth: ToothRecord[];
  planItems: TreatmentPlanItem[];
  isExpanded: boolean;
  onToggle: () => void;
}

function SortableStageCard({
  stage,
  teeth,
  planItems,
  isExpanded,
  onToggle,
}: SortableStageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    borderColor: stage.borderColor,
  };

  const Icon = stage.Icon;

  // Count: unique teeth + plan items that have no linked tooth in this stage
  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanPlanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );
  const totalCount = teeth.length + orphanPlanItems.length;

  const pendingItems = planItems.filter((p) => p.status === "pending");
  const completedItems = planItems.filter((p) => p.status === "completed");

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className="shrink-0 w-[172px] flex flex-col rounded-xl border overflow-hidden shadow-sm select-none bg-white"
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-2 py-2"
        style={{ backgroundColor: stage.bgColor, borderBottom: `1px solid ${stage.borderColor}` }}
      >
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing shrink-0 text-gray-400 hover:text-gray-500 transition-colors p-0.5 rounded"
          aria-label="Перетащить этап"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <span className="shrink-0" style={{ color: stage.color }}>
          <Icon className="w-3.5 h-3.5" />
        </span>

        <span
          className="text-[11px] font-bold leading-tight flex-1 min-w-0 truncate"
          style={{ color: stage.textColor }}
        >
          {stage.label}
        </span>

        {/* Combined count badge: teeth + orphan items */}
        <span
          className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
          style={{ backgroundColor: stage.color + "25", color: stage.color }}
        >
          {totalCount}
        </span>
      </div>

      {/* Expand toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white hover:bg-gray-50/80 transition-colors"
      >
        <span className="text-[10px] text-muted-foreground leading-tight text-left">
          {pendingItems.length > 0
            ? `${pendingItems.length} услуг ожидает`
            : completedItems.length > 0
            ? `${completedItems.length} выполнено`
            : teeth.length > 0
            ? "нет услуг"
            : "только позиции"}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground transition-transform shrink-0",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div
          className="border-t divide-y divide-border/20 max-h-52 overflow-y-auto"
          style={{ borderColor: stage.borderColor }}
        >
          {teeth.length === 0 && planItems.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">Нет данных</p>
          )}

          {/* Teeth with their nested plan items */}
          {teeth.map((tooth) => {
            const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
            const toothItems = planItems.filter((p) => p.toothFdi === tooth.toothFdi);
            return (
              <div key={tooth.toothFdi} className="px-2.5 py-1.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{
                      backgroundColor: condCfg?.crownFill,
                      border: `1px solid ${condCfg?.stroke}`,
                    }}
                  />
                  <span className="text-[11px] font-semibold text-gray-700">
                    Зуб {tooth.toothFdi}
                  </span>
                  <span className="text-[9px] text-muted-foreground ml-auto">{condCfg?.label}</span>
                </div>
                {toothItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "ml-3.5 flex items-start gap-1",
                      item.status === "completed" && "opacity-50",
                    )}
                  >
                    {item.status === "completed" ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full border border-gray-300 mt-0.5 shrink-0 inline-block" />
                    )}
                    <span className="text-[10px] text-gray-600 leading-tight">{item.title}</span>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Plan items with no linked tooth in this stage */}
          {orphanPlanItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "px-2.5 py-1.5 flex items-start gap-1.5",
                item.status === "completed" && "opacity-50",
              )}
            >
              {item.status === "completed" ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full border border-gray-300 mt-0.5 shrink-0 inline-block" />
              )}
              <span className="text-[10px] text-gray-600 leading-tight flex-1">{item.title}</span>
              {item.toothFdi && (
                <span className="text-[9px] text-muted-foreground shrink-0">з.{item.toothFdi}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TreatmentStagesBoardProps {
  patientId: string;
  teeth: ToothRecord[];
  activePlan: TreatmentPlan | null;
}

export function TreatmentStagesBoard({ patientId, teeth, activePlan }: TreatmentStagesBoardProps) {
  const STORAGE_KEY = `1dent:stages-order:${patientId}`;

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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

  const stageItems = buildStageItems(teeth, activePlan);

  // Only show stages that have teeth or plan items
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

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          Этапы лечения
        </span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          — перетащите для изменения порядка
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={activeStages.map((s) => s.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-2 overflow-x-auto pb-2">
            {activeStages.map((stage) => {
              const items = stageItems.get(stage.id)!;
              return (
                <SortableStageCard
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
