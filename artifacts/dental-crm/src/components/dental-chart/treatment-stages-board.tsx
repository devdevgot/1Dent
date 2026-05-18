import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { useListUsers } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
  ChevronRight,
  Calendar,
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
  Pencil,
  Check,
  X,
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

function isStageFullyCompleted(data: StageData): boolean {
  return data.planItems.length > 0 && data.planItems.every((i) => i.status === "completed");
}

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
  // edit mode
  isEditMode: boolean;
  editingItemId: string | null;
  editDraft: { title: string; price: string };
  onEditStart: (item: TreatmentPlanItem) => void;
  onEditSave: (itemId: string) => void;
  onEditCancel: () => void;
  onEditDraftChange: (field: "title" | "price", value: string) => void;
  savingEditId: string | null;
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

  const isEditing = actions.editingItemId === item.id;
  const isSavingEdit = actions.savingEditId === item.id;

  // ── Edit mode: inline form ───────────────────────────────────────────────
  if (actions.isEditMode && isPending && isEditing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2.5 space-y-2">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Название</label>
          <input
            autoFocus
            value={actions.editDraft.title}
            onChange={(e) => actions.onEditDraftChange("title", e.target.value)}
            className="w-full text-[12.5px] border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            placeholder="Название процедуры"
            onKeyDown={(e) => {
              if (e.key === "Enter") actions.onEditSave(item.id);
              if (e.key === "Escape") actions.onEditCancel();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Стоимость (₸)</label>
          <input
            type="number"
            min="0"
            value={actions.editDraft.price}
            onChange={(e) => actions.onEditDraftChange("price", e.target.value)}
            className="w-full text-[12.5px] border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === "Enter") actions.onEditSave(item.id);
              if (e.key === "Escape") actions.onEditCancel();
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 justify-end pt-0.5">
          <button
            onClick={actions.onEditCancel}
            disabled={isSavingEdit}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Отмена
          </button>
          <button
            onClick={() => actions.onEditSave(item.id)}
            disabled={isSavingEdit || !actions.editDraft.title.trim()}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Сохранить
          </button>
        </div>
      </div>
    );
  }

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

        {/* Edit pencil button (edit mode only, pending items) */}
        {actions.isEditMode && isPending && !isEditing && (
          <button
            onClick={() => actions.onEditStart(item)}
            className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors mt-0.5"
            title="Редактировать позицию"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Timer + action bar (only for pending items, not in edit mode) */}
      {isPending && !actions.isEditMode && (
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
  index: number;
  userRole?: string;
  doctorName?: string;
  onOpenDetail?: () => void;
}

function SortableSection({
  stage,
  teeth,
  planItems,
  isExpanded,
  onToggle,
  actions,
  index,
  userRole,
  doctorName,
  onOpenDetail,
}: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );

  const pendingItems = planItems.filter((p) => p.status === "pending");
  const completedItems = planItems.filter((p) => p.status === "completed");
  const sectionTotal = planItems.reduce((sum, item) => sum + item.price, 0);
  const runningCount = planItems.filter(
    (p) => p.status === "pending" && actions.getTimerStart(p.id) !== undefined,
  ).length;

  return (
    <div ref={setNodeRef} style={style} className="select-none">
      <div
        className={cn(
          "rounded-2xl bg-white overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-shadow",
          isDragging && "shadow-lg",
          runningCount > 0 && "shadow-blue-100/80",
        )}
        style={{ borderLeft: `3px solid ${stage.color}` }}
      >
        {/* Clickable card header */}
        <button onClick={onToggle} className="w-full text-left px-4 pt-4 pb-3">
          {/* Stage number + title + status badge + drag handle */}
          <div className="flex items-start gap-3 mb-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold text-white shrink-0"
              style={{ backgroundColor: stage.color }}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[15px] font-bold text-gray-900 leading-tight">{stage.label}</span>
                {runningCount > 0 ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">В процессе</span>
                ) : pendingItems.length > 0 && completedItems.length === 0 ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Ожидает</span>
                ) : pendingItems.length > 0 && completedItems.length > 0 ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">В работе</span>
                ) : completedItems.length > 0 ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Завершён</span>
                ) : null}
              </div>
              <p className="text-[12px] text-gray-400 leading-tight">
                {teeth.length > 0
                  ? `Зуб${teeth.length > 1 ? "ы" : ""} ${teeth.map((t) => t.toothFdi).join(", ")}`
                  : orphanItems.length > 0
                  ? "Дополнительные услуги"
                  : "—"}
              </p>
            </div>
            {actions.isEditMode && (
              <span
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors pt-1.5 shrink-0"
                aria-label="Перетащить раздел"
              >
                <GripVertical className="w-4 h-4" />
              </span>
            )}
          </div>

          {/* Сумма этапа */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">Сумма этапа</span>
            <span className="text-[11px] font-semibold text-gray-600">
              {sectionTotal > 0 ? formatPrice(sectionTotal) : "—"}
            </span>
          </div>

          {/* Процедур count — opens detail sheet */}
          <div
            role="button"
            onClick={(e) => { e.stopPropagation(); onOpenDetail?.(); }}
            className="flex items-center justify-between py-2.5 border-t border-gray-100 -mx-4 px-4 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
          >
            <span className="text-[13px] text-gray-600 font-medium">
              Процедур: {planItems.filter((p) => p.status !== "cancelled").length}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>

          {/* Date + Doctor row */}
          <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Дата не назначена</span>
              {runningCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {runningCount} идёт
                </span>
              )}
            </div>
            {(userRole === "owner" || userRole === "admin") && doctorName && (
              <span className="text-[11px] text-gray-500 font-medium truncate max-w-[100px]">
                {doctorName}
              </span>
            )}
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
            {teeth.map((tooth) => {
              const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
              const toothItems = planItems.filter((p) => p.toothFdi === tooth.toothFdi);
              return (
                <div key={tooth.toothFdi} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor: condCfg?.crownFill ?? "#e5e7eb",
                        border: `1.5px solid ${condCfg?.stroke ?? "#9ca3af"}`,
                      }}
                    />
                    <span className="text-[12px] font-semibold text-gray-600">Зуб {tooth.toothFdi}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                      style={{ backgroundColor: stage.badgeBg, color: stage.textColor }}
                    >
                      {condCfg?.label ?? tooth.condition}
                    </span>
                  </div>
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
            {teeth.length === 0 && planItems.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-2">Нет данных</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CompletedStageSection ─────────────────────────────────────────────────────

function CompletedStageSection({
  stage,
  teeth,
  planItems,
  isExpanded,
  onToggle,
  actions,
  index,
  doctorName,
  onOpenDetail,
}: SortableSectionProps) {
  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );
  const sectionTotal = planItems.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="select-none opacity-75 hover:opacity-100 transition-opacity">
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.05)]" style={{ borderLeft: "3px solid #10b981" }}>
        <button onClick={onToggle} className="w-full text-left px-4 pt-4 pb-3">
          {/* Stage number + title + завершён badge */}
          <div className="flex items-start gap-3 mb-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 bg-emerald-500">
              <CircleCheck className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[15px] font-bold text-gray-600 leading-tight">{stage.label}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Завершён</span>
              </div>
              <p className="text-[12px] text-gray-400 leading-tight">
                {teeth.length > 0
                  ? `Зуб${teeth.length > 1 ? "ы" : ""} ${teeth.map((t) => t.toothFdi).join(", ")}`
                  : orphanItems.length > 0 ? "Дополнительные услуги" : "—"}
              </p>
            </div>
          </div>

          {/* Сумма этапа */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">Сумма этапа</span>
            <span className="text-[11px] font-semibold text-gray-400">
              {sectionTotal > 0 ? formatPrice(sectionTotal) : "—"}
            </span>
          </div>

          {/* Процедур count — opens detail sheet */}
          <div
            role="button"
            onClick={(e) => { e.stopPropagation(); onOpenDetail?.(); }}
            className="flex items-center justify-between py-2.5 border-t border-gray-100 -mx-4 px-4 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
          >
            <span className="text-[13px] text-gray-500 font-medium">
              Процедур: {planItems.length}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-3 py-2.5 space-y-2">
            {teeth.map((tooth) => {
              const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
              const toothItems = planItems.filter((p) => p.toothFdi === tooth.toothFdi);
              return (
                <div key={tooth.toothFdi} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: condCfg?.crownFill ?? "#e5e7eb", border: `1.5px solid ${condCfg?.stroke ?? "#9ca3af"}` }}
                    />
                    <span className="text-[12px] font-semibold text-gray-500">Зуб {tooth.toothFdi}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-600">
                      {condCfg?.label ?? tooth.condition}
                    </span>
                  </div>
                  {toothItems.length > 0 ? (
                    <div className="pl-3.5 space-y-1.5">
                      {toothItems.map((item) => <PlanItemCard key={item.id} item={item} actions={actions} />)}
                    </div>
                  ) : (
                    <p className="pl-3.5 text-[11px] text-gray-400 italic">нет позиций плана</p>
                  )}
                </div>
              );
            })}
            {orphanItems.length > 0 && (
              <div className="space-y-1.5">
                {teeth.length > 0 && (
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide pt-1">Без привязки к зубу</div>
                )}
                {orphanItems.map((item) => <PlanItemCard key={item.id} item={item} showTooth actions={actions} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StageDetailSheet ──────────────────────────────────────────────────────────

interface StageDetailSheetProps {
  open: boolean;
  onClose: () => void;
  stage: StageConfig;
  teeth: ToothRecord[];
  planItems: TreatmentPlanItem[];
  actions: ItemActions;
  doctorName?: string;
  planNotes?: string;
}

function StageDetailSheet({
  open,
  onClose,
  stage,
  teeth,
  planItems,
  actions,
  doctorName,
  planNotes,
}: StageDetailSheetProps) {
  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );
  const activeProcedures = planItems.filter((p) => p.status !== "cancelled");
  const completedCount = activeProcedures.filter((p) => p.status === "completed").length;
  const totalCount = activeProcedures.length;
  const sectionTotal = activeProcedures.reduce((sum, item) => sum + item.price, 0);
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const runningCount = activeProcedures.filter(
    (p) => p.status === "pending" && actions.getTimerStart(p.id) !== undefined,
  ).length;

  const statusLabel = (() => {
    if (runningCount > 0) return { text: "В процессе", cls: "bg-blue-50 text-blue-600 border-blue-100" };
    const pending = activeProcedures.filter((p) => p.status === "pending");
    const completed = activeProcedures.filter((p) => p.status === "completed");
    if (pending.length > 0 && completed.length === 0) return { text: "Запланирован", cls: "bg-slate-100 text-slate-600 border-slate-200" };
    if (pending.length > 0 && completed.length > 0) return { text: "В работе", cls: "bg-amber-50 text-amber-600 border-amber-100" };
    if (completed.length > 0) return { text: "Завершён", cls: "bg-emerald-50 text-emerald-600 border-emerald-100" };
    return { text: "Запланирован", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  })();

  const stageDescription = teeth.length > 0
    ? `Зуб${teeth.length > 1 ? "ы" : ""} ${teeth.map((t) => t.toothFdi).join(", ")}`
    : orphanItems.length > 0 ? "Дополнительные услуги" : "—";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-[16px] font-bold text-gray-900">{stage.label}</span>
          <div className="w-8 h-8" />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-5">
          {/* Status badge */}
          <div className="flex justify-center pt-1">
            <span className={cn("text-[12px] font-semibold px-3 py-1 rounded-full border", statusLabel.cls)}>
              {statusLabel.text}
            </span>
          </div>

          {/* Description */}
          <p className="text-center text-[14px] text-gray-500">{stageDescription}</p>

          {/* Total + progress */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">Сумма этапа</p>
              <p className="text-[24px] font-bold text-gray-900 leading-tight">
                {sectionTotal > 0 ? formatPrice(sectionTotal) : "—"}
              </p>
            </div>
            {totalCount > 0 && (
              <>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[12px] text-gray-400">
                  Выполнено{" "}
                  <span className="text-gray-700 font-semibold">{completedCount}</span>{" "}
                  из{" "}
                  <span className="text-gray-700 font-semibold">{totalCount}</span>{" "}
                  процедур
                </p>
              </>
            )}
          </div>

          {/* Procedures list */}
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 mb-3">
              Процедуры ({totalCount})
            </h3>
            <div className="space-y-2">
              {teeth.map((tooth) => {
                const condCfg = CONDITION_CONFIG[tooth.condition ?? "healthy"];
                const toothItems = planItems.filter(
                  (p) => p.toothFdi === tooth.toothFdi && p.status !== "cancelled",
                );
                if (toothItems.length === 0) return null;
                return toothItems.map((item) => (
                  <DetailProcedureCard
                    key={item.id}
                    item={item}
                    toothLabel={`${tooth.toothFdi}`}
                    condCfg={condCfg}
                    stage={stage}
                    doctorName={doctorName}
                    actions={actions}
                  />
                ));
              })}
              {orphanItems.filter((p) => p.status !== "cancelled").map((item) => (
                <DetailProcedureCard
                  key={item.id}
                  item={item}
                  doctorName={doctorName}
                  actions={actions}
                  stage={stage}
                />
              ))}
            </div>

            {totalCount === 0 && (
              <p className="text-center text-[13px] text-gray-400 py-6">Нет процедур</p>
            )}

            {/* Add procedure button */}
            <button className="w-full mt-3 py-3 rounded-xl border border-dashed border-gray-200 text-[13px] text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
              <span className="text-lg leading-none">+</span>
              Добавить процедуру
            </button>
          </div>

          {/* Назначено */}
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 mb-3">Назначено</h3>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
              <div className="flex items-center gap-3 px-4 py-3">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-[13px] text-gray-500">Дата не назначена</span>
              </div>
              {doctorName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-primary">
                      {doctorName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-[13px] text-gray-700 font-medium">{doctorName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <h3 className="text-[15px] font-bold text-gray-900 mb-3">Комментарий</h3>
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
              {planNotes ? (
                <p className="text-[13px] text-gray-600 leading-relaxed">{planNotes}</p>
              ) : (
                <p className="text-[13px] text-gray-400 italic">Нет комментария</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── DetailProcedureCard ────────────────────────────────────────────────────────

function DetailProcedureCard({
  item,
  toothLabel,
  condCfg,
  stage,
  doctorName,
  actions,
}: {
  item: TreatmentPlanItem;
  toothLabel?: string;
  condCfg?: (typeof CONDITION_CONFIG)[string];
  stage: StageConfig;
  doctorName?: string;
  actions: ItemActions;
}) {
  const isDone = item.status === "completed";
  const timerStart = actions.getTimerStart(item.id);
  const isRunning = timerStart !== undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 bg-white",
        isDone ? "border-emerald-100 bg-emerald-50/30" : "border-gray-100",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Tooth badge or icon */}
        {toothLabel ? (
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold text-white shrink-0"
            style={{ backgroundColor: stage.color }}
          >
            {toothLabel}
          </span>
        ) : (
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
            <Stethoscope className="w-5 h-5 text-gray-400" />
          </span>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className={cn("text-[14px] font-semibold leading-snug", isDone ? "line-through text-gray-400" : "text-gray-900")}>
              {item.title}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
          </div>

          {condCfg && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              {condCfg.label}
            </p>
          )}

          <div className="mt-2 space-y-1">
            {doctorName && (
              <div className="flex items-center gap-4 text-[12px] text-gray-500">
                <span className="text-gray-400 w-16 shrink-0">Доктор:</span>
                <span className="font-medium">{doctorName}</span>
              </div>
            )}
            {isRunning && (
              <div className="flex items-center gap-4 text-[12px] text-gray-500">
                <span className="text-gray-400 w-16 shrink-0">Длительность:</span>
                <span className="font-mono font-semibold text-blue-600">{formatElapsed(timerStart!)}</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-[12px] text-gray-500">
              <span className="text-gray-400 w-16 shrink-0">Стоимость:</span>
              <span className="font-semibold text-gray-700">{formatPrice(item.price)}</span>
            </div>
          </div>

          {/* Status badge */}
          <div className="mt-2">
            {isDone ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                Выполнено
              </span>
            ) : isRunning ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                Выполняется
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                Запланирована
              </span>
            )}
          </div>
        </div>
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
  const { user } = useAuthStore();
  const { data: usersData } = useListUsers();
  const allUsers = useMemo(() => usersData?.data?.users ?? [], [usersData]);
  const doctorName = useMemo(() => {
    const docId = activePlan?.doctorId;
    if (!docId) return undefined;
    return allUsers.find((u) => u.id === docId)?.name;
  }, [activePlan?.doctorId, allUsers]);

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
  const [expandedCompletedIds, setExpandedCompletedIds] = useState<Set<string>>(new Set());
  const [detailStageId, setDetailStageId] = useState<string | null>(null);

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

  // ── Edit mode state ───────────────────────────────────────────────────────

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; price: string }>({ title: "", price: "" });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

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

  const editMutation = useUpdateTreatmentPlanItem({
    mutation: {
      onSuccess: () => {
        setSavingEditId(null);
        setEditingItemId(null);
        setEditDraft({ title: "", price: "" });
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        toast({ title: "Позиция обновлена" });
      },
      onError: () => {
        setSavingEditId(null);
        toast({ title: "Ошибка", description: "Не удалось сохранить изменения", variant: "destructive" });
      },
    },
  });

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleEditStart = useCallback((item: TreatmentPlanItem) => {
    setEditingItemId(item.id);
    setEditDraft({ title: item.title, price: String(item.price) });
  }, []);

  const handleEditSave = useCallback((itemId: string) => {
    if (!planId || savingEditId) return;
    setSavingEditId(itemId);
    editMutation.mutate({
      id: patientId,
      planId,
      itemId,
      data: {
        title: editDraft.title.trim(),
        price: Number(editDraft.price) || 0,
      },
    });
  }, [planId, patientId, savingEditId, editDraft, editMutation]);

  const handleEditCancel = useCallback(() => {
    setEditingItemId(null);
    setEditDraft({ title: "", price: "" });
  }, []);

  const handleEditDraftChange = useCallback((field: "title" | "price", value: string) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      if (prev) {
        // exiting edit mode — close any open edit form
        setEditingItemId(null);
        setEditDraft({ title: "", price: "" });
      }
      return !prev;
    });
  }, []);

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
    isEditMode,
    editingItemId,
    editDraft,
    onEditStart: handleEditStart,
    onEditSave: handleEditSave,
    onEditCancel: handleEditCancel,
    onEditDraftChange: handleEditDraftChange,
    savingEditId,
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

  const pendingActiveStages = activeStages.filter(
    (stage) => !isStageFullyCompleted(stageItems.get(stage.id)!),
  );
  const completedActiveStages = activeStages.filter(
    (stage) => isStageFullyCompleted(stageItems.get(stage.id)!),
  );

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

  const toggleExpandedCompleted = useCallback((id: string) => {
    setExpandedCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (activeStages.length === 0) return null;

  // reset completed expanded state when patient changes (handled by patientId key externally)

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
      {activePlan && (
        <div className="flex justify-end px-0.5">
          <button
            onClick={handleToggleEditMode}
            className={cn(
              "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors",
              isEditMode
                ? "bg-amber-500 border-amber-500 text-white hover:bg-amber-600"
                : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300",
            )}
          >
            {isEditMode ? (
              <>
                <Check className="w-3 h-3" />
                Готово
              </>
            ) : (
              <Pencil className="w-3 h-3" />
            )}
          </button>
        </div>
      )}

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

      {/* Active (pending) sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pendingActiveStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {pendingActiveStages.map((stage, idx) => {
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
                  index={idx}
                  userRole={user?.role}
                  doctorName={doctorName}
                  onOpenDetail={() => setDetailStageId(stage.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Completed sections — always at the bottom, outside DnD */}
      {completedActiveStages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-0.5 pt-1">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Завершённые разделы
            </span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          {completedActiveStages.map((stage, idx) => {
            const items = stageItems.get(stage.id)!;
            return (
              <CompletedStageSection
                key={stage.id}
                stage={stage}
                teeth={items.teeth}
                planItems={items.planItems}
                isExpanded={expandedCompletedIds.has(stage.id)}
                onToggle={() => toggleExpandedCompleted(stage.id)}
                actions={actions}
                index={pendingActiveStages.length + idx}
                userRole={user?.role}
                doctorName={doctorName}
                onOpenDetail={() => setDetailStageId(stage.id)}
              />
            );
          })}
        </div>
      )}

      {/* Stage detail sheet */}
      {detailStageId && (() => {
        const detailStage = STAGE_CONFIGS.find((s) => s.id === detailStageId);
        const detailItems = stageItems.get(detailStageId);
        if (!detailStage || !detailItems) return null;
        return (
          <StageDetailSheet
            open={true}
            onClose={() => setDetailStageId(null)}
            stage={detailStage}
            teeth={detailItems.teeth}
            planItems={detailItems.planItems}
            actions={actions}
            doctorName={doctorName}
            planNotes={activePlan?.notes}
          />
        );
      })()}
    </div>
  );
}
