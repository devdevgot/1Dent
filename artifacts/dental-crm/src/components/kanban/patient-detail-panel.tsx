import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, type ComponentType } from "react";
import { useLocation } from "wouter";
import {
  useGetPatient,
  useListTeeth,
  useUpdatePatientStatus,
  useAddPatientInteraction,
  useAddToothTreatment,
  useListPatientTreatments,
  useCompleteToothTreatment,
  useUpdateTooth,
  useListUsers,
  useGetConditionPrices,
  useGetActiveTreatmentPlan,
  useListTreatmentPlans,
  useCreateTreatmentPlan,
  useApproveTreatmentPlan,
  useAddTreatmentPlanItem,
  useUpdateTreatmentPlanItem,
  useCompleteTreatmentPlanItem,
  useListProcedureTemplates,
  useTriggerDentalAiAnalysis,
  getListPatientsQueryKey,
  getGetPatientQueryKey,
  getListTeethQueryKey,
  getListPatientTreatmentsQueryKey,
  getGetActiveTreatmentPlanQueryKey,
  getListTreatmentPlansQueryKey,
  getListProcedureTemplatesQueryKey,
  getDentalAiAnalysisQueryKey,
} from "@workspace/api-client-react";
// Lazy-loaded so they don't block the first paint of the patient card
const DentalAiAnalysisPanel = lazy(() =>
  import("./dental-ai-analysis-panel").then((m) => ({ default: m.DentalAiAnalysisPanel })),
);
const ContractsTab = lazy(() =>
  import("./contracts-tab").then((m) => ({ default: m.ContractsTab })),
);
import { VoiceDiagnosisModal } from "@/components/dental-chart/voice-diagnosis-modal";
import type { ToothRecord, ToothTreatment, ProcedureTemplate } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  X, ChevronDown, ChevronRight, CheckCircle2, Clock, ArrowUpRight,
  Phone, User, Calendar, CreditCard, Stethoscope, Copy, Save, IdCard,
  ClipboardList, Plus, BadgeCheck, Circle, ArrowLeft, Square, CheckSquare, Loader2,
  Scissors, Crown, Wrench, Baby, Sparkles, Activity, ScanLine, Paintbrush, Search, GripVertical, Mic,
  FileText, Ban,
} from "lucide-react";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  KANBAN_COLUMNS,
  SOURCE_LABELS,
  SOURCE_COLORS,
} from "@/lib/patient-utils";
import type { PatientStatus, InteractionType, ToothCondition } from "@workspace/api-client-react";
import { FdiChart, CONDITION_CONFIG, getCanalCount } from "@/components/dental-chart/fdi-chart";
import { TreatmentStagesBoard } from "@/components/dental-chart/treatment-stages-board";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


const INTERACTION_TYPE_KEYS = [
  { value: "note"        as const },
  { value: "call"        as const },
  { value: "whatsapp"   as const },
  { value: "appointment" as const },
];

type DiagnosisMap = Map<number, ToothCondition>;
type DiagnosisNotesMap = Map<number, string>;

const PICKER_CATEGORIES: { key: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "therapy",        label: "Терапия",        Icon: Stethoscope },
  { key: "surgery",        label: "Хирургия",       Icon: Scissors   },
  { key: "orthopedics",    label: "Ортопедия",      Icon: Crown      },
  { key: "implantation",   label: "Имплантация",    Icon: Wrench     },
  { key: "pediatric",      label: "Детская",        Icon: Baby       },
  { key: "hygiene",        label: "Гигиена",        Icon: Sparkles   },
  { key: "periodontology", label: "Пародонтология", Icon: Activity   },
  { key: "radiology",      label: "Рентген",        Icon: ScanLine   },
  { key: "restoration",    label: "Реставрация",    Icon: Paintbrush },
];

// Maps tooth condition → recommended service category (auto-opens category in picker)
const CONDITION_TO_PICKER_CATEGORY: Record<string, string> = {
  cavity:             "therapy",
  root_canal:         "therapy",
  treated:            "therapy",
  crown:              "orthopedics",
  implant:            "implantation",
  extraction_needed:  "surgery",
};

// Keywords to narrow services within a category to only those relevant to the diagnosis
const CONDITION_SERVICE_KEYWORDS: Record<string, string[]> = {
  cavity: [
    "кариес", "пломб", "реставрац", "препарир", "герметик", "матриц",
    "полировк", "шлифовк", "виниp", "инлей", "клин", "изолят",
  ],
  root_canal: [
    "канал", "пульп", "эндодонт", "штифт", "анкер", "культ", "депульп",
    "апекс", "файл", "гуттаперч", "корнев", "ирригац", "перфорац",
  ],
  crown: [
    "коронк", "ортопед", "слепок", "примерк", "цементир", "вкладк",
    "люминир", "протез", "дезоксид", "абатмент", "колпачок",
  ],
  implant: [
    "имплант", "абатмент", "супраструктур", "костн", "синус",
    "мембран", "остеотом", "разрез", "шов", "перикрон",
  ],
  extraction_needed: [
    "удален", "экстракц", "разрез", "шов", "альвеол", "лунк",
    "кюретаж", "гемостаз", "атравматичн",
  ],
};

const CATEGORY_TO_CONDITION: Record<string, ToothCondition> = {
  therapy:        "caries",
  surgery:        "missing",
  orthopedics:    "crown",
  implantation:   "implant",
  pediatric:      "caries",
  hygiene:        "healthy",
  periodontology: "caries",
  radiology:      "healthy",
  restoration:    "treated",
};

function isExtractionItem(title: string) {
  const lower = title.toLowerCase();
  return (
    lower.includes("удален") ||
    lower.includes("экстракц") ||
    lower.includes("удалить зуб")
  );
}

type PlanItemData = { id: string; title: string; price: number; status: string };

