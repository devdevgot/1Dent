import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { PlanItemDetailModal } from "./plan-item-detail-modal";
import { useAuthStore } from "@/hooks/use-auth";
import { useListUsers } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
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
  Circle,
  CircleDot,
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
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCompleteTreatmentPlanItem,
  useUpdateTreatmentPlanItem,
  useListTreatmentPlans,
  getGetActiveTreatmentPlanQueryKey,
  getListTreatmentPlansQueryKey,
  getListTeethQueryKey,
  updateTreatmentPlanItem,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ToothRecord, TreatmentPlan, TreatmentPlanItem, UpdateTreatmentPlanItemRequest } from "@workspace/api-client-react";
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
  indexNumber?: number;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    id: "prevention_treatment",
    label: "Этап 1. Профилактика и лечение зубов",
    conditions: ["cavity", "treated", "root_canal"],
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#10b981",
    textColor: "#047857",
    badgeBg: "#d1fae5",
    Icon: Stethoscope,
    indexNumber: 1,
  },
  {
    id: "surgery",
    label: "Этап 2. Хирургия",
    conditions: ["extraction_needed", "implant", "missing"],
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#2563eb",
    textColor: "#1d4ed8",
    badgeBg: "#dbeafe",
    Icon: Scissors,
    indexNumber: 2,
  },
  {
    id: "orthopedics",
    label: "Этап 3. Ортопедическое лечение",
    conditions: ["crown"],
    color: "#7c3aed",
    bgColor: "#faf5ff",
    borderColor: "#7c3aed",
    textColor: "#6d28d9",
    badgeBg: "#ede9fe",
    Icon: Crown,
    indexNumber: 3,
  },
  {
    id: "other",
    label: "Прочее",
    conditions: [],
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
  prevention_treatment: [
    "гигиен", "чистк", "профилактик", "отбелива",
    "кариес", "пломб", "реставрац", "препарир", "герметик", "шлифовк", "полировк",
    "канал", "пульп", "эндодонт", "штифт", "культ", "депульп", "апекс", "корнев", "периодонт"
  ],
  surgery: [
    "удален", "экстракц", "альвеол", "лунк", "кюретаж",
    "имплант", "абатмент", "синус", "остеотом"
  ],
  orthopedics: [
    "коронк", "ортопед", "слепок", "примерк", "цементир", "вкладк", "протез", "люминир"
  ],
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

function formatCountdown(remainingMs: number): string {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}:${s.toString().padStart(2, "0")}`;
}

const DURATION_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "15 мин", ms: 15 * 60_000 },
  { label: "30 мин", ms: 30 * 60_000 },
  { label: "45 мин", ms: 45 * 60_000 },
  { label: "1 час", ms: 60 * 60_000 },
  { label: "1.5 ч", ms: 90 * 60_000 },
  { label: "2 часа", ms: 120 * 60_000 },
];

// ── Item action callbacks type ────────────────────────────────────────────────

interface ItemActions {
  onStart: (itemId: string, durationMs?: number | null) => void;
  onStopTimer: (itemId: string) => void;
  onComplete: (itemId: string) => void;
  onCancel: (itemId: string) => void;
  getTimerStart: (itemId: string) => number | undefined;
  getTimerDuration: (itemId: string) => number | undefined;
  tick: number; // forces re-render every second when timers active
  completingId: string | null;
  cancellingId: string | null;
  completionPromptItemId: string | null;
  onDismissPrompt: (continueTimer: boolean) => void;
  // edit mode
  isEditMode: boolean;
  editingItemId: string | null;
  editDraft: { title: string; price: string };
  onEditStart: (item: TreatmentPlanItem) => void;
  onEditSave: (itemId: string) => void;
  onEditCancel: () => void;
  onEditDraftChange: (field: "title" | "price", value: string) => void;
  savingEditId: string | null;
  onOpenModal: (itemId: string) => void;
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
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
          <label className="block text-[10px] font-semibold text-[#64748b] uppercase tracking-wide">Название</label>
          <input
            autoFocus
            value={actions.editDraft.title}
            onChange={(e) => actions.onEditDraftChange("title", e.target.value)}
            className="w-full text-[12.5px] border border-[#e8e3d9] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            placeholder="Название процедуры"
            onKeyDown={(e) => {
              if (e.key === "Enter") actions.onEditSave(item.id);
              if (e.key === "Escape") actions.onEditCancel();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-semibold text-[#64748b] uppercase tracking-wide">Стоимость (₸)</label>
          <input
            type="number"
            min="0"
            value={actions.editDraft.price}
            onChange={(e) => actions.onEditDraftChange("price", e.target.value)}
            className="w-full text-[12.5px] border border-[#e8e3d9] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
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
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-[#e8e3d9] text-[#64748b] hover:bg-[#f1ede4] transition-colors disabled:opacity-50"
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
      onClick={() => { if (!actions.isEditMode) actions.onOpenModal(item.id); }}
      className={cn(
        "rounded-lg border transition-all duration-200",
        !actions.isEditMode && "cursor-pointer hover:bg-[#faf8f4]/50",
        isDone
          ? "border-emerald-100 bg-emerald-50/40"
          : isRunning
          ? "border-blue-200 bg-blue-50/30 shadow-sm"
          : "border-[#e8e3d9] bg-white",
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
            <span className="w-4 h-4 rounded-full border-2 border-[#e8e3d9] inline-block" />
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "block text-[12.5px] font-medium leading-snug",
              isDone ? "line-through text-[#94a3b8]" : "text-[#0f172a]",
            )}
          >
            {item.title}
          </span>

          {/* Badges row */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {showTooth && item.toothFdi && (
              <span className="text-[10px] bg-[#f1ede4] text-[#64748b] px-1.5 py-0.5 rounded font-medium">
                з.{item.toothFdi}
              </span>
            )}
            {item.price > 0 && (
              <span className="text-[10px] text-[#94a3b8] font-medium">
                {item.discount > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="line-through">{formatPrice(item.price)}</span>
                    <span className="text-emerald-600 font-semibold bg-emerald-50 px-1 rounded">
                      {formatPrice(item.price * (1 - item.discount / 100))}
                    </span>
                  </span>
                ) : (
                  formatPrice(item.price)
                )}
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
            className="shrink-0 p-1.5 rounded-md text-[#94a3b8] hover:text-blue-500 hover:bg-blue-50 transition-colors mt-0.5"
            title="Редактировать позицию"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Timer + action bar (only for pending items, not in edit mode) */}
      {isPending && !actions.isEditMode && !isAdmin && (
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
                className="ml-1 p-1 rounded text-[#94a3b8] hover:text-[#64748b] hover:bg-[#f1ede4] transition-colors"
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
                  onClick={(e) => { e.stopPropagation(); actions.onOpenModal(item.id); }}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  Начать
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
  earnedTotal?: number;
  earnedCount?: number;
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
  earnedTotal,
  earnedCount,
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
  const sectionOriginalTotal = planItems.reduce((sum, item) => sum + item.price, 0);
  const sectionDiscountedTotal = planItems.reduce((sum, item) => {
    const discount = item.discount ?? 0;
    return sum + item.price * (1 - discount / 100);
  }, 0);
  const stageDiscount = planItems.length > 0 ? (planItems[0].discount ?? 0) : 0;
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
                <span className="text-[15px] font-bold text-[#0f172a] leading-tight">{stage.label}</span>
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
              <p className="text-[12px] text-[#94a3b8] leading-tight">
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
                className="cursor-grab active:cursor-grabbing text-[#94a3b8] hover:text-[#64748b] transition-colors pt-1.5 shrink-0"
                aria-label="Перетащить раздел"
              >
                <GripVertical className="w-4 h-4" />
              </span>
            )}
          </div>

          {/* Сумма этапа / Заработано */}
          <div className="flex items-center justify-between py-1.5 border-t border-[#e8e3d9]">
            {sectionOriginalTotal > 0 ? (
              <>
                <span className="text-[11px] text-[#94a3b8]">Сумма этапа</span>
                {stageDiscount > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#94a3b8] line-through">{formatPrice(sectionOriginalTotal)}</span>
                    <span className="text-[11px] font-bold text-emerald-600">{formatPrice(sectionDiscountedTotal)}</span>
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-100">-{stageDiscount}%</span>
                  </div>
                ) : (
                  <span className="text-[11px] font-semibold text-[#64748b]">{formatPrice(sectionOriginalTotal)}</span>
                )}
              </>
            ) : earnedTotal && earnedTotal > 0 ? (
              <>
                <span className="text-[11px] text-emerald-600 font-medium">Заработано</span>
                <span className="text-[11px] font-bold text-emerald-600">{formatPrice(earnedTotal)}</span>
              </>
            ) : (
              <>
                <span className="text-[11px] text-[#94a3b8]">Сумма этапа</span>
                <span className="text-[11px] font-semibold text-[#64748b]">—</span>
              </>
            )}
          </div>
        </button>

        {/* Процедур count — outside <button> to avoid nesting interactive elements */}
        <button
          type="button"
          onClick={() => onOpenDetail?.()}
          className="w-full flex items-center justify-between py-2.5 border-t border-[#e8e3d9] px-4 bg-[#faf8f4] hover:bg-[#f1ede4] active:bg-[#e8e3d9] transition-colors"
        >
          {planItems.filter((p) => p.status !== "cancelled").length > 0 ? (
            <span className="text-[13px] text-[#64748b] font-medium">
              Процедур: {planItems.filter((p) => p.status !== "cancelled").length}
            </span>
          ) : earnedCount && earnedCount > 0 ? (
            <span className="text-[13px] text-emerald-600 font-medium">
              Выполнено ранее: {earnedCount}
            </span>
          ) : (
            <span className="text-[13px] text-[#94a3b8] font-medium">Процедур: 0</span>
          )}
          <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
        </button>

        {/* Date + Doctor row — outside <button> */}
        <div className="flex items-center justify-between py-2.5 border-t border-[#e8e3d9] px-4">
          <div className="flex items-center gap-1.5 text-[12px] text-[#94a3b8]">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {(() => {
              const scheduledItems = planItems
                .filter((p) => p.status === "pending" && p.scheduledAt)
                .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
              const nearest = scheduledItems[0];
              if (nearest?.scheduledAt) {
                const d = new Date(nearest.scheduledAt);
                return (
                  <span className="text-primary font-medium">
                    {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{" "}
                    {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    {scheduledItems.length > 1 && (
                      <span className="text-[#94a3b8] font-normal ml-1">+{scheduledItems.length - 1}</span>
                    )}
                  </span>
                );
              }
              return <span>Дата не назначена</span>;
            })()}
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {runningCount} идёт
              </span>
            )}
          </div>
          {(userRole === "owner" || userRole === "admin") && doctorName && (
            <span className="text-[11px] text-[#64748b] font-medium truncate max-w-[100px]">
              {doctorName}
            </span>
          )}
        </div>

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
  const sectionOriginalTotal = planItems.reduce((sum, item) => sum + item.price, 0);
  const sectionDiscountedTotal = planItems.reduce((sum, item) => {
    const discount = item.discount ?? 0;
    return sum + item.price * (1 - discount / 100);
  }, 0);
  const stageDiscount = planItems.length > 0 ? (planItems[0].discount ?? 0) : 0;

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
                <span className="text-[15px] font-bold text-[#64748b] leading-tight">{stage.label}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Завершён</span>
              </div>
              <p className="text-[12px] text-[#94a3b8] leading-tight">
                {teeth.length > 0
                  ? `Зуб${teeth.length > 1 ? "ы" : ""} ${teeth.map((t) => t.toothFdi).join(", ")}`
                  : orphanItems.length > 0 ? "Дополнительные услуги" : "—"}
              </p>
            </div>
          </div>

          {/* Сумма этапа */}
          <div className="flex items-center justify-between py-1.5 border-t border-[#e8e3d9]">
            <span className="text-[11px] text-[#94a3b8]">Сумма этапа</span>
            {stageDiscount > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#94a3b8] line-through">{formatPrice(sectionOriginalTotal)}</span>
                <span className="text-[11px] font-bold text-emerald-600">{formatPrice(sectionDiscountedTotal)}</span>
                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-100">-{stageDiscount}%</span>
              </div>
            ) : (
              <span className="text-[11px] font-semibold text-[#94a3b8]">
                {sectionOriginalTotal > 0 ? formatPrice(sectionOriginalTotal) : "—"}
              </span>
            )}
          </div>
        </button>

        {/* Процедур count — outside <button> to avoid nesting interactive elements */}
        <button
          type="button"
          onClick={() => onOpenDetail?.()}
          className="w-full flex items-center justify-between py-2.5 border-t border-[#e8e3d9] px-4 bg-[#faf8f4] hover:bg-[#f1ede4] active:bg-[#e8e3d9] transition-colors"
        >
          <span className="text-[13px] text-[#64748b] font-medium">
            Процедур: {planItems.length}
          </span>
          <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[#e8e3d9] px-3 py-2.5 space-y-2">
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
                    <span className="text-[12px] font-semibold text-[#64748b]">Зуб {tooth.toothFdi}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-600">
                      {condCfg?.label ?? tooth.condition}
                    </span>
                  </div>
                  {toothItems.length > 0 ? (
                    <div className="pl-3.5 space-y-1.5">
                      {toothItems.map((item) => <PlanItemCard key={item.id} item={item} actions={actions} />)}
                    </div>
                  ) : (
                    <p className="pl-3.5 text-[11px] text-[#94a3b8] italic">нет позиций плана</p>
                  )}
                </div>
              );
            })}
            {orphanItems.length > 0 && (
              <div className="space-y-1.5">
                {teeth.length > 0 && (
                  <div className="text-[10px] text-[#94a3b8] font-medium uppercase tracking-wide pt-1">Без привязки к зубу</div>
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
  historicalItems?: TreatmentPlanItem[];
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
  historicalItems = [],
}: StageDetailSheetProps) {
  const toothFdiSet = new Set(teeth.map((t) => t.toothFdi));
  const orphanItems = planItems.filter(
    (p) => p.toothFdi == null || !toothFdiSet.has(p.toothFdi),
  );
  const activeProcedures = planItems.filter((p) => p.status !== "cancelled");
  const showHistorical = activeProcedures.length === 0 && historicalItems.length > 0;
  const displayItems = showHistorical ? historicalItems : activeProcedures;
  const completedCount = displayItems.filter((p) => p.status === "completed").length;
  const totalCount = displayItems.length;
  const sectionOriginalTotal = displayItems.reduce((sum, item) => sum + item.price, 0);
  const sectionDiscountedTotal = displayItems.reduce((sum, item) => {
    const discount = item.discount ?? 0;
    return sum + item.price * (1 - discount / 100);
  }, 0);
  const stageHasDiscount = displayItems.some((item) => (item.discount ?? 0) > 0);
  const sheetStageDiscount = displayItems.length > 0 ? (displayItems[0].discount ?? 0) : 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const runningCount = activeProcedures.filter(
    (p) => p.status === "pending" && actions.getTimerStart(p.id) !== undefined,
  ).length;

  const statusLabel = (() => {
    if (showHistorical) return { text: "Завершён", cls: "bg-emerald-50 text-emerald-600 border-emerald-100" };
    if (runningCount > 0) return { text: "В процессе", cls: "bg-blue-50 text-blue-600 border-blue-100" };
    const pending = activeProcedures.filter((p) => p.status === "pending");
    const completed = activeProcedures.filter((p) => p.status === "completed");
    if (pending.length > 0 && completed.length === 0) return { text: "Запланирован", cls: "bg-[#f1ede4] text-[#64748b] border-[#e8e3d9]" };
    if (pending.length > 0 && completed.length > 0) return { text: "В работе", cls: "bg-amber-50 text-amber-600 border-amber-100" };
    if (completed.length > 0) return { text: "Завершён", cls: "bg-emerald-50 text-emerald-600 border-emerald-100" };
    return { text: "Запланирован", cls: "bg-[#f1ede4] text-[#64748b] border-[#e8e3d9]" };
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
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface-2)] hover:bg-[var(--border)] transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
          <span className="text-[16px] font-bold text-[var(--text)]">{stage.label}</span>
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
          <p className="text-center text-[14px] text-[var(--text-secondary)]">{stageDescription}</p>

          {/* Total + progress */}
          <div className="bg-[var(--bg)] rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-[11px] text-[var(--text-subtle)] mb-0.5">Сумма этапа</p>
              {stageHasDiscount ? (
                <div className="space-y-0.5">
                  <p className="text-[14px] text-[var(--text-subtle)] line-through leading-none">
                    {sectionOriginalTotal > 0 ? formatPrice(sectionOriginalTotal) : "—"}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[24px] font-bold text-emerald-600 leading-none">
                      {sectionDiscountedTotal > 0 ? formatPrice(sectionDiscountedTotal) : "—"}
                    </p>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100">
                      -{sheetStageDiscount}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[24px] font-bold text-[var(--text)] leading-tight">
                  {sectionOriginalTotal > 0 ? formatPrice(sectionOriginalTotal) : "—"}
                </p>
              )}
            </div>
            {totalCount > 0 && (
              <>
                <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  Выполнено{" "}
                  <span className="text-[var(--text)] font-semibold">{completedCount}</span>{" "}
                  из{" "}
                  <span className="text-[var(--text)] font-semibold">{totalCount}</span>{" "}
                  процедур
                </p>
              </>
            )}
          </div>

          {/* Procedures list */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[15px] font-bold text-[var(--text)]">
                Процедуры ({totalCount})
              </h3>
              {showHistorical && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  История
                </span>
              )}
            </div>
            <div className="space-y-2">
              {showHistorical ? (
                historicalItems.map((item) => {
                  const tooth = teeth.find((t) => t.toothFdi === item.toothFdi);
                  const condCfg = tooth ? CONDITION_CONFIG[tooth.condition ?? "healthy"] : undefined;
                  return (
                    <DetailProcedureCard
                      key={item.id}
                      item={item}
                      toothLabel={item.toothFdi != null ? `${item.toothFdi}` : undefined}
                      condCfg={condCfg}
                      stage={stage}
                      doctorName={doctorName}
                      actions={actions}
                    />
                  );
                })
              ) : (
                <>
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
                </>
              )}
            </div>

            {totalCount === 0 && (
              <p className="text-center text-[13px] text-[#94a3b8] py-6">Нет процедур</p>
            )}
          </div>

          {/* Назначено */}
          <div>
            <h3 className="text-[15px] font-bold text-[var(--text)] mb-3">Назначено</h3>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] divide-y divide-[var(--border)]">
              {(() => {
                const scheduledItems = planItems
                  .filter((p) => p.status === "pending" && p.scheduledAt)
                  .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

                if (scheduledItems.length === 0) {
                  return (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Calendar className="w-4 h-4 text-[#94a3b8] shrink-0" />
                      <span className="text-[13px] text-[#64748b]">Дата не назначена</span>
                    </div>
                  );
                }

                return scheduledItems.map((si) => {
                  const d = new Date(si.scheduledAt!);
                  return (
                    <div key={si.id} className="flex items-center gap-3 px-4 py-3">
                      <Calendar className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] text-[#0f172a] font-medium">
                          {d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}{" "}
                          в {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <p className="text-[11px] text-[#94a3b8] truncate">{si.title}</p>
                      </div>
                    </div>
                  );
                });
              })()}
              {doctorName && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-primary">
                      {doctorName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-[13px] text-[#0f172a] font-medium">{doctorName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Комментарий */}
          <div>
            <h3 className="text-[15px] font-bold text-[var(--text)] mb-3">Комментарий</h3>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] px-4 py-3">
              {planNotes ? (
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{planNotes}</p>
              ) : (
                <p className="text-[13px] text-[var(--text-subtle)] italic">Нет комментария</p>
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
  condCfg?: any;
  stage: StageConfig;
  doctorName?: string;
  actions: ItemActions;
}) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const isDone = item.status === "completed";
  const timerStart = actions.getTimerStart(item.id);
  const isRunning = timerStart !== undefined;
  const timerDuration = actions.getTimerDuration(item.id);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const remainingMs = isRunning && timerDuration != null
    ? timerDuration - (Date.now() - timerStart!)
    : null;
  const isExpired = remainingMs !== null && remainingMs <= 0;
  const pct = (isRunning && timerDuration != null && timerStart != null)
    ? Math.min(100, Math.round(((Date.now() - timerStart) / timerDuration) * 100))
    : 0;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 bg-white",
        isDone ? "border-emerald-100 bg-emerald-50/30"
          : isRunning ? "border-blue-100 bg-blue-50/20"
          : "border-[#e8e3d9]",
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
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#f1ede4]">
            <Stethoscope className="w-5 h-5 text-[#94a3b8]" />
          </span>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className={cn("text-[14px] font-semibold leading-snug", isDone ? "line-through text-[#94a3b8]" : "text-[#0f172a]")}>
              {item.title}
            </span>
          </div>

          {condCfg && (
            <p className="text-[11px] text-[#94a3b8] mt-0.5">{condCfg.label}</p>
          )}

          <div className="mt-2 space-y-1">
            {doctorName && (
              <div className="flex items-center gap-4 text-[12px] text-[#64748b]">
                <span className="text-[#94a3b8] w-16 shrink-0">Доктор:</span>
                <span className="font-medium">{doctorName}</span>
              </div>
            )}
            {isRunning && (
              <div className="flex items-center gap-4 text-[12px] text-[#64748b]">
                <span className="text-[#94a3b8] w-16 shrink-0">
                  {timerDuration != null ? "Осталось:" : "Прошло:"}
                </span>
                {timerDuration != null ? (
                  <span className={cn(
                    "font-mono font-bold text-[15px]",
                    isExpired ? "text-red-500" : remainingMs! < 5 * 60_000 ? "text-orange-500" : "text-blue-600",
                  )}>
                    {isExpired ? "0:00" : formatCountdown(remainingMs!)}
                  </span>
                ) : (
                  <span className="font-mono font-semibold text-blue-600">
                    {formatElapsed(timerStart!)}
                  </span>
                )}
              </div>
            )}
            {isRunning && timerDuration != null && (
              <div className="h-1.5 bg-[#f1ede4] rounded-full overflow-hidden mt-1">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    isExpired ? "bg-red-400" : pct > 80 ? "bg-orange-400" : "bg-blue-400",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <div className="flex items-center gap-4 text-[12px] text-[#64748b]">
              <span className="text-[#94a3b8] w-16 shrink-0">Стоимость:</span>
              {item.discount > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[#94a3b8] line-through text-[11px]">
                    {formatPrice(item.price)}
                  </span>
                  <span className="font-bold text-emerald-600">
                    {formatPrice(item.price * (1 - item.discount / 100))}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-100">
                    -{item.discount}%
                  </span>
                </div>
              ) : (
                <span className="font-semibold text-[#0f172a]">{formatPrice(item.price)}</span>
              )}
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
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f1ede4] text-[#64748b] border border-[#e8e3d9]">
                Запланирована
              </span>
            )}
          </div>

          {/* Duration picker + start button */}
          {!isDone && !isRunning && !isAdmin && (
            <div className="mt-3">
              {showPicker ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-[#94a3b8] font-medium">Длительность процедуры:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.ms)}
                        onClick={() => setSelectedDuration(opt.ms)}
                        className={cn(
                          "text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors",
                          selectedDuration === opt.ms
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-[#e8e3d9] text-[#64748b] hover:border-blue-300 hover:text-blue-600",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        actions.onStart(item.id, selectedDuration);
                        setShowPicker(false);
                        setSelectedDuration(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold py-2 rounded-xl bg-blue-600 text-white active:bg-blue-700"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Начать
                    </button>
                    <button
                      onClick={() => { setShowPicker(false); setSelectedDuration(null); }}
                      className="px-3 py-2 rounded-xl border border-[#e8e3d9] text-[#64748b] text-[12px] font-semibold active:bg-[#faf8f4]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowPicker(true); setSelectedDuration(null); }}
                  className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-2.5 rounded-xl bg-blue-600 text-white active:bg-blue-700 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Начать процедуру
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SortablePlanItemCard ───────────────────────────────────────────────────────

interface SortablePlanItemCardProps {
  item: TreatmentPlanItem;
  isEditMode: boolean;
  completingId: string | null;
  cancellingId: string | null;
  activeTimerItemId: string | null;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenModal: (id: string) => void;
}

function SortablePlanItemCard({ item, isEditMode, completingId, cancellingId, activeTimerItemId, onComplete, onCancel, onOpenModal }: SortablePlanItemCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isEditMode || item.status !== "pending",
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-[52px] border border-dashed border-primary/30 bg-primary/5 rounded-xl opacity-40"
      />
    );
  }

  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed";
  const isCancellingThis = cancellingId === item.id;

  // Timer-aware states
  const isActive = activeTimerItemId === item.id;
  const isBlocked = isPending && !isActive && activeTimerItemId !== null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 border rounded-xl transition-colors select-none",
        isDragging ? "shadow-xl ring-2 ring-primary/20 z-50 opacity-95" : "shadow-sm",
        // Active timer — blue highlight
        isActive && "bg-blue-50 border-blue-200",
        // Blocked by another active timer — amber tint, muted
        isBlocked && "bg-amber-50/70 border-amber-200/80 opacity-75",
        // Completed — green
        isCompleted && "bg-emerald-50/60 border-emerald-100",
        // Normal pending
        !isActive && !isBlocked && !isCompleted && "bg-white border-[#e8e3d9]",
        !isEditMode && !isBlocked && "cursor-pointer active:bg-[#faf8f4]",
        !isEditMode && isBlocked && "cursor-pointer active:bg-amber-50",
      )}
      onClick={() => { if (!isEditMode) onOpenModal(item.id); }}
    >
      {isEditMode && isPending && !isBlocked ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 text-[#94a3b8] hover:text-[#64748b] p-1 -m-1 touch-none cursor-grab active:cursor-grabbing"
          aria-label="Перетащить"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <div className="shrink-0">
          {isCompleted
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : item.status === "cancelled"
              ? <Ban className="w-5 h-5 text-[#94a3b8]" />
              : isActive
                ? <CircleDot className="w-5 h-5 text-blue-500" />
                : isBlocked
                  ? <Circle className="w-5 h-5 text-amber-300" />
                  : <Circle className="w-5 h-5 text-[#e8e3d9]" />
          }
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-[13px] font-medium leading-snug truncate",
          isCompleted ? "line-through text-[#94a3b8]" : isActive ? "text-blue-800" : isBlocked ? "text-amber-700" : "text-[#0f172a]",
        )}>
          {item.title}
        </p>
        {item.toothFdi != null && (
          <p className={cn("text-[11px] mt-0.5", isActive ? "text-blue-400" : isBlocked ? "text-amber-400" : "text-[#94a3b8]")}>
            Зуб №{item.toothFdi}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right flex flex-col items-end">
          {item.discount > 0 ? (
            <>
              <span className="text-[10px] text-[#94a3b8] line-through leading-none">
                {item.price.toLocaleString("ru-KZ")} ₸
              </span>
              <span className={cn(
                "text-[13px] font-bold leading-tight mt-0.5",
                isCompleted ? "text-emerald-600" : isActive ? "text-blue-600" : isBlocked ? "text-amber-600" : "text-[#0f172a]",
              )}>
                {(item.price * (1 - item.discount / 100)).toLocaleString("ru-KZ")} ₸
              </span>
            </>
          ) : (
            <span className={cn(
              "text-[13px] font-semibold",
              isCompleted ? "text-emerald-600" : isActive ? "text-blue-600" : isBlocked ? "text-amber-600" : "text-[#64748b]",
            )}>
              {item.price.toLocaleString("ru-KZ")} ₸
            </span>
          )}
        </div>

        {isEditMode && isPending && !isBlocked && (
          <button
            onClick={(e) => { e.stopPropagation(); if (!isCancellingThis) onCancel(item.id); }}
            disabled={isCancellingThis}
            className="w-5 h-5 flex items-center justify-center rounded-full text-[#94a3b8] hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isCancellingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── StageContainer ────────────────────────────────────────────────────────────

interface StageContainerProps {
  stage: StageConfig;
  items: TreatmentPlanItem[];
  isEditMode: boolean;
  completingId: string | null;
  cancellingId: string | null;
  activeTimers: Map<string, number>;
  handleComplete: (id: string) => void;
  handleCancel: (id: string) => void;
  setModalItemId: (id: string) => void;
  onOpenDiscount?: (stageId: string) => void;
}

function StageContainer({
  stage,
  items,
  isEditMode,
  completingId,
  cancellingId,
  activeTimers,
  handleComplete,
  handleCancel,
  setModalItemId,
  onOpenDiscount,
}: StageContainerProps) {
  const { setNodeRef } = useDroppable({
    id: stage.id,
  });

  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const stageOriginalTotal = items.reduce((sum, item) => sum + item.price, 0);
  const stageDiscountedTotal = items.reduce((sum, item) => {
    const discount = item.discount ?? 0;
    return sum + item.price * (1 - discount / 100);
  }, 0);
  const stageDiscount = items.length > 0 ? (items[0].discount ?? 0) : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-3 transition-all",
        isEditMode ? "border-dashed border-[#e8e3d9] bg-[#faf8f4]/10" : "border-[#e8e3d9] bg-white"
      )}
      style={{ borderLeft: `4px solid ${stage.color}` }}
    >
      {/* Header of the Stage */}
      <div className="flex items-center justify-between border-b border-[#e8e3d9] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 font-semibold text-[13.5px]" style={{ backgroundColor: stage.color }}>
            {stage.indexNumber ? (
              stage.indexNumber
            ) : (
              <stage.Icon className="w-4 h-4 text-white" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-[#0f172a] text-[13.5px] leading-tight">{stage.label}</h3>
              {stageDiscount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                  -{stageDiscount}%
                </span>
              )}
            </div>
            <span className="text-[10px] text-[#94a3b8] font-medium">
              Процедур: {items.length}
            </span>
          </div>
        </div>
        
        <div className="text-right flex flex-col items-end">
          <span className="text-[9px] text-[#94a3b8] block font-semibold uppercase tracking-wider">Сумма этапа</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {!isAdmin && items.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDiscount?.(stage.id);
                }}
                className={cn(
                  "p-1 rounded-md transition-colors shrink-0",
                  stageDiscount > 0
                    ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                    : "text-[#94a3b8] hover:text-blue-500 hover:bg-[#f1ede4] border border-[#e8e3d9]"
                )}
                title="Указать скидку этапа"
              >
                <Percent className="w-3 h-3" />
              </button>
            )}
            
            <div className="flex flex-col items-end shrink-0">
              {stageDiscount > 0 ? (
                <>
                  <span className="text-[10px] text-[#94a3b8] line-through leading-none">
                    {stageOriginalTotal.toLocaleString("ru-KZ")} ₸
                  </span>
                  <span className="font-bold text-emerald-600 text-[13.5px] leading-tight mt-0.5">
                    {stageDiscountedTotal.toLocaleString("ru-KZ")} ₸
                  </span>
                </>
              ) : (
                <span className="font-bold text-[#0f172a] text-[13.5px]">
                  {stageOriginalTotal > 0 ? stageOriginalTotal.toLocaleString("ru-KZ") + " ₸" : "—"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Items list */}
      <SortableContext id={stage.id} items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[50px]">
          {items.map((item) => (
            <SortablePlanItemCard
              key={item.id}
              item={item}
              isEditMode={isEditMode}
              completingId={completingId}
              cancellingId={cancellingId}
              activeTimerItemId={activeTimers.size > 0 ? (activeTimers.keys().next().value ?? null) : null}
              onComplete={handleComplete}
              onCancel={handleCancel}
              onOpenModal={setModalItemId}
            />
          ))}
          {items.length === 0 && (
            <div className="flex items-center justify-center py-4 border border-dashed border-[#e8e3d9]/50 rounded-xl bg-[#faf8f4]/30">
              <span className="text-[11px] text-[#94a3b8] italic">Перетащите сюда процедуры</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ── PlanItemCardOverlay ────────────────────────────────────────────────────────

function PlanItemCardOverlay({ item }: { item: TreatmentPlanItem }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-primary/20 bg-white shadow-xl select-none cursor-grabbing">
      <div className="shrink-0 text-[#94a3b8]">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-[13px] font-semibold leading-snug truncate text-[#0f172a]">
          {item.title}
        </p>
        {item.toothFdi != null && (
          <p className="text-[11px] mt-0.5 text-[#94a3b8]">
            Зуб №{item.toothFdi}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.discount > 0 ? (
          <div className="text-right flex flex-col items-end">
            <span className="text-[10px] text-[#94a3b8] line-through leading-none">
              {item.price.toLocaleString("ru-KZ")} ₸
            </span>
            <span className="text-[13px] font-bold text-primary leading-tight mt-0.5">
              {(item.price * (1 - item.discount / 100)).toLocaleString("ru-KZ")} ₸
            </span>
          </div>
        ) : (
          <span className="text-[13px] font-bold text-primary">
            {item.price.toLocaleString("ru-KZ")} ₸
          </span>
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
  const [discountModalStageId, setDiscountModalStageId] = useState<string | null>(null);
  const [discountValue, setDiscountValue] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { data: usersData } = useListUsers();
  const { data: allPlansData } = useListTreatmentPlans(patientId);
  const allUsers = useMemo(() => usersData?.data?.users ?? [], [usersData]);
  const allPlans = useMemo(() => (allPlansData as any)?.data?.plans ?? [], [allPlansData]);
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
  const [activeId, setActiveId] = useState<string | null>(null);

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
  /** Map<itemId, plannedDuration (ms)> */
  const [timerDurations, setTimerDurations] = useState<Map<string, number>>(new Map());
  /** Item whose timer just expired — triggers completion modal */
  const [completionPromptItemId, setCompletionPromptItemId] = useState<string | null>(null);
  /** Items where user chose "continue" after expiry — don't re-trigger */
  const [suppressedExpiryIds, setSuppressedExpiryIds] = useState<Set<string>>(new Set());

  // Load persisted timers + durations when plan changes
  useEffect(() => {
    if (!activePlan) { setActiveTimers(new Map()); setTimerDurations(new Map()); return; }
    const tMap = new Map<string, number>();
    const dMap = new Map<string, number>();
    for (const item of activePlan.items) {
      if (item.status !== "pending") continue;
      const raw = localStorage.getItem(`1dent:timer:${item.id}`);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (!isNaN(ts)) tMap.set(item.id, ts);
      }
      const dRaw = localStorage.getItem(`1dent:timer-duration:${item.id}`);
      if (dRaw) {
        const d = parseInt(dRaw, 10);
        if (!isNaN(d)) dMap.set(item.id, d);
      }
    }
    setActiveTimers(tMap);
    setTimerDurations(dMap);
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

  // Check for timer expiry every tick
  useEffect(() => {
    if (activeTimers.size === 0 || completionPromptItemId !== null) return;
    for (const [itemId, startedAt] of activeTimers) {
      const duration = timerDurations.get(itemId);
      if (!duration) continue;
      if (Date.now() - startedAt >= duration && !suppressedExpiryIds.has(itemId)) {
        setCompletionPromptItemId(itemId);
        break;
      }
    }
  }, [tick, activeTimers, timerDurations, completionPromptItemId, suppressedExpiryIds]);

  // ── Mutation state ────────────────────────────────────────────────────────

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [modalItemId, setModalItemId] = useState<string | null>(null);

  // ── Edit mode state ───────────────────────────────────────────────────────

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; price: string }>({ title: "", price: "" });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  // ── Local items order (for optimistic DnD reordering) ─────────────────────

  const [localItems, setLocalItems] = useState<TreatmentPlanItem[]>(() => {
    const items = activePlan?.items.filter((i) => i.status === "pending") ?? [];
    return items.map((item) => ({
      ...item,
      stage: item.stage || conditionToStageId(item.condition) || titleToStageId(item.title) || "other",
    }));
  });
  const pendingReorderCountRef = useRef(0);

  useEffect(() => {
    if (pendingReorderCountRef.current > 0) return;
    const items = activePlan?.items.filter((i) => i.status === "pending") ?? [];
    const enriched = items.map((item) => ({
      ...item,
      stage: item.stage || conditionToStageId(item.condition) || titleToStageId(item.title) || "other",
    }));
    setLocalItems(enriched);
  }, [activePlan?.items]);

  const archivedItems = useMemo(
    () => activePlan?.items.filter((i) => i.status === "completed" || i.status === "cancelled") ?? [],
    [activePlan?.items],
  );

  const planId = activePlan?.id ?? "";

  const completeMutation = useCompleteTreatmentPlanItem({
    mutation: {
      onSuccess: (_data, vars) => {
        // Clear timer + duration for completed item
        localStorage.removeItem(`1dent:timer:${vars.itemId}`);
        localStorage.removeItem(`1dent:timer-duration:${vars.itemId}`);
        setActiveTimers((prev) => { const n = new Map(prev); n.delete(vars.itemId); return n; });
        setTimerDurations((prev) => { const n = new Map(prev); n.delete(vars.itemId); return n; });
        setSuppressedExpiryIds((prev) => { const n = new Set(prev); n.delete(vars.itemId); return n; });
        setCompletionPromptItemId((prev) => prev === vars.itemId ? null : prev);
        setCompletingId(null);
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTreatmentPlansQueryKey(patientId) });
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
        localStorage.removeItem(`1dent:timer-duration:${vars.itemId}`);
        setActiveTimers((prev) => { const n = new Map(prev); n.delete(vars.itemId); return n; });
        setTimerDurations((prev) => { const n = new Map(prev); n.delete(vars.itemId); return n; });
        setSuppressedExpiryIds((prev) => { const n = new Set(prev); n.delete(vars.itemId); return n; });
        setCompletionPromptItemId((prev) => prev === vars.itemId ? null : prev);
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

  const reorderMutation = useMutation({
    mutationFn: async (updates: Array<{ itemId: string; data: any }>) => {
      pendingReorderCountRef.current = 1;
      await Promise.all(
        updates.map(({ itemId, data }) =>
          updateTreatmentPlanItem(patientId, planId, itemId, data)
        )
      );
    },
    onSettled: () => {
      pendingReorderCountRef.current = 0;
      qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
    },
    onError: () => {
      toast({ title: "Не удалось сохранить порядок", variant: "destructive" });
    },
  });

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleSaveStageDiscount = useCallback(() => {
    if (!discountModalStageId || !planId) return;

    const discountNum = Math.max(0, Math.min(100, Number(discountValue) || 0));

    // Get all pending/local items in this stage
    const itemsToUpdate = localItems.filter((item) => item.stage === discountModalStageId);
    
    if (itemsToUpdate.length === 0) {
      setDiscountModalStageId(null);
      setDiscountValue("");
      return;
    }

    // Optimistically update local items
    const updatedLocalItems = localItems.map((item) => {
      if (item.stage === discountModalStageId) {
        return { ...item, discount: discountNum };
      }
      return item;
    });
    setLocalItems(updatedLocalItems);

    // Prepare updates for the API
    const updates = itemsToUpdate.map((item) => ({
      itemId: item.id,
      data: {
        discount: discountNum,
      },
    }));

    // Trigger mutation
    reorderMutation.mutate(updates);

    setDiscountModalStageId(null);
    setDiscountValue("");
    toast({ title: "Скидка применилась к этапу" });
  }, [discountModalStageId, discountValue, planId, localItems, reorderMutation, toast]);

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
    if (isEditMode) {
      // Exiting edit mode: auto-save any open inline form
      if (editingItemId && editDraft.title.trim() && planId) {
        editMutation.mutate({
          id: patientId,
          planId,
          itemId: editingItemId,
          data: {
            title: editDraft.title.trim(),
            price: Number(editDraft.price) || 0,
          },
        });
      }
      setEditingItemId(null);
      setEditDraft({ title: "", price: "" });
    }
    setIsEditMode((prev) => !prev);
  }, [isEditMode, editingItemId, editDraft, planId, patientId, editMutation]);

  // ── Item action handlers ──────────────────────────────────────────────────

  const handleStart = useCallback((itemId: string, durationMs?: number | null) => {
    const now = Date.now();
    try { localStorage.setItem(`1dent:timer:${itemId}`, String(now)); } catch {}
    if (durationMs) {
      try { localStorage.setItem(`1dent:timer-duration:${itemId}`, String(durationMs)); } catch {}
      setTimerDurations((prev) => new Map(prev).set(itemId, durationMs));
    }
    setActiveTimers((prev) => new Map(prev).set(itemId, now));
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
    try { localStorage.removeItem(`1dent:timer-duration:${itemId}`); } catch {}
    setActiveTimers((prev) => { const n = new Map(prev); n.delete(itemId); return n; });
    setTimerDurations((prev) => { const n = new Map(prev); n.delete(itemId); return n; });
    setSuppressedExpiryIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    setCompletionPromptItemId((prev) => prev === itemId ? null : prev);
  }, []);

  const handleComplete = useCallback((itemId: string) => {
    if (!planId || completingId || cancellingId) return;
    setCompletionPromptItemId(null);
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

  const getTimerDuration = useCallback(
    (itemId: string) => timerDurations.get(itemId),
    [timerDurations],
  );

  const onDismissPrompt = useCallback((continueTimer: boolean) => {
    const itemId = completionPromptItemId;
    setCompletionPromptItemId(null);
    if (continueTimer && itemId) {
      setSuppressedExpiryIds((prev) => new Set(prev).add(itemId));
    }
  }, [completionPromptItemId]);

  const actions: ItemActions = {
    onStart: handleStart,
    onStopTimer: handleStopTimer,
    onComplete: handleComplete,
    onCancel: handleCancel,
    getTimerStart,
    getTimerDuration,
    tick,
    completingId,
    cancellingId,
    completionPromptItemId,
    onDismissPrompt,
    isEditMode,
    editingItemId,
    editDraft,
    onEditStart: handleEditStart,
    onEditSave: handleEditSave,
    onEditCancel: handleEditCancel,
    onEditDraftChange: handleEditDraftChange,
    savingEditId,
    onOpenModal: setModalItemId,
  };

  // ── Stage filtering + DnD ─────────────────────────────────────────────────

  const stageItems = useMemo(() => buildStageItems(teeth, activePlan), [teeth, activePlan]);

  // ── Historical completed items from all plans, grouped by stage ──────────

  const historyByStage = useMemo(() => {
    const map = new Map<string, TreatmentPlanItem[]>();
    const toothToStage = new Map<number, string>();
    for (const [stageId, data] of stageItems) {
      for (const tooth of data.teeth) {
        toothToStage.set(tooth.toothFdi, stageId);
      }
    }
    for (const plan of allPlans as TreatmentPlan[]) {
      for (const item of plan.items) {
        if (item.status !== "completed") continue;
        let sid: string | null = conditionToStageId(item.condition);
        if (!sid && item.toothFdi != null) sid = toothToStage.get(item.toothFdi) ?? null;
        if (!sid) sid = titleToStageId(item.title);
        if (!sid) continue;
        const arr = map.get(sid) ?? [];
        arr.push(item);
        map.set(sid, arr);
      }
    }
    return map;
  }, [allPlans, stageItems]);

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
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
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

  const handleItemDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleItemDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleItemDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Find the dragged item
      const draggedItem = localItems.find((i) => i.id === activeId);
      if (!draggedItem) return;

      // Determine target stage and position
      let targetStageId = "";

      // Is the drop target a stage container itself?
      const targetStage = STAGE_CONFIGS.find((s) => s.id === overId);
      if (targetStage) {
        targetStageId = targetStage.id;
        
        // Dropped directly on a stage container (e.g. empty stage drop zone)
        // Put it at the end of items for this stage
        const otherStageItems = localItems.filter((i) => i.stage !== targetStageId && i.id !== activeId);
        const thisStageItems = localItems.filter((i) => i.stage === targetStageId && i.id !== activeId);
        
        const targetDiscount = thisStageItems.length > 0 ? (thisStageItems[0].discount ?? 0) : 0;
        
        const next = [...otherStageItems, ...thisStageItems, { ...draggedItem, stage: targetStageId, discount: targetDiscount }];
        const reordered = next.map((item, idx) => ({ ...item, sortOrder: idx }));
        setLocalItems(reordered);

        // Build updates list
        const updates: Array<{ itemId: string; data: UpdateTreatmentPlanItemRequest }> = [
          {
            itemId: activeId,
            data: {
              stage: targetStageId,
              sortOrder: reordered.findIndex((i) => i.id === activeId),
              discount: targetDiscount,
            },
          },
        ];

        // Other items whose indexes shifted
        const toUpdate = reordered
          .map((item, idx) => ({ item, idx }))
          .filter(({ item, idx }) => (item.sortOrder ?? 0) !== idx && item.id !== activeId);
        
        for (const { item, idx } of toUpdate) {
          updates.push({
            itemId: item.id,
            data: { sortOrder: idx },
          });
        }

        reorderMutation.mutate(updates);
        return;
      }

      // Is the drop target another item?
      const targetItem = localItems.find((i) => i.id === overId);
      if (targetItem) {
        targetStageId = targetItem.stage || "other";
        const oldIdx = localItems.findIndex((i) => i.id === activeId);
        const newIdx = localItems.findIndex((i) => i.id === overId);
        
        if (oldIdx === -1 || newIdx === -1) return;
        
        // Move item to new stage and insert at new index
        const next = [...localItems];
        // Remove active
        next.splice(oldIdx, 1);
        
        // Find existing items in target stage to determine target discount
        const targetStageItems = next.filter((i) => i.stage === targetStageId);
        const targetDiscount = targetStageItems.length > 0 ? (targetStageItems[0].discount ?? 0) : 0;
        
        // Insert active with updated stage and discount
        const updatedActive = { ...draggedItem, stage: targetStageId, discount: targetDiscount };
        
        // Find insert position relative to newIdx in the array without active
        const insertIdx = next.findIndex((i) => i.id === overId);
        next.splice(insertIdx, 0, updatedActive);

        const reordered = next.map((item, idx) => ({ ...item, sortOrder: idx }));
        setLocalItems(reordered);

        // Build updates list
        const updates: Array<{ itemId: string; data: UpdateTreatmentPlanItemRequest }> = [
          {
            itemId: activeId,
            data: {
              stage: targetStageId,
              sortOrder: reordered.findIndex((i) => i.id === activeId),
              discount: targetDiscount,
            },
          },
        ];

        // Other items whose indexes shifted
        const toUpdate = reordered
          .map((item, idx) => ({ item, idx }))
          .filter(({ item, idx }) => (item.sortOrder ?? 0) !== idx && item.id !== activeId);
        
        for (const { item, idx } of toUpdate) {
          updates.push({
            itemId: item.id,
            data: { sortOrder: idx },
          });
        }

        reorderMutation.mutate(updates);
      }
    },
    [patientId, planId, reorderMutation, localItems],
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

  if (localItems.length === 0 && !activePlan) return null;

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
      {activePlan && !isAdmin && (
        <div className="flex justify-end px-0.5">
          <button
            onClick={handleToggleEditMode}
            className={cn(
              "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors",
              isEditMode
                ? "bg-amber-500 border-amber-500 text-white hover:bg-amber-600"
                : "border-[#e8e3d9] text-[#64748b] hover:bg-[#faf8f4] hover:border-[#d4cfc6]",
            )}
          >
            {isEditMode ? (
              <>
                <Check className="w-3 h-3" />
                Готово
              </>
            ) : (
              <>
                <Pencil className="w-3 h-3" />
                Редактировать
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="px-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[#94a3b8]">
              Выполнено {completedItems} из {totalItems}
            </span>
            <span className="text-[11px] font-semibold text-[#64748b]">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-[#f1ede4] rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stages columns with DnD reordering */}
      {localItems.length === 0 && archivedItems.length === 0 ? (
        <p className="text-sm text-[#94a3b8] text-center py-6">Нет позиций в плане</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleItemDragStart}
          onDragEnd={handleItemDragEnd}
          onDragCancel={handleItemDragCancel}
        >
          <div className="space-y-4">
            {STAGE_CONFIGS.filter((stage) => {
              if (isEditMode) return true; // Show all stages in edit mode so they can drag items to empty stages
              // Otherwise show only stages that have items (pending or completed)
              const hasPending = localItems.some((item) => item.stage === stage.id);
              const hasArchived = archivedItems.some((item) => {
                const resolved = item.stage || conditionToStageId(item.condition) || titleToStageId(item.title) || "other";
                return resolved === stage.id;
              });
              return hasPending || hasArchived;
            }).map((stage) => {
              const stagePending = localItems.filter((item) => item.stage === stage.id);
              const stageArchived = archivedItems.filter((item) => {
                const resolved = item.stage || conditionToStageId(item.condition) || titleToStageId(item.title) || "other";
                return resolved === stage.id;
              });
              const stageItems = [...stagePending, ...stageArchived];

              return (
                <StageContainer
                  key={stage.id}
                  stage={stage}
                  items={stageItems}
                  isEditMode={isEditMode}
                  completingId={completingId}
                  cancellingId={cancellingId}
                  activeTimers={activeTimers}
                  handleComplete={handleComplete}
                  handleCancel={handleCancel}
                  setModalItemId={setModalItemId}
                  onOpenDiscount={(stageId) => {
                    setDiscountModalStageId(stageId);
                    const stageItemsList = localItems.filter((i) => i.stage === stageId);
                    const currentDiscount = stageItemsList.length > 0 ? (stageItemsList[0].discount ?? 0) : 0;
                    setDiscountValue(currentDiscount > 0 ? String(currentDiscount) : "");
                  }}
                />
              );
            })}
          </div>
          <DragOverlay adjustScale={false}>
            {activeId ? (() => {
              const activeItem = localItems.find((i) => i.id === activeId);
              if (!activeItem) return null;
              return (
                <div className="w-[calc(100vw-32px)] max-w-[400px] shadow-2xl opacity-95 pointer-events-none rotate-2">
                  <PlanItemCardOverlay item={activeItem} />
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
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
            planNotes={activePlan?.notes ?? undefined}
            historicalItems={historyByStage.get(detailStageId) ?? []}
          />
        );
      })()}

      {/* Discount Dialog */}
      <Dialog
        open={discountModalStageId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDiscountModalStageId(null);
            setDiscountValue("");
          }
        }}
      >
        <DialogContent className="max-w-[90vw] sm:max-w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-[var(--text)]">
              Указать скидку для этапа
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[var(--text-secondary)] pt-1">
              Скидка будет применена ко всем процедурам в этом этапе.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--text)]">
                Процент скидки (0-100%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setDiscountValue("");
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        setDiscountValue(String(Math.max(0, Math.min(100, num))));
                      }
                    }
                  }}
                  className="w-full text-[14px] border border-[var(--border)] rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 bg-[var(--surface)] text-[var(--text)]"
                  placeholder="0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveStageDiscount();
                  }}
                />
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <Percent className="w-4 h-4 text-[var(--text-subtle)]" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setDiscountModalStageId(null);
                setDiscountValue("");
              }}
              className="dash-btn dash-btn-secondary px-4 py-2 text-[13px] font-medium"
            >
              Отмена
            </button>
            <button
              onClick={handleSaveStageDiscount}
              className="dash-btn dash-btn-primary px-4 py-2 text-[13px] font-semibold"
            >
              Применить
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion prompt modal (timer expiry) */}
      {(() => {
        const promptItem = completionPromptItemId
          ? activePlan?.items.find((i) => i.id === completionPromptItemId)
          : null;
        return (
          <Dialog open={completionPromptItemId !== null} onOpenChange={(open) => { if (!open) onDismissPrompt(true); }}>
            <DialogContent className="max-w-[90vw] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl p-6">
              <DialogHeader>
                <DialogTitle className="text-[17px] font-bold text-[var(--text)] text-center">
                  Процедура завершена?
                </DialogTitle>
                {promptItem && (
                  <DialogDescription className="text-center text-[13px] text-[var(--text-secondary)] pt-1">
                    {promptItem.title}
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  onClick={() => {
                    if (completionPromptItemId) handleComplete(completionPromptItemId);
                    else onDismissPrompt(false);
                  }}
                  className="dash-btn w-full py-3 !bg-emerald-500 hover:!bg-emerald-600 !text-white !border-0 font-semibold text-[15px]"
                >
                  Да, завершить
                </button>
                <button
                  onClick={() => onDismissPrompt(true)}
                  className="dash-btn dash-btn-secondary w-full py-3 font-semibold text-[15px]"
                >
                  Нет, продолжить
                </button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Plan item detail modal */}
      {modalItemId && (() => {
        const modalItem = localItems.find((i) => i.id === modalItemId)
          ?? activePlan?.items.find((i) => i.id === modalItemId)
          ?? null;
        if (!modalItem || !activePlan) return null;
        return (
          <PlanItemDetailModal
            item={modalItem}
            patientId={patientId}
            planId={activePlan.id}
            allUsers={allUsers as { id: string; name: string; role?: string }[]}
            timerStart={activeTimers.get(modalItemId)}
            timerDuration={timerDurations.get(modalItemId)}
            tick={tick}
            onStart={handleStart}
            onStopTimer={handleStopTimer}
            onComplete={handleComplete}
            onCancel={handleCancel}
            completingId={completingId}
            cancellingId={cancellingId}
            onClose={() => setModalItemId(null)}
          />
        );
      })()}
    </div>
  );
}