function SortablePlanItem({
  item,
  idx,
  isSelected,
  isFirst,
  isOverlay = false,
  onSelect,
  onAction,
  addMutationPending,
}: {
  item: PlanItemData;
  idx: number;
  isSelected: boolean;
  isFirst: boolean;
  isOverlay?: boolean;
  onSelect: (id: string) => void;
  onAction: (type: "treatment" | "extraction", title?: string) => void;
  addMutationPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 220ms cubic-bezier(0.25,0.46,0.45,0.94)",
    opacity: isDragging && !isOverlay ? 0 : 1,
  };

  const isExtraction = isExtractionItem(item.title);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`rounded-xl border select-none ${
          isOverlay
            ? "border-primary bg-white shadow-2xl ring-2 ring-primary/30 scale-[1.03]"
            : isSelected
            ? "border-primary bg-primary/8 ring-1 ring-primary/20"
            : "border-border/50 bg-slate-50"
        }`}
      >
        <div
          className="flex items-start gap-2 px-2.5 pt-2.5 pb-2 cursor-pointer active:bg-primary/5 rounded-t-xl transition-colors"
          onClick={() => !isOverlay && onSelect(item.id)}
        >
          <span className={`shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5 ${
            isFirst ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
          }`}>
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-800 leading-tight block">{item.title}</span>
            {isFirst && (
              <p className="text-[9px] font-semibold text-primary mt-0.5 uppercase tracking-wide">
                Приоритет №1
              </p>
            )}
          </div>
          <span className="text-xs font-semibold text-gray-600 shrink-0 whitespace-nowrap mt-0.5">
            {item.price.toLocaleString("ru")} ₸
          </span>
          <div
            {...attributes}
            {...listeners}
            className="shrink-0 mt-0.5 p-0.5 touch-none cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4 text-gray-300" />
          </div>
        </div>
        {isSelected && !isOverlay && (
          <div className="px-2.5 pb-2.5 pt-0 pl-9">
            <Button
              size="sm"
              className={`w-full h-8 text-xs gap-1.5 ${
                isExtraction ? "bg-red-500 hover:bg-red-600 text-white border-0" : ""
              }`}
              variant="default"
              disabled={addMutationPending}
              onClick={(e) => {
                e.stopPropagation();
                onAction(isExtraction ? "extraction" : "treatment", item.title);
              }}
            >
              {addMutationPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isExtraction ? (
                <><X className="w-3 h-3" />Удалить зуб</>
              ) : (
                <><CheckCircle2 className="w-3 h-3" />Начать лечение</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToothActionModal({
  fdi,
  patientId,
  planItems = [],
  activeTreatment,
  onClose,
  onNavigate,
  onOpenTreatment,
  onTreatmentStarted,
  onTreatmentEnded,
}: {
  fdi: number;
  patientId: string;
  planItems?: Array<{ id: string; title: string; price: number; status: string }>;
  activeTreatment?: ToothTreatment | null;
  onClose: () => void;
  onNavigate: () => void;
  onOpenTreatment?: (fdi: number) => void;
  onTreatmentStarted?: (fdi: number, treatment?: ToothTreatment | null) => void;
  onTreatmentEnded?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const activeTreatmentForThisTooth = activeTreatment?.toothFdi === fdi ? activeTreatment : null;
  const blockingTreatment = activeTreatment && activeTreatment.toothFdi !== fdi ? activeTreatment : null;
  const secondsSinceTreatmentStarted = (treatment: ToothTreatment | null | undefined) => {
    if (!treatment?.performedAt) return 0;
    const startedAt = new Date(treatment.performedAt).getTime();
    if (Number.isNaN(startedAt)) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  };
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [treatmentPhase, setTreatmentPhase] = useState<"select" | "in_progress">(
    activeTreatmentForThisTooth ? "in_progress" : "select",
  );
  const [inProgressTreatmentId, setInProgressTreatmentId] = useState<string | null>(
    activeTreatmentForThisTooth?.id ?? null,
  );
  const [inProgressLabel, setInProgressLabel] = useState(activeTreatmentForThisTooth?.description ?? "");
  const [elapsedSeconds, setElapsedSeconds] = useState(secondsSinceTreatmentStarted(activeTreatmentForThisTooth));

  const [orderedItems, setOrderedItems] = useState<PlanItemData[]>(() =>
    planItems.filter((i) => i.status === "pending"),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    navigator.vibrate?.(40);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id);
      const newIdx = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  useEffect(() => {
    if (treatmentPhase !== "in_progress") return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [treatmentPhase]);

  useEffect(() => {
    if (!activeTreatmentForThisTooth) return;
    setTreatmentPhase("in_progress");
    setInProgressTreatmentId(activeTreatmentForThisTooth.id);
    setInProgressLabel(activeTreatmentForThisTooth.description);
    setElapsedSeconds(secondsSinceTreatmentStarted(activeTreatmentForThisTooth));
    onTreatmentStarted?.(fdi, activeTreatmentForThisTooth);
  }, [activeTreatmentForThisTooth?.id]);

  const formatElapsed = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const addMutation = useAddToothTreatment({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListPatientTreatmentsQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        const treatment = (data as any)?.data?.data?.treatment as ToothTreatment | undefined;
        const treatmentId = treatment?.id ?? null;
        setInProgressTreatmentId(treatmentId);
        setTreatmentPhase("in_progress");
        onTreatmentStarted?.(fdi, treatment ?? null);
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const completeMutation = useCompleteToothTreatment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPatientTreatmentsQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        toast({ title: "Лечение завершено" });
        onTreatmentEnded?.();
        onClose();
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const handleAction = (type: "treatment" | "extraction", label?: string) => {
    if (blockingTreatment) {
      toast({
        title: "Уже идёт лечение",
        description: `Сначала завершите текущее лечение зуба ${blockingTreatment.toothFdi}.`,
        variant: "destructive",
      });
      return;
    }
    const desc = label ?? (type === "treatment" ? t("tooth.startTreatment") : t("tooth.extractTooth"));
    setInProgressLabel(desc);
    setElapsedSeconds(0);
    addMutation.mutate({
      id: patientId,
      toothFdi: fdi,
      data: { description: desc, type },
    });
  };

  const handleComplete = () => {
    if (!inProgressTreatmentId) {
      onTreatmentEnded?.();
      onClose();
      return;
    }
    completeMutation.mutate({
      id: patientId,
      toothFdi: fdi,
      treatmentId: inProgressTreatmentId,
    });
  };

  const handleAbort = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={handleAbort}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-80 border border-border/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {blockingTreatment ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200 bg-amber-50/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-sm text-amber-900">Лечение уже идёт</h3>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Сначала завершите текущее лечение
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Сейчас выполняется процедура на зубе {blockingTreatment.toothFdi}. Другой зуб нельзя начать лечить, пока это лечение не завершено.
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 border border-border/40 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                  Текущая услуга
                </p>
                <p className="text-xs font-medium text-gray-800 leading-snug">
                  {blockingTreatment.description}
                </p>
              </div>

              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white border-0 h-10"
                onClick={() => {
                  setSelectedItemId(null);
                  onOpenTreatment?.(blockingTreatment.toothFdi);
                }}
              >
                <Activity className="w-4 h-4" />
                Открыть текущее лечение
              </Button>
            </div>
          </>
        ) : treatmentPhase === "in_progress" ? (
          <>
            {/* In-progress header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-green-50/60">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
                <h3 className="font-bold text-sm text-green-800">Зуб {fdi} — Лечение</h3>
              </div>
              <button onClick={handleAbort} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* In-progress body */}
            <div className="px-5 py-6 flex flex-col items-center gap-4">
              {/* Service label */}
              {inProgressLabel && (
                <div className="w-full rounded-xl bg-slate-50 border border-border/40 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Услуга</p>
                  <p className="text-xs font-medium text-gray-800 leading-snug">{inProgressLabel}</p>
                </div>
              )}

              {/* Pulsing circle + timer */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative flex items-center justify-center w-16 h-16">
                  <span className="absolute animate-ping w-14 h-14 rounded-full bg-green-200 opacity-50" />
                  <span className="absolute animate-ping w-10 h-10 rounded-full bg-green-300 opacity-40" style={{ animationDelay: "0.3s" }} />
                  <div className="relative z-10 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-mono font-bold text-gray-800 tabular-nums">{formatElapsed(elapsedSeconds)}</p>
                <p className="text-[11px] text-muted-foreground">Процедура выполняется</p>
              </div>

              {/* Complete button */}
              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white border-0 h-10"
                disabled={completeMutation.isPending}
                onClick={handleComplete}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Завершить лечение
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Selection header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h3 className="font-bold text-base">{t("tooth.actionModalTitle", { fdi })}</h3>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Plan items list */}
            {orderedItems.length > 0 ? (
              <div className="p-3 max-h-72 overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                  Услуги из плана лечения
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={orderedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {orderedItems.map((item, idx) => (
                        <SortablePlanItem
                          key={item.id}
                          item={item}
                          idx={idx}
                          isSelected={item.id === selectedItemId}
                          isFirst={idx === 0}
                          onSelect={(id) => setSelectedItemId((prev) => (prev === id ? null : id))}
                          onAction={handleAction}
                          addMutationPending={addMutation.isPending}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
                    {activeId ? (() => {
                      const item = orderedItems.find((i) => i.id === activeId);
                      const idx = orderedItems.findIndex((i) => i.id === activeId);
                      if (!item) return null;
                      return (
                        <SortablePlanItem
                          item={item}
                          idx={idx}
                          isSelected={false}
                          isFirst={idx === 0}
                          isOverlay
                          onSelect={() => {}}
                          onAction={() => {}}
                          addMutationPending={false}
                        />
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground italic text-center pb-1">Нет позиций в плане лечения</p>
                <Button
                  className="w-full justify-start gap-2"
                  variant="outline"
                  disabled={addMutation.isPending}
                  onClick={() => handleAction("treatment")}
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  {t("tooth.startTreatment")}
                </Button>
                <Button
                  className="w-full justify-start gap-2"
                  variant="outline"
                  disabled={addMutation.isPending}
                  onClick={() => handleAction("extraction")}
                >
                  <X className="w-4 h-4 text-red-500" />
                  {t("tooth.extractTooth")}
                </Button>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border/30 px-4 py-2.5">
              <Button
                className="w-full justify-start gap-2 h-8"
                variant="ghost"
                onClick={onNavigate}
              >
                <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                {t("tooth.viewDetails")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TreatmentTaskItem({
  task,
  patientId,
}: {
  task: ToothTreatment;
  patientId: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const completeMutation = useCompleteToothTreatment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPatientTreatmentsQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        toast({ title: t("tooth.taskCompleted") });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const typeLabel = task.type === "treatment"
    ? t("tooth.taskType_treatment")
    : t("tooth.taskType_extraction");

  const typeColor = task.type === "treatment"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl p-3 border border-border/30">
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {t("tooth.title", { fdi: task.toothFdi })}
          </p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${typeColor}`}>
            {typeLabel}
          </span>
        </div>
      </div>
      {task.status === "in_progress" && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 shrink-0"
          disabled={completeMutation.isPending}
          onClick={() =>
            completeMutation.mutate({
              id: patientId,
              toothFdi: task.toothFdi,
              treatmentId: task.id,
            })
          }
        >
          {t("tooth.completeTask")}
        </Button>
      )}
      {task.status === "done" && (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      )}
    </div>
  );
}

type DiagnosisSummaryEntry = {
  fdi: number;
  condition: ToothCondition;
  price: number;
  mkb10: string;
};

function DiagnosisSummaryModal({
  entries,
  patientName,
  onSave,
  onClose,
  isSaving,
}: {
  entries: DiagnosisSummaryEntry[];
  patientName: string;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const nonHealthy = entries.filter((e) => e.condition !== "healthy" && e.condition !== "missing");
  const total = nonHealthy.reduce((s, e) => s + e.price, 0);

  const handleCopy = () => {
    const lines: string[] = [
      `Заключение диагностики — ${patientName}`,
      `Дата: ${new Date().toLocaleDateString("ru")}`,
      "",
    ];
    for (const e of nonHealthy) {
      const label = CONDITION_CONFIG[e.condition]?.label ?? e.condition;
      lines.push(`Зуб ${e.fdi} — ${label} (${e.mkb10}) — ${e.price.toLocaleString("ru-RU")} ₸`);
    }
    lines.push("");
    lines.push(`Итого: ${total.toLocaleString("ru-RU")} ₸`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Заключение скопировано в буфер обмена" });
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[360px] max-h-[80vh] flex flex-col border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <h3 className="font-bold text-base">Заключение диагностики</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {nonHealthy.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-4">
              Все зубы здоровы
            </p>
          ) : (
            nonHealthy.map((e) => {
              const label = CONDITION_CONFIG[e.condition]?.label ?? e.condition;
              return (
                <div key={e.fdi} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/20 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {t("tooth.title", { fdi: e.fdi })} — {label}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.mkb10}</p>
                  </div>
                  {e.price > 0 && (
                    <span className="text-sm font-semibold text-gray-800 shrink-0">
                      {e.price.toLocaleString("ru-RU")} ₸
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {total > 0 && (
          <div className="px-5 py-3 bg-primary/5 border-t border-border/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Итого:</span>
            <span className="text-lg font-bold text-primary">{total.toLocaleString("ru-RU")} ₸</span>
          </div>
        )}

        <div className="flex gap-2 px-5 py-4 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleCopy}
          >
            <Copy className="w-3.5 h-3.5" />
            Скопировать
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? t("tooth.saving") : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PatientDetailPanel() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const selectedPatientId = useKanbanStore((s) => s.selectedPatientId);
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const activeTab = useKanbanStore((s) => s.activeTab);
  const setActiveTab = useKanbanStore((s) => s.setActiveTab);
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedToothFdi, setSelectedToothFdi] = useState<number | null>(null);
  const [interactionType, setInteractionType] = useState<InteractionType>("note");
  const [interactionContent, setInteractionContent] = useState("");
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const [treatmentStep, setTreatmentStep] = useState<1 | 2 | 3>(1);
  const [bundleToken, setBundleToken] = useState<string | null>(null);
  const [bundleUrl, setBundleUrl] = useState<string | null>(null);
  const [bundlePreparing, setBundlePreparing] = useState(false);
  const [bundleSending, setBundleSending] = useState(false);
  const [bundleSent, setBundleSent] = useState(false);
  const [bundlePreviewOpen, setBundlePreviewOpen] = useState(false);
  const [bundleRequiredModalOpen, setBundleRequiredModalOpen] = useState(false);
  const [whatsappNotConnectedOpen, setWhatsappNotConnectedOpen] = useState(false);

  const [isDiagnosisMode, setIsDiagnosisMode] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [diagnosisMap, setDiagnosisMap] = useState<DiagnosisMap>(new Map());
  const [diagnosisNotesMap, setDiagnosisNotesMap] = useState<DiagnosisNotesMap>(new Map());
  const [diagnosisToothFdi, setDiagnosisToothFdi] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const dentalScrollRef = useRef<HTMLDivElement>(null);
  const servicePickerRef = useRef<HTMLDivElement>(null);
  const [diagnosisServicesMap, setDiagnosisServicesMap] = useState<Map<number, ProcedureTemplate[]>>(new Map());

  const [modalToothFdi, setModalToothFdi] = useState<number | null>(null);
  const [activeToothFdi, setActiveToothFdi] = useState<number | null>(null);
  const [activeTreatmentSnapshot, setActiveTreatmentSnapshot] = useState<ToothTreatment | null>(null);
  // Tracks which tooth is selected in the plan view (to filter plan items by tooth)
  const [planViewToothFdi, setPlanViewToothFdi] = useState<number | null>(null);

  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [interactionHistoryCollapsed, setInteractionHistoryCollapsed] = useState(true);
  const [financialCollapsed, setFinancialCollapsed] = useState(true);
  const [proceduresCollapsed, setProceduresCollapsed] = useState(true);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [planDetailId, setPlanDetailId] = useState<string | null>(null);

  // Defer mounting the heavy panel body until after the first paint so the
  // user always sees the spinner/skeleton immediately instead of a white screen.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (!selectedPatientId) {
      setContentReady(false);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setContentReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [selectedPatientId]);

  const { data, isLoading } = useGetPatient(selectedPatientId ?? "", {
    query: {
      queryKey: getGetPatientQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId,
    },
  });

  // Scoped fetch — only this patient's procedures, not the whole clinic
  const { data: proceduresData } = useQuery({
    queryKey: ["procedures", "by-patient", selectedPatientId],
    enabled: !!selectedPatientId,
    staleTime: 30_000,
    queryFn: async () => {
      const tok = localStorage.getItem("auth_token");
      const resp = await fetch(`${getBaseUrl()}/p/api/procedures?patientId=${selectedPatientId}`, {
        credentials: "include",
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!resp.ok) throw new Error("Failed to load procedures");
      return resp.json() as Promise<{ success: boolean; data: { procedures: Array<Record<string, unknown>> } }>;
    },
  });
  const { data: usersData } = useListUsers({ query: { queryKey: ["users"], staleTime: 5 * 60_000 } });

  const patientProcedures = useMemo(
    () => (proceduresData?.data?.procedures ?? []) as any[],
    [proceduresData],
  );
  const allProcedures = patientProcedures;
  const allUsers = usersData?.data?.users ?? [];

  const { data: teethData, refetch: refetchTeeth, isLoading: teethLoading } = useListTeeth(selectedPatientId ?? "", {
    query: {
      queryKey: getListTeethQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "treatment",
    },
  });
  const teethRecords: ToothRecord[] = teethData?.data?.teeth ?? [];
  const hasDiagnosis = teethRecords.length > 0;
  const teethMap = new Map(teethRecords.map((t) => [t.toothFdi, t]));

  const { data: conditionPricesData } = useGetConditionPrices({
    query: {
      queryKey: ["condition-prices"],
      enabled: isDiagnosisMode || activeTab === "treatment",
    },
  });
  const conditionPricesMap = conditionPricesData?.data?.prices ?? {};

  const { data: pickerTemplatesData, isLoading: pickerLoading } = useListProcedureTemplates(
    pickerCategory ? { category: pickerCategory } : undefined,
    {
      query: {
        queryKey: getListProcedureTemplatesQueryKey(pickerCategory ? { category: pickerCategory } : undefined),
        enabled: pickerCategory !== null && (isDiagnosisMode || !hasDiagnosis),
        staleTime: 60_000,
      },
    },
  );
  const pickerTemplates: ProcedureTemplate[] = pickerTemplatesData?.data?.templates ?? [];

  const conditionFilteredTemplates = useMemo(() => {
    if (!diagnosisToothFdi) return pickerTemplates;
    const condition = diagnosisMap.get(diagnosisToothFdi);
    if (!condition) return pickerTemplates;

    let result = pickerTemplates;

    // Step 1: filter by condition keywords
    const keywords = CONDITION_SERVICE_KEYWORDS[condition];
    if (keywords && keywords.length > 0) {
      const byCondition = result.filter((s) => {
        const haystack = `${s.name} ${s.code ?? ""}`.toLowerCase();
        return keywords.some((kw) => haystack.includes(kw));
      });
      if (byCondition.length > 0) result = byCondition;
    }

    // Step 2: for root_canal, also filter by canal count of this specific tooth
    if (condition === "root_canal") {
      const toothCanals = getCanalCount(diagnosisToothFdi);
      if (toothCanals < 3) {
        const byCanals = result.filter((s) => {
          const haystack = `${s.name} ${s.code ?? ""}`.toLowerCase();
          if (toothCanals === 1) {
            // Exclude services that mention 2, 3+ canals
            return !/[23456]\s*кан/.test(haystack) && !haystack.includes("многоканальн");
          }
          if (toothCanals === 2) {
            // Exclude services that mention 3+ canals
            return !/[3456]\s*кан/.test(haystack) && !haystack.includes("многоканальн");
          }
          return true;
        });
        // Only apply canal filter if it doesn't empty the list
        if (byCanals.length > 0) result = byCanals;
      }
      // toothCanals === 3: show everything (molars get all multi-canal services)
    }

    return result;
  }, [pickerTemplates, diagnosisToothFdi, diagnosisMap]);

  const filteredPickerTemplates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return conditionFilteredTemplates;
    return conditionFilteredTemplates.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q),
    );
  }, [conditionFilteredTemplates, pickerSearch]);

  // Auto-scroll to service picker when a condition with a price category is selected
  useEffect(() => {
    if (!pickerCategory) return;
    const frame = requestAnimationFrame(() => {
      if (servicePickerRef.current) {
        servicePickerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (dentalScrollRef.current) {
        dentalScrollRef.current.scrollTo({ top: dentalScrollRef.current.scrollHeight, behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pickerCategory]);

  // When patient changes, restore bundle state from the server so that
  // a page refresh doesn't wipe out a previously prepared bundle.
  useEffect(() => {
    if (!selectedPatientId) {
      setBundleToken(null);
      setBundleUrl(null);
      setBundleSent(false);
      setTreatmentStep(1);
      return;
    }
    const _tok = localStorage.getItem("auth_token");
    void fetch(`/api/contracts/patient/${selectedPatientId}`, {
      credentials: "include",
      headers: _tok ? { Authorization: `Bearer ${_tok}` } : {},
    })
      .then((r) => r.json() as Promise<{ success: boolean; data?: { contracts: Array<{ bundleToken: string | null; status: string }> } }>)
      .then((data) => {
        if (!data.success || !data.data) return;
        const contracts = data.data.contracts;
        // Find the most recent bundle (last in list = newest)
        const bundled = [...contracts].reverse().find((c) => c.bundleToken);
        if (bundled?.bundleToken) {
          // Only restore the token so step 3 knows there's a bundle ready to send.
          // bundleSent must ONLY be set via the WhatsApp Send button — never from DB state.
          setBundleToken(bundled.bundleToken);
        } else {
          setBundleToken(null);
          setBundleUrl(null);
          setBundleSent(false);
        }
      })
      .catch(() => {});
  }, [selectedPatientId]);

  const { data: planData, isLoading: planLoading } = useGetActiveTreatmentPlan(selectedPatientId ?? "", {
    query: {
      queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "treatment",
    },
  });
  const activePlan = planData?.data?.plan ?? null;
  const visibleActivePlanItems = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.items.filter((item) => planViewToothFdi === null || item.toothFdi === planViewToothFdi);
  }, [activePlan, planViewToothFdi]);

  const { data: plansHistoryData, isLoading: plansLoading } = useListTreatmentPlans(selectedPatientId ?? "", {
    query: {
      queryKey: getListTreatmentPlansQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "treatment",
    },
  });
  const dentalLoading = teethLoading || planLoading || plansLoading;

  // Auto-open active plan detail when navigating to step 2
  useEffect(() => {
    if (treatmentStep === 2 && activePlan && planDetailId === null && !planLoading && !plansLoading) {
      setPlanDetailId(activePlan.id);
    }
  }, [treatmentStep, activePlan?.id, planDetailId, planLoading, plansLoading]);

  const allPlans = plansHistoryData?.data?.plans ?? [];
  const pastPlans = allPlans.filter(
    (p) => p.status === "completed" || p.status === "cancelled",
  );

  // Require re-diagnosis before creating a second/third/etc. plan
  const needsRediagnosis = (() => {
    if (!hasDiagnosis || allPlans.length === 0) return false;
    const latestPlanTs = Math.max(...allPlans.map((p) => new Date(p.createdAt).getTime()));
    const latestToothTs = Math.max(...teethRecords.map((t) => new Date(t.updatedAt).getTime()));
    return latestToothTs <= latestPlanTs;
  })();

  const createPlanMutation = useCreateTreatmentPlan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? "") });
        queryClient.invalidateQueries({ queryKey: getListTreatmentPlansQueryKey(selectedPatientId ?? "") });
        toast({ title: "План лечения создан" });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const approvePlanMutation = useApproveTreatmentPlan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? "") });
        toast({ title: "План согласован с пациентом" });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const addPlanItemMutation = useAddTreatmentPlanItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? "") });
        setNewItemTitle("");
        setNewItemPrice("");
        setShowAddItemForm(false);
        toast({ title: "Шаг добавлен" });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const completeItemMutation = useCompleteTreatmentPlanItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? "") });
        queryClient.invalidateQueries({ queryKey: getListTeethQueryKey(selectedPatientId ?? "") });
        toast({ title: "Шаг выполнен, процедура создана" });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const updateItemMutation = useUpdateTreatmentPlanItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? "") });
        setEditingItemId(null);
        toast({ title: "Шаг обновлён" });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const { data: tasksData } = useListPatientTreatments(selectedPatientId ?? "", {
    query: {
      queryKey: getListPatientTreatmentsQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "treatment" && treatmentStep === 1 && hasDiagnosis,
    },
  });
  const allTasks: ToothTreatment[] = tasksData?.data?.treatments ?? [];
  const activeTasks = allTasks.filter((t) => t.status === "in_progress");
  const activeTreatment = activeTasks[0] ?? activeTreatmentSnapshot;
  const activeTreatmentFdi = activeTreatment?.toothFdi ?? activeToothFdi;
  const disabledTreatmentFdis = useMemo(() => {
    const allFdis = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
    if (!hasDiagnosis) return new Set<number>();
    if (activePlan) {
      const plannedFdis = new Set(activePlan.items.filter((item) => item.status === "pending" && item.toothFdi !== null).map((item) => item.toothFdi!));
      return new Set(allFdis.filter((fdi) => !plannedFdis.has(fdi) && fdi !== activeTreatmentFdi));
    }
    if (needsRediagnosis) return new Set(allFdis);
    return new Set<number>();
  }, [activePlan, activeTreatmentFdi, hasDiagnosis, needsRediagnosis]);

  const updateToothMutation = useUpdateTooth({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeethQueryKey(selectedPatientId ?? "") });
      },
    },
  });

  const triggerAnalysisMutation = useTriggerDentalAiAnalysis();

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(selectedPatientId ?? "") });
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && (
              key.includes('DoctorDetailedAnalyticsMe') ||
              key.includes('DoctorDetailedAnalytics') ||
              key.includes('GetDoctorAnalytics') ||
              key.includes('GetAnalytics')
            );
          }
        });
        setIsStatusOpen(false);
        toast({ title: t("patient.statusUpdated") });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const interactionMutation = useAddPatientInteraction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(selectedPatientId ?? "") });
        setInteractionContent("");
        toast({ title: t("patient.interactionAdded") });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const handleFinishDiagnosis = useCallback(() => {
    if (!selectedPatientId) return;
    setShowSummaryModal(true);
  }, [selectedPatientId]);

  // Silently prepares the bundle (no WhatsApp send) — called right after saving diagnosis.
  // Returns the bundleToken on success so the caller can chain a WhatsApp send.
  const handlePrepareBundle = useCallback(async (pid: string): Promise<string | null> => {
    setBundlePreparing(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch(`/api/contracts/patient/${pid}/prepare-extraction-bundle`, {
        method: "POST",
        credentials: "include",
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      const responseData = await res.json() as { success: boolean; data?: { bundleUrl: string; bundleToken: string } };
      if (responseData.success && responseData.data) {
        setBundleToken(responseData.data.bundleToken);
        setBundleUrl(responseData.data.bundleUrl);
        queryClient.invalidateQueries({ queryKey: ["patient-contracts", pid] }).catch(() => {});
        return responseData.data.bundleToken;
      }
    } catch {
      // silent — doctor will see a "prepare" button in step 3 if this fails
    } finally {
      setBundlePreparing(false);
    }
    return null;
  }, [queryClient]);

  // Sends WhatsApp for an already-prepared bundle
  const handleSendBundleWhatsapp = useCallback(async (token: string) => {
    setBundleSending(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch(`/api/contracts/bundle/${token}/send-whatsapp`, {
        method: "POST",
        credentials: "include",
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      const responseData = await res.json() as { success: boolean; code?: string; error?: string; data?: { bundleUrl: string } };
      if (responseData.success) {
        setBundleSent(true);
        if (responseData.data?.bundleUrl) setBundleUrl(responseData.data.bundleUrl);
        toast({ title: "✅ Пакет договоров отправлен пациенту по WhatsApp" });
      } else if (responseData.code === "WHATSAPP_NOT_CONNECTED" || res.status === 422) {
        setWhatsappNotConnectedOpen(true);
      } else {
        toast({
          title: "Ошибка при отправке по WhatsApp",
          description: responseData.error ?? `HTTP ${res.status}`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Ошибка сети при отправке по WhatsApp", variant: "destructive" });
    } finally {
      setBundleSending(false);
    }
  }, [toast]);

  const handleSaveDiagnosis = useCallback(async () => {
    if (!selectedPatientId) return;

    // Capture extraction status BEFORE clearing the service maps
    const hasExtractionSelected = Array.from(diagnosisServicesMap.values())
      .flat()
      .some((s) => isExtractionItem(s.name));

    // 1. Save tooth conditions
    const allFdis = new Set([...diagnosisMap.keys(), ...diagnosisNotesMap.keys()]);
    await Promise.all(
      Array.from(allFdis).map((fdi) => {
        const condition = diagnosisMap.get(fdi) ?? teethMap.get(fdi)?.condition ?? "healthy";
        const notes = diagnosisNotesMap.get(fdi) ?? undefined;
        return updateToothMutation.mutateAsync({
          id: selectedPatientId,
          toothFdi: fdi,
          data: {
            condition,
            ...(notes !== undefined ? { notes } : {}),
          },
        });
      }),
    );

    // 2. If services were selected per tooth during diagnosis → add to existing plan or create new one
    if (diagnosisServicesMap.size > 0) {
      const items: Array<{ toothFdi: number; condition: string; title: string; price: number }> = [];
      for (const [fdi, services] of diagnosisServicesMap.entries()) {
        // Skip teeth that are already completed in the active plan — don't re-bill
        const alreadyCompleted = activePlan?.items.some(
          (item) => item.toothFdi === fdi && item.status === "completed",
        ) ?? false;
        if (alreadyCompleted) continue;

        const condition = diagnosisMap.get(fdi) ?? teethMap.get(fdi)?.condition ?? "healthy";
        for (const svc of services) {
          items.push({
            toothFdi: fdi,
            condition: condition as string,
            title: svc.name,
            price: svc.defaultPrice ?? 0,
          });
        }
      }
      if (items.length > 0) {
        if (activePlan) {
          // Re-diagnosis: add new items to the existing active plan (draft or approved)
          await Promise.all(
            items.map((item) =>
              addPlanItemMutation.mutateAsync({
                id: selectedPatientId,
                planId: activePlan.id,
                data: { title: item.title, price: item.price, toothFdi: item.toothFdi },
              }),
            ),
          );
        } else {
          // No active plan yet — create a brand-new one
          await createPlanMutation.mutateAsync({ id: selectedPatientId, data: { items } });
        }
      }
    }

    // 3. Trigger a single fresh AI analysis now that ALL teeth are persisted.
    //    Fire-and-forget — we don't need to wait for the AI result here.
    void triggerAnalysisMutation.mutateAsync(selectedPatientId);

    await refetchTeeth();
    setDiagnosisMap(new Map());
    setDiagnosisNotesMap(new Map());
    setDiagnosisToothFdi(null);
    setDiagnosisServicesMap(new Map());
    setPickerCategory(null);
    setIsDiagnosisMode(false);
    setShowSummaryModal(false);
    setPlanViewToothFdi(null);
    toast({ title: t("patient.diagnosisSaved") });

    // Remove the stale cache entirely so the panel re-enters the "polling" state
    queryClient.removeQueries({ queryKey: getDentalAiAnalysisQueryKey(selectedPatientId) });

    if (hasExtractionSelected) {
      // Extraction requires signed contracts — show blocking modal before proceeding to plan
      setBundleToken(null);
      setBundleUrl(null);
      setBundleSent(false);
      setBundleRequiredModalOpen(true);
      void handlePrepareBundle(selectedPatientId);
    } else {
      setActiveTab("treatment");
      setTreatmentStep(2);
    }
  }, [selectedPatientId, diagnosisMap, diagnosisNotesMap, diagnosisServicesMap, teethMap, activePlan, updateToothMutation, triggerAnalysisMutation, createPlanMutation, addPlanItemMutation, refetchTeeth, toast, t, queryClient, setActiveTab, handlePrepareBundle]);

  const diagnosisSummaryEntries = useMemo((): DiagnosisSummaryEntry[] => {
    // Only show teeth being actively diagnosed in this session (diagnosisMap).
    // Old teeth from teethMap are NOT re-billed — they stay as historical data.
    const entries: DiagnosisSummaryEntry[] = [];
    for (const [fdi, condition] of diagnosisMap.entries()) {
      const priceEntry = conditionPricesMap[condition];
      const mkb10 = priceEntry?.mkb10 ?? "";
      // Treated teeth are informational only — no charge
      if (condition === "treated") {
        entries.push({ fdi, condition, price: 0, mkb10 });
        continue;
      }
      // If doctor picked specific services for this tooth — use their total price.
      // Otherwise fall back to the condition-level price from the price table.
      const services = diagnosisServicesMap.get(fdi);
      const price = services && services.length > 0
        ? services.reduce((s, svc) => s + (svc.defaultPrice ?? 0), 0)
        : (priceEntry?.price ?? 0);
      entries.push({ fdi, condition, price, mkb10 });
    }
    return entries.sort((a, b) => a.fdi - b.fdi);
  }, [diagnosisMap, conditionPricesMap, diagnosisServicesMap]);

  const diagnosisTotalCost = useMemo(() => {
    let total = 0;
    for (const services of diagnosisServicesMap.values()) {
      for (const svc of services) {
        total += svc.defaultPrice ?? 0;
      }
    }
    return total;
  }, [diagnosisServicesMap]);

  const financials = useMemo(() => {
    const total = patientProcedures.reduce((s, p) => s + (p.price ?? 0), 0);
    const paid  = patientProcedures
      .filter((p) => p.status === "completed")
      .reduce((s, p) => s + (p.price ?? 0), 0);
    const methodCounts: Record<string, { count: number; sum: number }> = {};
    for (const p of patientProcedures) {
      const m = (p as any).paymentMethod ?? "unknown";
      if (!methodCounts[m]) methodCounts[m] = { count: 0, sum: 0 };
      methodCounts[m]!.count++;
      methodCounts[m]!.sum += p.price ?? 0;
    }
    return { total, paid, methodCounts };
  }, [patientProcedures]);

  const hasExtractionInPlan = useMemo(() => {
    if (!activePlan) return false;
    return activePlan.items.some((item) => isExtractionItem(item.title));
  }, [activePlan]);

  if (!selectedPatientId) return null;

  const patient = data?.data?.patient;
  const interactions = data?.data?.interactions ?? [];

  const handleStatusChange = (status: PatientStatus) => {
    if (!selectedPatientId) return;
    statusMutation.mutate({ id: selectedPatientId, data: { status } });
  };

  const handleAddInteraction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !interactionContent.trim()) return;
    interactionMutation.mutate({
      id: selectedPatientId,
      data: { type: interactionType, content: interactionContent.trim() },
    });
  };

  const canChangeStatus =
    user?.role === "owner" || user?.role === "admin";
  const isDoctor = user?.role === "doctor";

  const currentColumn = patient ? KANBAN_COLUMNS.find((c) => c.id === patient.status) : null;
  const sourceLabel = patient ? (SOURCE_LABELS[patient.source] ?? patient.source) : "";
  const sourceColor = patient ? (SOURCE_COLORS[patient.source] ?? "bg-slate-100 text-slate-600") : "";

  const tabs = [
    { id: "info"      as const, label: "Информация" },
    { id: "treatment" as const, label: "Лечение" },
  ];

  const doctorUser = patient?.doctorId ? allUsers.find((u) => u.id === patient.doctorId) : null;

  const PAYMENT_LABELS: Record<string, string> = {
    cash: "Наличные", kaspi_qr: "Kaspi QR",
    kaspi_transfer: "Kaspi перевод", kaspi_red: "Kaspi Рассрочка",
    terminal: "Терминал", debt: "Долг", unknown: "Не указан",
  };
  const STATUS_LABELS: Record<string, string> = {
    scheduled: "Запланирована", in_progress: "В процессе",
    completed: "Завершена", cancelled: "Отменена",
  };
  const STATUS_COLORS: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };

  const diagnosisDisplayMap: Map<number, ToothRecord> = new Map(teethMap);
  for (const [fdi, condition] of diagnosisMap.entries()) {
    const existing = teethMap.get(fdi);
    if (existing) {
      diagnosisDisplayMap.set(fdi, { ...existing, condition });
    } else {
      diagnosisDisplayMap.set(fdi, {
        id: `temp-${fdi}`,
        clinicId: "",
        patientId: selectedPatientId,
        toothFdi: fdi,
        condition,
        notes: null,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => { setSelectedPatientId(null); setActiveTab("info"); setTreatmentStep(1); }}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="font-bold text-lg">{t("patient.card")}</h2>
          <button
            onClick={() => {
              setSelectedPatientId(null);
              setSelectedToothFdi(null);
              setActiveTab("info");
              setIsDiagnosisMode(false);
              setDiagnosisMap(new Map());
              setDiagnosisNotesMap(new Map());
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border/50 px-6 bg-white shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedToothFdi(null); }}
              className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!contentReady || isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : patient ? (
          <>
            {/* Info Tab (includes interactions history) */}
            {activeTab === "info" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-6 py-5 space-y-5">
                  {/* Header */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Зарегистрирован: {new Date(patient.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>

                  {/* Contact info */}
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Контакты</p>
                    <a
                      href={`tel:${patient.phone}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-mono text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">
                        {patient.phone}
                      </span>
                    </a>
                    {patient.dateOfBirth && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-700">
                            {calculateAge(patient.dateOfBirth)} лет · {formatDateOfBirth(patient.dateOfBirth)}
                            {patient.gender && (
                              <span className="ml-1 text-xs text-gray-500">
                                ({patient.gender === "male" ? "муж." : patient.gender === "female" ? "жен." : "другой"})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {!patient.dateOfBirth && patient.gender && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-400" />
                        </div>
                        <span className="text-sm text-gray-700">
                          {patient.gender === "male" ? "Мужской" : patient.gender === "female" ? "Женский" : "Другой"}
                        </span>
                      </div>
                    )}
                    {patient.iin && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <IdCard className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">ИИН</p>
                          <p className="text-sm font-mono text-gray-700">{maskIIN(patient.iin)}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Источник</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceColor}`}>
                          {sourceLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Doctor */}
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Лечащий врач</p>
                    {doctorUser ? (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                          {doctorUser.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{doctorUser.name}</p>
                          <p className="text-xs text-gray-400">{doctorUser.email}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                          <Stethoscope className="w-4 h-4 text-gray-300" />
                        </div>
                        <p className="text-sm text-gray-400 italic">Врач не назначен</p>
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  {canChangeStatus && (
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Статус лечения</p>
                      <div className="relative">
                        <button
                          onClick={() => setIsStatusOpen(!isStatusOpen)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-white transition-colors bg-white"
                        >
                          <span>{currentColumn?.label ?? patient.status}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isStatusOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden">
                            {KANBAN_COLUMNS.map((col) => (
                              <button
                                key={col.id}
                                onClick={() => handleStatusChange(col.id)}
                                disabled={statusMutation.isPending}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${patient.status === col.id ? "font-semibold text-primary bg-primary/5" : ""}`}
                              >
                                {col.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {patient.notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Примечания</p>
                      <p className="text-sm text-amber-900 leading-relaxed">{patient.notes}</p>
                    </div>
                  )}

                  {/* Financial summary — hidden for doctors */}
                  {!isDoctor && (
                    <div className="space-y-3">
                      <button
                        onClick={() => setFinancialCollapsed((v) => !v)}
                        className="w-full flex items-center justify-between group"
                      >
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Финансы
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${financialCollapsed ? "" : "rotate-180"}`} />
                      </button>

                      {!financialCollapsed && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-primary/5 rounded-2xl p-3.5 text-center">
                              <p className="text-xl font-bold text-primary">
                                {financials.paid.toLocaleString("ru-RU")} ₸
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">Оплачено</p>
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-3.5 text-center">
                              <p className="text-xl font-bold text-gray-700">
                                {patientProcedures.length}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">Процедур</p>
                            </div>
                          </div>

                          {Object.keys(financials.methodCounts).length > 0 && (
                            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                              <p className="text-xs font-semibold text-gray-500 mb-1">Способы оплаты</p>
                              {Object.entries(financials.methodCounts).map(([method, data]) => (
                                <div key={method} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-gray-600">{PAYMENT_LABELS[method] ?? method}</span>
                                    <span className="text-xs text-gray-400">×{data.count}</span>
                                  </div>
                                  <span className="font-semibold text-gray-800">
                                    {data.sum.toLocaleString("ru-RU")} ₸
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Procedures list — hidden for doctors */}
                  {!isDoctor && patientProcedures.length > 0 && (
                    <div className="space-y-3">
                      <button
                        onClick={() => setProceduresCollapsed((v) => !v)}
                        className="w-full flex items-center justify-between group"
                      >
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          История процедур ({patientProcedures.length})
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${proceduresCollapsed ? "" : "rotate-180"}`} />
                      </button>

                      {!proceduresCollapsed && (
                        <div className="space-y-2">
                          {[...patientProcedures]
                            .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
                            .slice(0, 10)
                            .map((proc) => {
                              const docName = proc.doctorId
                                ? (allUsers.find((u) => u.id === proc.doctorId)?.name ?? "—")
                                : "—";
                              const payLabel = PAYMENT_LABELS[(proc as any).paymentMethod ?? ""] ?? "—";
                              return (
                                <div key={proc.id} className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800 flex-1 leading-tight">{proc.name}</p>
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[proc.status ?? "scheduled"]}`}>
                                      {STATUS_LABELS[proc.status ?? "scheduled"]}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                                    {proc.scheduledAt && (
                                      <span>{new Date(proc.scheduledAt).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                    )}
                                    {proc.doctorId && <span>👨‍⚕️ {docName}</span>}
                                    {(proc as any).paymentMethod && <span>💳 {payLabel}</span>}
                                    {proc.price != null && proc.price > 0 && (
                                      <span className="font-semibold text-gray-700">{proc.price.toLocaleString("ru-RU")} ₸</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
              </div>
            )}

            {/* ── Treatment Tab: Карта зубов → Планы лечения → Договоры ── */}
            {activeTab === "treatment" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-0 px-3 py-2 border-b border-border/30 bg-white shrink-0">
                  {([
                    { id: 1 as const, label: "Карта зубов" },
                    { id: 2 as const, label: "Планы лечения" },
                    { id: 3 as const, label: "Договоры" },
                  ] as const).map((step, idx) => (
                    <div key={step.id} className="flex items-center">
                      <button
                        onClick={() => {
                          setTreatmentStep(step.id);
                          if (step.id === 2 && activePlan) {
                            setPlanDetailId(activePlan.id);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${treatmentStep === step.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-slate-100"}`}
                      >
                        <span className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${treatmentStep === step.id ? "bg-primary text-white" : "bg-slate-200 text-slate-500"}`}>{step.id}</span>
                        {step.label}
                      </button>
                      {idx < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 mx-0.5 shrink-0" />}
                    </div>
                  ))}
                </div>

                {/* ── Step 1: Карта зубов ── */}
                {treatmentStep === 1 && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div ref={dentalScrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-3 pb-6">
                    {/* Loading skeleton — wait for teeth + plans before rendering any state */}
                    {dentalLoading && !isDiagnosisMode && (
                      <div className="space-y-3 animate-pulse">
                        <div className="h-4 w-32 bg-slate-100 rounded" />
                        <div className="h-36 bg-slate-100 rounded-2xl" />
                        <div className="h-36 bg-slate-100 rounded-2xl" />
                      </div>
                    )}
                    {/* Diagnosis mode (primary — no teeth yet, or manual re-diagnosis) */}
                    {!isAdmin && (isDiagnosisMode || (!dentalLoading && !hasDiagnosis)) && (
                      <div className="space-y-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <p className="text-xs text-amber-800 font-medium">
                            {t("patient.diagnosisMode")}
                          </p>
                        </div>

                        <FdiChart
                          teethData={diagnosisDisplayMap}
                          selectedFdi={diagnosisToothFdi}
                          inProgressFdi={activeTreatmentFdi}
                          onToothClick={(fdi) => {
                            setPickerSearch("");
                            if (fdi === diagnosisToothFdi) {
                              // Deselect tooth
                              setDiagnosisToothFdi(null);
                              setPickerCategory(null);
                            } else {
                              setDiagnosisToothFdi(fdi);
                              // If this tooth already has a condition, auto-open its service category
                              const existingCond = diagnosisMap.get(fdi);
                              const autoCategory = existingCond
                                ? (CONDITION_TO_PICKER_CATEGORY[existingCond] ?? null)
                                : null;
                              setPickerCategory(autoCategory);
                            }
                          }}
                        />

                        {diagnosisToothFdi !== null && (
                          <div className="bg-slate-50 rounded-xl p-3 border border-border/30 space-y-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              {t("tooth.title", { fdi: diagnosisToothFdi })} — {t("tooth.conditionLabel")}
                            </p>
                            {/* ── 2-level picker: conditions → services ── */}
                            {pickerCategory === null ? (
                              /* Level 1 — Condition (disease) selection */
                              <div className="space-y-2">
                                <p className="text-[11px] text-muted-foreground font-medium">Выберите диагноз зуба:</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {(Object.entries(CONDITION_CONFIG) as [ToothCondition, typeof CONDITION_CONFIG[ToothCondition]][]).map(([cond, cfg]) => {
                                    const currentCondition = diagnosisMap.get(diagnosisToothFdi!) ?? teethMap.get(diagnosisToothFdi!)?.condition ?? "healthy";
                                    const isSelected = currentCondition === cond;
                                    return (
                                      <button
                                        key={cond}
                                        onClick={() => {
                                          const cm = new Map(diagnosisMap);
                                          cm.set(diagnosisToothFdi!, cond);
                                          setDiagnosisMap(cm);
                                          const autoCategory = CONDITION_TO_PICKER_CATEGORY[cond] ?? null;
                                          setPickerCategory(autoCategory);
                                          setPickerSearch("");
                                        }}
                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                          isSelected
                                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                            : "border-border hover:border-primary/40 hover:bg-slate-50"
                                        }`}
                                      >
                                        <span
                                          className="w-3 h-3 rounded border shrink-0"
                                          style={{ background: cfg.crownFill, borderColor: cfg.stroke }}
                                        />
                                        <span className="font-medium text-foreground leading-tight">{cfg.label}</span>
                                        {isSelected && <span className="ml-auto text-primary">✓</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              /* Level 2 — Service list for selected condition */
                              <div ref={servicePickerRef} className="space-y-1.5">
                                <button
                                  onClick={() => { setPickerCategory(null); setPickerSearch(""); }}
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                  <span>Назад к диагнозу</span>
                                </button>
                                {/* Condition label */}
                                {(() => {
                                  const cond = diagnosisToothFdi ? diagnosisMap.get(diagnosisToothFdi) : undefined;
                                  if (!cond || !CONDITION_CONFIG[cond as ToothCondition]) return null;
                                  const cfg = CONDITION_CONFIG[cond as ToothCondition];
                                  const canalCount = getCanalCount(diagnosisToothFdi!);
                                  const canalLabel = cond === "root_canal"
                                    ? canalCount === 1 ? "· 1 канал"
                                      : canalCount === 2 ? "· 2 канала"
                                      : "· 3 канала"
                                    : null;
                                  return (
                                    <div className="flex items-center gap-1.5 px-1 flex-wrap">
                                      <span className="w-2.5 h-2.5 rounded border shrink-0" style={{ background: cfg.crownFill, borderColor: cfg.stroke }} />
                                      <span className="text-[11px] text-muted-foreground">
                                        Услуги для: <span className="font-semibold text-foreground">{cfg.label}</span>
                                        {canalLabel && (
                                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium text-[10px]">
                                            {canalLabel}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })()}
                                {/* Search input */}
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                  <input
                                    type="text"
                                    value={pickerSearch}
                                    onChange={(e) => setPickerSearch(e.target.value)}
                                    placeholder="Поиск услуги..."
                                    className="w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                                  />
                                  {pickerSearch && (
                                    <button
                                      onClick={() => setPickerSearch("")}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {pickerLoading ? (
                                  <div className="flex items-center justify-center py-5">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                  </div>
                                ) : pickerTemplates.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">Нет услуг в этой категории</p>
                                ) : filteredPickerTemplates.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">
                                    Ничего не найдено по «{pickerSearch}»
                                  </p>
                                ) : (
                                  filteredPickerTemplates.map((svc) => {
                                    const toothServices = diagnosisServicesMap.get(diagnosisToothFdi) ?? [];
                                    const isChecked = toothServices.some((s) => s.id === svc.id);
                                    return (
                                      <button
                                        key={svc.id}
                                        onClick={() => {
                                          const prev = diagnosisServicesMap.get(diagnosisToothFdi) ?? [];
                                          const next = new Map(diagnosisServicesMap);
                                          if (isChecked) {
                                            next.set(diagnosisToothFdi, prev.filter((s) => s.id !== svc.id));
                                          } else {
                                            next.set(diagnosisToothFdi, [...prev, svc]);
                                          }
                                          setDiagnosisServicesMap(next);
                                        }}
                                        className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                                          isChecked
                                            ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                                            : "border-border hover:border-primary/40 hover:bg-slate-50"
                                        }`}
                                      >
                                        <span className="mt-0.5 shrink-0">
                                          {isChecked
                                            ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                            : <Square className="w-3.5 h-3.5 text-muted-foreground" />
                                          }
                                        </span>
                                        <span className="flex-1 min-w-0">
                                          <span className="block font-medium text-foreground leading-snug">
                                            {svc.code ? <span className="text-muted-foreground mr-1 font-mono">{svc.code}</span> : null}
                                            {svc.name}
                                          </span>
                                          <span className="block mt-0.5 text-primary font-semibold">
                                            {svc.defaultPrice > 0 ? `${svc.defaultPrice.toLocaleString("ru-KZ")} ₸` : "Бесплатно"}
                                          </span>
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                            <div>
                              <label className="text-xs font-medium text-muted-foreground block mb-1">
                                {t("tooth.notesLabel")}
                              </label>
                              <textarea
                                rows={2}
                                className="w-full text-xs rounded-lg border border-border bg-white px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                placeholder={t("tooth.notesPlaceholder")}
                                value={diagnosisNotesMap.get(diagnosisToothFdi) ?? teethMap.get(diagnosisToothFdi)?.notes ?? ""}
                                onChange={(e) => {
                                  const next = new Map(diagnosisNotesMap);
                                  next.set(diagnosisToothFdi, e.target.value);
                                  setDiagnosisNotesMap(next);
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {diagnosisServicesMap.size > 0 && diagnosisTotalCost > 0 && (
                          <div className="bg-primary/8 border border-primary/20 rounded-xl px-3 py-2.5 flex items-center justify-between">
                            <span className="text-xs font-medium text-primary">Предварительная стоимость:</span>
                            <span className="text-sm font-bold text-primary">
                              {diagnosisTotalCost.toLocaleString("ru-RU")} ₸
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Normal mode — has diagnosis */}
                    {!dentalLoading && (hasDiagnosis || isAdmin) && !isDiagnosisMode && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            {isAdmin ? "Карта зубов (только чтение)" : t("patient.clickTooth")}
                          </p>
                          {!isAdmin && (
                            <button
                              onClick={() => setIsDiagnosisMode(true)}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/30 transition-colors whitespace-nowrap"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                <path d="M3 3v5h5"/>
                              </svg>
                              Повторная диагностика
                            </button>
                          )}
                        </div>
                        <FdiChart
                          teethData={teethMap}
                          selectedFdi={null}
                          inProgressFdi={activeTreatmentFdi}
                          disabledFdis={disabledTreatmentFdis}
                        />

                      </div>
                    )}

                  </div>

                </div>

              {/* ── Pinned bottom bar: diagnosis action buttons ── */}
              {(isDiagnosisMode || (!dentalLoading && !hasDiagnosis)) && (
                <div className="shrink-0 border-t border-border/30 bg-white/95 backdrop-blur-sm safe-area-bottom">
                  <div className="flex items-center justify-center gap-8 py-3 px-6">

                    {/* Отмена */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        onClick={() => {
                          setIsDiagnosisMode(false);
                          setDiagnosisMap(new Map());
                          setDiagnosisNotesMap(new Map());
                          setDiagnosisToothFdi(null);
                          setDiagnosisServicesMap(new Map());
                          setPickerCategory(null);
                        }}
                        className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:bg-slate-100 hover:border-slate-300 transition-colors"
                      >
                        <X className="w-6 h-6" />
                      </button>
                      <span className="text-[11px] text-muted-foreground">{t("tooth.cancel")}</span>
                    </div>

                    {/* Голосовая диагностика */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        onClick={() => setShowVoiceModal(true)}
                        className="w-14 h-14 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center text-primary hover:bg-primary/15 hover:border-primary/60 transition-colors"
                      >
                        <Mic className="w-6 h-6" />
                      </button>
                      <span className="text-[11px] text-muted-foreground">Голос</span>
                    </div>

                    {/* Завершить диагностику */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        disabled={updateToothMutation.isPending || (diagnosisMap.size === 0 && diagnosisNotesMap.size === 0)}
                        onClick={handleFinishDiagnosis}
                        className="w-14 h-14 rounded-full border-2 border-primary bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-6 h-6" />
                      </button>
                      <span className="text-[11px] text-muted-foreground">Завершить</span>
                    </div>

                  </div>
                </div>
              )}

              </div>
                )} {/* end treatmentStep === 1 */}

                {/* ── Step 2: Планы лечения ── */}
                {treatmentStep === 2 && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* State: loading */}
                {(planLoading || plansLoading) && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  </div>
                )}

                {/* State: no diagnosis yet */}
                {!planLoading && !plansLoading && !hasDiagnosis && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <ClipboardList className="w-7 h-7 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Зубная карта не заполнена</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        Сначала проведите осмотр зубов пациента на вкладке «Зубная карта»
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="gap-2 text-sm"
                      onClick={() => setTreatmentStep(1)}
                    >
                      Перейти к зубной карте
                    </Button>
                  </div>
                )}

                {/* State: has diagnosis — list view */}
                {!planLoading && !plansLoading && hasDiagnosis && planDetailId === null && (() => {
                  const apItems = activePlan?.items.filter((i) => i.status !== "cancelled") ?? [];
                  const apDone = apItems.filter((i) => i.status === "completed").length;
                  const apPct = apItems.length > 0 ? Math.round((apDone / apItems.length) * 100) : 0;
                  const apPaid = apItems.filter((i) => i.status === "completed").reduce((s, i) => s + i.price, 0);
                  return (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="px-6 py-5 space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Активный план</p>
                        {activePlan ? (
                          <button onClick={() => setPlanDetailId(activePlan.id)} className="w-full text-left bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                            <div className="h-1 bg-primary" />
                            <div className="px-4 py-4">
                              {/* Header */}
                              <div className="flex items-start justify-between mb-4">
                                <div>
                                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Активный план</p>
                                  <p className="text-[15px] font-bold text-gray-900">
                                    План #{String(activePlan.planNumber).padStart(4, "0")}
                                  </p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    Создан {new Date(activePlan.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "long", year: "numeric" })}
                                  </p>
                                </div>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${activePlan.status === "draft" ? "bg-slate-50 text-slate-600 border-slate-200" : activePlan.status === "approved" ? "bg-blue-50 text-blue-700 border-blue-200" : activePlan.status === "in_progress" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                  {activePlan.status === "draft" ? "Черновик" : activePlan.status === "approved" ? "Согласован" : activePlan.status === "in_progress" ? "В работе" : "Завершён"}
                                </span>
                              </div>

                              {/* Ring chart + amount */}
                              <div className="flex items-center gap-4 mb-4">
                                {(() => {
                                  const sz = 68; const r = (sz - 10) / 2; const circ = 2 * Math.PI * r;
                                  const offset = circ * (1 - apPct / 100);
                                  return (
                                    <svg width={sz} height={sz} className="shrink-0">
                                      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
                                      {apPct > 0 && <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                                        strokeDasharray={String(circ)} strokeDashoffset={String(offset)} strokeLinecap="round"
                                        transform={`rotate(-90 ${sz/2} ${sz/2})`} />}
                                      <text x={sz/2} y={sz/2 + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="hsl(var(--primary))">{apPct}%</text>
                                    </svg>
                                  );
                                })()}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] text-gray-400 mb-0.5">Итого по плану</p>
                                  <p className="text-[22px] font-bold text-gray-900 leading-none">{activePlan.totalCost.toLocaleString("ru-KZ")} ₸</p>
                                  <div className="mt-2 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /><span className="text-[11px] text-gray-500">Выполнено</span></div>
                                      <span className="text-[11px] font-semibold text-emerald-600">{apPaid.toLocaleString("ru-KZ")} ₸</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/30 shrink-0" /><span className="text-[11px] text-gray-500">Остаток</span></div>
                                      <span className="text-[11px] font-semibold text-gray-600">{(activePlan.totalCost - apPaid).toLocaleString("ru-KZ")} ₸</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Footer CTA */}
                              <div className="flex items-center justify-end pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-1 text-primary text-[12px] font-semibold">
                                  Открыть план <ChevronRight className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          </button>
                        ) : needsRediagnosis ? (
                          isAdmin ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                              <p className="text-xs text-muted-foreground">Планы лечения отсутствуют</p>
                            </div>
                          ) : (
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4 flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-800">Нужна повторная диагностика</p>
                                <p className="text-xs text-amber-600 mt-0.5">Для создания плана {allPlans.length + 1} проведите повторный осмотр</p>
                                <button onClick={() => { setPlanDetailId(null); setTreatmentStep(1); }} className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2">Перейти к зубной карте →</button>
                              </div>
                            </div>
                          )
                        ) : (
                          isAdmin ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                              <p className="text-xs text-muted-foreground">Планы лечения отсутствуют</p>
                            </div>
                          ) : (
                            <button className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors"
                              onClick={() => createPlanMutation.mutate({ id: selectedPatientId, data: {} })}
                              disabled={createPlanMutation.isPending}
                            >
                              {createPlanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              {pastPlans.length > 0 ? `Создать план ${allPlans.length + 1}` : "Составить план из диагностики"}
                            </button>
                          )
                        )}
                        {!isAdmin && activePlan && (activePlan.status === "completed" || activePlan.status === "in_progress") && !needsRediagnosis && (
                          <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors mt-2"
                            onClick={() => createPlanMutation.mutate({ id: selectedPatientId, data: {} })} disabled={createPlanMutation.isPending}
                          >
                            {createPlanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Создать план {allPlans.length + 1}
                          </button>
                        )}
                        <div className="h-4" />
                      </div>
                    </div>
                  );
                })()}

                {/* State: has diagnosis — detail view */}
                {!planLoading && !plansLoading && hasDiagnosis && planDetailId !== null && (() => {
                  const isActive = planDetailId === activePlan?.id;
                  const detailPlan = isActive ? activePlan : allPlans.find((p) => p.id === planDetailId) ?? null;
                  if (!detailPlan) return null;
                  const nc = detailPlan.items.filter((i) => i.status !== "cancelled");
                  const done = nc.filter((i) => i.status === "completed").length;
                  const pct = nc.length > 0 ? Math.round((done / nc.length) * 100) : 0;
                  const paid = nc.filter((i) => i.status === "completed").reduce((s, i) => s + i.price, 0);
                  const badge = isActive && activePlan
                    ? activePlan.status === "draft" ? { label: "Черновик", cls: "bg-slate-50 text-slate-600 border-slate-200" }
                      : activePlan.status === "approved" ? { label: "Согласован", cls: "bg-blue-50 text-blue-700 border-blue-200" }
                      : activePlan.status === "in_progress" ? { label: "В работе", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                      : { label: "Завершён", cls: "bg-green-50 text-green-700 border-green-200" }
                    : detailPlan.status === "completed"
                      ? { label: "Завершён", cls: "bg-green-50 text-green-700 border-green-200" }
                      : { label: "Отменён", cls: "bg-red-50 text-red-500 border-red-200" };
                  return (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="px-4 py-4 space-y-3">
                          {/* Financial summary card */}
                          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            <div className="h-0.5 bg-primary" />
                            <div className="px-4 py-4">
                              {/* Ring chart + totals */}
                              <div className="flex items-center gap-4 mb-4">
                                {(() => {
                                  const sz = 68; const r = (sz - 10) / 2; const circ = 2 * Math.PI * r;
                                  const offset = circ * (1 - pct / 100);
                                  return (
                                    <svg width={sz} height={sz} className="shrink-0">
                                      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
                                      {pct > 0 && <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                                        strokeDasharray={String(circ)} strokeDashoffset={String(offset)} strokeLinecap="round"
                                        transform={`rotate(-90 ${sz/2} ${sz/2})`} />}
                                      <text x={sz/2} y={sz/2 + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="hsl(var(--primary))">{pct}%</text>
                                    </svg>
                                  );
                                })()}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] text-gray-400 mb-0.5">Сумма плана</p>
                                  <p className="text-[22px] font-bold text-gray-900 leading-none">{detailPlan.totalCost.toLocaleString("ru-KZ")} ₸</p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">Оплачено {done} из {nc.length} услуг</p>
                                </div>
                              </div>
                              {/* Paid / Remaining rows */}
                              <div className="space-y-2 mb-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                                    <span className="text-[12px] text-gray-600">Выполнено</span>
                                  </div>
                                  <span className="text-[13px] font-bold text-emerald-600">{paid.toLocaleString("ru-KZ")} ₸</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-primary/30 shrink-0" />
                                    <span className="text-[12px] text-gray-600">Остаток к оплате</span>
                                  </div>
                                  <span className="text-[13px] font-bold text-gray-700">{(detailPlan.totalCost - paid).toLocaleString("ru-KZ")} ₸</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {!isAdmin && isActive && activePlan && (activePlan.status === "completed" || activePlan.status === "in_progress") && (
                            needsRediagnosis ? (
                              <Button variant="outline" className="w-full gap-2 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => { setPlanDetailId(null); setTreatmentStep(1); setIsDiagnosisMode(true); }}>
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                Повторная диагностика
                              </Button>
                            ) : (
                              <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                                onClick={() => createPlanMutation.mutate({ id: selectedPatientId, data: {} })} disabled={createPlanMutation.isPending}
                              ><Plus className="w-4 h-4" /> Следующий план</Button>
                            )
                          )}
                          {isActive && (
                            <TreatmentStagesBoard patientId={selectedPatientId} teeth={teethRecords} activePlan={activePlan} />
                          )}
                          {!isActive && (
                            <div className="space-y-2">
                              {nc.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Нет позиций</p>
                              ) : (
                                nc.map((item) => (
                                  <div
                                    key={item.id}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border shadow-sm ${
                                      item.status === "completed"
                                        ? "bg-emerald-50/60 border-emerald-100"
                                        : "bg-white border-gray-100"
                                    }`}
                                  >
                                    {item.status === "completed"
                                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                      : <Circle className="w-5 h-5 text-gray-200 shrink-0" />
                                    }
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-[13px] font-medium leading-snug truncate ${item.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>
                                        {item.title}
                                      </p>
                                      {item.toothFdi != null && (
                                        <p className="text-[11px] text-gray-400 mt-0.5">Зуб №{item.toothFdi}</p>
                                      )}
                                    </div>
                                    <span className={`text-[13px] font-semibold shrink-0 ${item.status === "completed" ? "text-emerald-600" : "text-gray-600"}`}>
                                      {item.price.toLocaleString("ru-KZ")} ₸
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>
                )} {/* end treatmentStep === 2 */}

                {/* ── Step 3: Договоры ── */}
                {treatmentStep === 3 && (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                    <Suspense fallback={<div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary/60" /></div>}>
                      <ContractsTab
                        patientId={selectedPatientId}
                        bundle={{
                          hasExtractionInPlan,
                          bundleToken,
                          bundleSent,
                          bundlePreparing,
                          bundleSending,
                          bundleUrl,
                          patientId: selectedPatientId,
                          onPrepare: () => { if (selectedPatientId) void handlePrepareBundle(selectedPatientId); },
                          onSend: (token) => void handleSendBundleWhatsapp(token),
                          onOpenPreview: () => setBundlePreviewOpen(true),
                        }}
                      />
                    </Suspense>

                    {/* WhatsApp not connected modal */}
                    {whatsappNotConnectedOpen && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setWhatsappNotConnectedOpen(false); }}
                      >
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                          <div className="p-6 text-center">
                            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                              <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.107 1.514 5.836L0 24l6.335-1.493A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.028-1.383l-.36-.214-3.732.979.997-3.645-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/>
                              </svg>
                            </div>
                            <h3 className="text-base font-bold text-gray-900 mb-1">WhatsApp не подключён</h3>
                            <p className="text-sm text-muted-foreground mb-5">
                              Чтобы отправить договоры пациенту, сначала подключите WhatsApp в настройках каналов.
                            </p>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => { setWhatsappNotConnectedOpen(false); setLocation("/channels"); }}
                                className="w-full h-10 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
                              >
                                Подключить WhatsApp
                              </button>
                              <button
                                onClick={() => setWhatsappNotConnectedOpen(false)}
                                className="w-full h-10 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
                              >
                                Закрыть
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bundle preview dialog */}
                    {bundlePreviewOpen && bundleToken && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setBundlePreviewOpen(false); }}
                      >
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Предпросмотр пакета договоров</p>
                              <p className="text-xs text-muted-foreground mt-0.5">4 документа · удаление зуба</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={bundleUrl ?? `/p/bundle/${bundleToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                              >
                                ↗ В новой вкладке
                              </a>
                              <button
                                onClick={() => setBundlePreviewOpen(false)}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-slate-100 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <iframe
                            src={`${bundleUrl ?? `/p/bundle/${bundleToken}`}?preview=1`}
                            className="flex-1 w-full border-0"
                            title="Пакет договоров"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )} {/* end treatmentStep === 3 */}

              </div>
            )} {/* end activeTab === "treatment" */}

          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {t("patient.loading")}
          </div>
        )}
      </div>


      {/* Voice diagnosis modal */}
      {showVoiceModal && selectedPatientId && (
        <VoiceDiagnosisModal
          patientId={selectedPatientId}
          activePlanId={activePlan?.id}
          onClose={() => setShowVoiceModal(false)}
          onApplied={() => {
            setShowVoiceModal(false);
          }}
        />
      )}

      {/* Diagnosis summary modal */}
      {showSummaryModal && patient && (
        <DiagnosisSummaryModal
          entries={diagnosisSummaryEntries}
          patientName={patient.name}
          onSave={handleSaveDiagnosis}
          onClose={() => setShowSummaryModal(false)}
          isSaving={updateToothMutation.isPending}
        />
      )}

      {/* Bundle required modal — blocks proceeding after extraction diagnosis until contracts are sent */}
      {bundleRequiredModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3 border border-amber-100">
                <ClipboardList className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-[15px] font-bold text-gray-900">Отправьте договоры пациенту</h3>
              <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">
                Перед началом лечения удаления зуба необходимо отправить пакет документов и получить согласие пациента.
              </p>
            </div>

            {/* Bundle card */}
            <div className="px-5 pb-4">
              <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50/50">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-100 bg-white">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-gray-900">Пакет договоров</p>
                    <p className="text-[10px] text-gray-400">Договор · ИДС · Вкладыш · Памятка</p>
                  </div>
                  {bundleSent && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </div>

                <div className="px-3.5 py-3">
                  {bundlePreparing && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Формируем документы…
                    </div>
                  )}

                  {!bundlePreparing && bundleToken && !bundleSent && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBundlePreviewOpen(true)}
                        className="flex-1 h-8 text-[12px] font-medium text-gray-700 border border-border rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Предпросмотр
                      </button>
                      <button
                        disabled={bundleSending}
                        onClick={() => bundleToken && void handleSendBundleWhatsapp(bundleToken)}
                        className="flex-1 h-8 text-[12px] font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {bundleSending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.107 1.514 5.836L0 24l6.335-1.493A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.028-1.383l-.36-.214-3.732.979.997-3.645-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                        )}
                        {bundleSending ? "Отправляем…" : "Отправить"}
                      </button>
                    </div>
                  )}

                  {!bundlePreparing && !bundleToken && !bundleSent && (
                    <p className="text-[12px] text-red-500">Не удалось сформировать документы. Попробуйте позже.</p>
                  )}

                  {bundleSent && (
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Отправлено пациенту по WhatsApp
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 space-y-2">
              <button
                disabled={!bundleSent}
                onClick={() => {
                  setBundleRequiredModalOpen(false);
                  setActiveTab("treatment");
                  setTreatmentStep(2);
                }}
                className={cn(
                  "w-full h-11 rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2",
                  bundleSent
                    ? "bg-primary text-white hover:bg-primary/90 shadow-sm"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed",
                )}
              >
                {bundleSent ? "Продолжить к плану лечения →" : "Сначала отправьте договоры"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
