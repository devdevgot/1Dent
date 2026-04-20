import { useState, useCallback, useMemo, type ComponentType } from "react";
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
  useListProcedures,
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
  getListPatientsQueryKey,
  getGetPatientQueryKey,
  getListTeethQueryKey,
  getListPatientTreatmentsQueryKey,
  getGetActiveTreatmentPlanQueryKey,
  getListTreatmentPlansQueryKey,
  getListProcedureTemplatesQueryKey,
} from "@workspace/api-client-react";
import type { ToothRecord, ToothTreatment, ProcedureTemplate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronDown, CheckCircle2, Clock, ArrowUpRight,
  Phone, User, Calendar, CreditCard, Stethoscope, TrendingUp, Copy, Save, IdCard,
  ClipboardList, Plus, BadgeCheck, Circle, ArrowLeft, Square, CheckSquare, Loader2,
  Scissors, Crown, Wrench, Baby, Sparkles, Activity, ScanLine, Paintbrush, Search,
} from "lucide-react";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  KANBAN_COLUMNS,
  INTERACTION_TYPE_ICONS,
  SOURCE_LABELS,
  SOURCE_COLORS,
} from "@/lib/patient-utils";
import type { PatientStatus, InteractionType, ToothCondition } from "@workspace/api-client-react";
import { FdiChart, CONDITION_CONFIG, getCanalCount } from "@/components/dental-chart/fdi-chart";
import { useTranslation } from "react-i18next";


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

function ToothActionModal({
  fdi,
  patientId,
  onClose,
  onNavigate,
}: {
  fdi: number;
  patientId: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const addMutation = useAddToothTreatment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPatientTreatmentsQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        toast({ title: t("tooth.taskCreated") });
        onClose();
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const handleAction = (type: "treatment" | "extraction") => {
    addMutation.mutate({
      id: patientId,
      toothFdi: fdi,
      data: {
        description: type === "treatment"
          ? t("tooth.startTreatment")
          : t("tooth.extractTooth"),
        type,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-72 p-5 border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">{t("tooth.actionModalTitle", { fdi })}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
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
          <Button
            className="w-full justify-start gap-2"
            variant="ghost"
            onClick={onNavigate}
          >
            <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            {t("tooth.viewDetails")}
          </Button>
        </div>
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedToothFdi, setSelectedToothFdi] = useState<number | null>(null);
  const [interactionType, setInteractionType] = useState<InteractionType>("note");
  const [interactionContent, setInteractionContent] = useState("");
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const [isDiagnosisMode, setIsDiagnosisMode] = useState(false);
  const [diagnosisMap, setDiagnosisMap] = useState<DiagnosisMap>(new Map());
  const [diagnosisNotesMap, setDiagnosisNotesMap] = useState<DiagnosisNotesMap>(new Map());
  const [diagnosisToothFdi, setDiagnosisToothFdi] = useState<number | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerShowAll, setPickerShowAll] = useState(false);
  const [diagnosisServicesMap, setDiagnosisServicesMap] = useState<Map<number, ProcedureTemplate[]>>(new Map());

  const [modalToothFdi, setModalToothFdi] = useState<number | null>(null);
  // Tracks which tooth is selected in the plan view (to filter plan items by tooth)
  const [planViewToothFdi, setPlanViewToothFdi] = useState<number | null>(null);

  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [planSectionCollapsed, setPlanSectionCollapsed] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const { data, isLoading } = useGetPatient(selectedPatientId ?? "", {
    query: {
      queryKey: getGetPatientQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId,
    },
  });

  const { data: proceduresData } = useListProcedures();
  const { data: usersData } = useListUsers();

  const allProcedures = useMemo(
    () => (proceduresData?.data?.procedures ?? []),
    [proceduresData],
  );
  const patientProcedures = useMemo(
    () => allProcedures.filter((p) => p.patientId === selectedPatientId),
    [allProcedures, selectedPatientId],
  );
  const allUsers = usersData?.data?.users ?? [];

  const { data: teethData, refetch: refetchTeeth } = useListTeeth(selectedPatientId ?? "", {
    query: {
      queryKey: getListTeethQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "dental",
    },
  });
  const teethRecords: ToothRecord[] = teethData?.data?.teeth ?? [];
  const hasDiagnosis = teethRecords.length > 0;
  const teethMap = new Map(teethRecords.map((t) => [t.toothFdi, t]));

  const { data: conditionPricesData } = useGetConditionPrices({
    query: { enabled: isDiagnosisMode || activeTab === "dental" },
  });
  const conditionPricesMap = conditionPricesData?.data?.prices ?? {};

  const { data: pickerTemplatesData, isLoading: pickerLoading } = useListProcedureTemplates(
    pickerCategory ? { category: pickerCategory } : undefined,
    {
      query: {
        queryKey: getListProcedureTemplatesQueryKey(pickerCategory ? { category: pickerCategory } : undefined),
        enabled: pickerCategory !== null && isDiagnosisMode,
        staleTime: 60_000,
      },
    },
  );
  const pickerTemplates: ProcedureTemplate[] = pickerTemplatesData?.data?.templates ?? [];

  const conditionFilteredTemplates = useMemo(() => {
    if (pickerShowAll || !diagnosisToothFdi) return pickerTemplates;
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
  }, [pickerTemplates, diagnosisToothFdi, diagnosisMap, pickerShowAll]);

  const filteredPickerTemplates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return conditionFilteredTemplates;
    return conditionFilteredTemplates.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q),
    );
  }, [conditionFilteredTemplates, pickerSearch]);

  const { data: planData } = useGetActiveTreatmentPlan(selectedPatientId ?? "", {
    query: {
      queryKey: getGetActiveTreatmentPlanQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "dental",
    },
  });
  const activePlan = planData?.data?.plan ?? null;

  const { data: plansHistoryData } = useListTreatmentPlans(selectedPatientId ?? "", {
    query: {
      queryKey: getListTreatmentPlansQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "dental",
    },
  });

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
      enabled: !!selectedPatientId && activeTab === "dental" && hasDiagnosis,
    },
  });
  const allTasks: ToothTreatment[] = tasksData?.data?.treatments ?? [];
  const activeTasks = allTasks.filter((t) => t.status === "in_progress");

  const updateToothMutation = useUpdateTooth({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeethQueryKey(selectedPatientId ?? "") });
      },
    },
  });

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

  const handleSaveDiagnosis = useCallback(async () => {
    if (!selectedPatientId) return;

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

    // 2. If services were selected per tooth during diagnosis → create treatment plan with those items
    if (diagnosisServicesMap.size > 0) {
      const items: Array<{ toothFdi: number; condition: string; title: string; price: number }> = [];
      for (const [fdi, services] of diagnosisServicesMap.entries()) {
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
        await createPlanMutation.mutateAsync({ id: selectedPatientId, data: { items } });
      }
    }

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
  }, [selectedPatientId, diagnosisMap, diagnosisNotesMap, diagnosisServicesMap, teethMap, updateToothMutation, createPlanMutation, refetchTeeth, toast, t]);

  const diagnosisSummaryEntries = useMemo((): DiagnosisSummaryEntry[] => {
    const allFdis = new Set([...diagnosisMap.keys(), ...teethMap.keys()]);
    const entries: DiagnosisSummaryEntry[] = [];
    for (const fdi of allFdis) {
      const condition = diagnosisMap.get(fdi) ?? teethMap.get(fdi)?.condition ?? "healthy";
      const priceEntry = conditionPricesMap[condition];
      const price = priceEntry?.price ?? 0;
      const mkb10 = priceEntry?.mkb10 ?? "";
      entries.push({ fdi, condition, price, mkb10 });
    }
    return entries.sort((a, b) => a.fdi - b.fdi);
  }, [diagnosisMap, teethMap, conditionPricesMap]);

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
    { id: "info"   as const, label: "Информация" },
    { id: "dental" as const, label: t("patient.tabDental") },
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
        onClick={() => setSelectedPatientId(null)}
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

        {isLoading ? (
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

                  {/* Financial summary */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Финансы
                    </p>

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
                  </div>

                  {/* Procedures list */}
                  {patientProcedures.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        История процедур ({patientProcedures.length})
                      </p>
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
                    </div>
                  )}

                  {/* Interaction history */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                      {t("patient.tabHistory")} ({interactions.length})
                    </label>
                    <div className="space-y-2.5">
                      {interactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">{t("patient.noInteractions")}</p>
                      ) : (
                        [...interactions]
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((interaction) => (
                            <div
                              key={interaction.id}
                              className="bg-slate-50 rounded-xl p-3.5 border border-border/30"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                  <span>{INTERACTION_TYPE_ICONS[interaction.type]}</span>
                                  <span>{t(`interaction.${interaction.type}`)}</span>
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(interaction.createdAt).toLocaleDateString(undefined, {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {interaction.content}
                              </p>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Add interaction (sticky footer) */}
              <div className="px-6 py-4 border-t border-border/50 bg-slate-50/50 shrink-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {isDoctor ? "+ Добавить заключение" : t("patient.addRecord")}
                </p>
                <form onSubmit={handleAddInteraction} className="space-y-3">
                  {!isDoctor && (
                    <select
                      value={interactionType}
                      onChange={(e) => setInteractionType(e.target.value as InteractionType)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                    >
                      {INTERACTION_TYPE_KEYS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(`interaction.${item.value}`)}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea
                    value={interactionContent}
                    onChange={(e) => setInteractionContent(e.target.value)}
                    rows={2}
                    required
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder={t("patient.interactionPlaceholder")}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={interactionMutation.isPending || !interactionContent.trim()}
                  >
                    {interactionMutation.isPending ? t("tooth.saving") : isDoctor ? "+ Добавить заключение" : t("patient.addRecord")}
                  </Button>
                </form>
              </div>
              </div>
            )}

            {/* Dental Chart + Treatment Plan Tab */}
            {activeTab === "dental" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-3">
                    {/* No diagnosis yet */}
                    {!hasDiagnosis && !isDiagnosisMode && (
                      <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <p className="text-sm text-muted-foreground text-center px-4">
                          {t("patient.noTeethData")}
                        </p>
                        <Button
                          onClick={() => setIsDiagnosisMode(true)}
                          className="gap-2"
                        >
                          {t("patient.startDiagnosis")}
                        </Button>
                      </div>
                    )}

                    {/* Diagnosis mode */}
                    {isDiagnosisMode && (
                      <div className="space-y-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <p className="text-xs text-amber-800 font-medium">
                            {t("patient.diagnosisMode")}
                          </p>
                        </div>

                        <FdiChart
                          teethData={diagnosisDisplayMap}
                          selectedFdi={diagnosisToothFdi}
                          onToothClick={(fdi) => {
                            setPickerCategory(null);
                            setPickerSearch("");
                            setPickerShowAll(false);
                            setDiagnosisToothFdi(fdi === diagnosisToothFdi ? null : fdi);
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
                                          if (autoCategory) {
                                            setPickerCategory(autoCategory);
                                            setPickerSearch("");
                                            setPickerShowAll(false);
                                          }
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
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => { setPickerCategory(null); setPickerSearch(""); setPickerShowAll(false); }}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Назад к диагнозу</span>
                                  </button>
                                  {/* Show-all toggle — only when keyword filter is active */}
                                  {(() => {
                                    const cond = diagnosisToothFdi ? diagnosisMap.get(diagnosisToothFdi) : undefined;
                                    const hasKeywords = cond && (CONDITION_SERVICE_KEYWORDS[cond]?.length ?? 0) > 0;
                                    if (!hasKeywords) return null;
                                    return (
                                      <button
                                        onClick={() => setPickerShowAll((v) => !v)}
                                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                                          pickerShowAll
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground hover:border-primary/40"
                                        }`}
                                      >
                                        {pickerShowAll ? "Только по диагнозу" : "Все услуги"}
                                      </button>
                                    );
                                  })()}
                                </div>
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
                                        {!pickerShowAll && <span className="text-muted-foreground/70"> · отфильтровано</span>}
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
                                    autoFocus
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

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setIsDiagnosisMode(false);
                              setDiagnosisMap(new Map());
                              setDiagnosisNotesMap(new Map());
                              setDiagnosisToothFdi(null);
                              setDiagnosisServicesMap(new Map());
                              setPickerCategory(null);
                            }}
                          >
                            {t("tooth.cancel")}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={updateToothMutation.isPending || (diagnosisMap.size === 0 && diagnosisNotesMap.size === 0)}
                            onClick={handleFinishDiagnosis}
                          >
                            {t("patient.finishDiagnosis")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Normal mode — has diagnosis */}
                    {hasDiagnosis && !isDiagnosisMode && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            {t("patient.clickTooth")}
                          </p>
                          <button
                            onClick={() => setIsDiagnosisMode(true)}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/30 transition-colors shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                            </svg>
                            Повторная диагностика
                          </button>
                        </div>
                        <FdiChart
                          teethData={teethMap}
                          selectedFdi={selectedToothFdi}
                          onToothClick={(fdi) => {
                            setSelectedToothFdi(fdi);
                            setModalToothFdi(fdi);
                            setPlanViewToothFdi(fdi);
                          }}
                        />

                        {/* Active treatment tasks */}
                        {activeTasks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              {t("patient.activeTasks")}
                            </p>
                            <div className="space-y-2">
                              {activeTasks.map((task) => (
                                <TreatmentTaskItem
                                  key={task.id}
                                  task={task}
                                  patientId={selectedPatientId}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {activeTasks.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">
                            {t("patient.noActiveTasks")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Treatment Plan section — below the dental chart */}
                  {!isDiagnosisMode && (
                    <div className="border-t border-border/50">
                      {/* Section label */}
                      <button
                        onClick={() => setPlanSectionCollapsed(!planSectionCollapsed)}
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 bg-gray-50/60 hover:bg-gray-100/60 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                            План лечения
                          </span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${planSectionCollapsed ? "-rotate-90" : ""}`} />
                      </button>

                      {!planSectionCollapsed && (
                      <>
                      {!activePlan ? (
                        <div className="flex flex-col items-center justify-center gap-4 px-6 py-8">
                          {/* State: no diagnosis at all */}
                          {!hasDiagnosis && (
                            <>
                              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <ClipboardList className="w-6 h-6 text-slate-400" />
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-gray-800 text-sm">Диагностика не проведена</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Сначала проведите осмотр зубов пациента
                                </p>
                              </div>
                              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left max-w-xs">
                                <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                <p className="text-xs text-amber-700 leading-relaxed">
                                  Чтобы составить план лечения, сначала перейдите на вкладку <span className="font-semibold">«Диагностика»</span> и проведите осмотр зубов
                                </p>
                              </div>
                            </>
                          )}

                          {/* State: has diagnosis but needs re-diagnosis before next plan */}
                          {hasDiagnosis && needsRediagnosis && (
                            <>
                              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                  <path d="M3 3v5h5"/>
                                </svg>
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-gray-800 text-sm">
                                  Нужна повторная диагностика
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Для создания Плана {allPlans.length + 1} проведите повторный осмотр
                                </p>
                              </div>
                              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left max-w-xs">
                                <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                <p className="text-xs text-amber-700 leading-relaxed">
                                  Для создания нового плана перейдите на вкладку <span className="font-semibold">«Диагностика»</span> и проведите повторный осмотр
                                </p>
                              </div>
                            </>
                          )}

                          {/* State: ready to create plan */}
                          {hasDiagnosis && !needsRediagnosis && (
                            <>
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                <ClipboardList className="w-6 h-6 text-primary" />
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-gray-800 text-sm">
                                  {pastPlans.length > 0
                                    ? `Создать План ${allPlans.length + 1}`
                                    : "Нет активного плана лечения"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {pastPlans.length > 0
                                    ? "Предыдущие планы сохранены в истории"
                                    : "Данные из диагностики добавятся автоматически"}
                                </p>
                              </div>
                              <Button
                                onClick={() => createPlanMutation.mutate({ id: selectedPatientId, data: {} })}
                                disabled={createPlanMutation.isPending}
                                className="gap-2"
                              >
                                <Plus className="w-4 h-4" />
                                {pastPlans.length > 0
                                  ? `Создать План ${allPlans.length + 1}`
                                  : "Составить план из диагностики"}
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Plan header */}
                          <div className="px-4 pt-3 pb-2 border-b border-border/40 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">
                            План {activePlan.planNumber}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            activePlan.status === "draft"
                              ? "bg-slate-50 text-slate-600 border-slate-200"
                              : activePlan.status === "approved"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : activePlan.status === "in_progress"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-green-50 text-green-700 border-green-200"
                          }`}>
                            {activePlan.status === "draft" ? "Черновик"
                              : activePlan.status === "approved" ? "Согласован"
                              : activePlan.status === "in_progress" ? "В работе"
                              : "Завершён"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {activePlan.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => approvePlanMutation.mutate({ id: selectedPatientId, planId: activePlan.id })}
                              disabled={approvePlanMutation.isPending}
                            >
                              <BadgeCheck className="w-3.5 h-3.5" />
                              Согласовать
                            </Button>
                          )}
                          {(activePlan.status === "completed" || activePlan.status === "in_progress") && (
                            needsRediagnosis ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={() => setIsDiagnosisMode(true)}
                                title="Нужна повторная диагностика"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                                </svg>
                                Повторная диагностика
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                                onClick={() => createPlanMutation.mutate({ id: selectedPatientId, data: {} })}
                                disabled={createPlanMutation.isPending}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Следующий план
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {activePlan.items.length} шаг{activePlan.items.length === 1 ? "" : activePlan.items.length < 5 ? "а" : "ов"}
                          {" · "}
                          {new Date(activePlan.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {activePlan.totalCost.toLocaleString("ru")} ₸
                        </span>
                      </div>
                    </div>

                          {/* Tooth filter bar */}
                          {planViewToothFdi !== null && (
                            <div className="px-3 pt-2 pb-0">
                              <div className="flex items-center justify-between bg-primary/8 border border-primary/20 rounded-lg px-3 py-1.5">
                                <span className="text-xs font-medium text-primary">
                                  🦷 Зуб #{planViewToothFdi} — план лечения
                                </span>
                                <button
                                  onClick={() => setPlanViewToothFdi(null)}
                                  className="text-xs text-primary hover:text-primary/70 font-medium transition-colors"
                                >
                                  Все зубы
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Items list */}
                          <div className="p-3 space-y-2">
                        {activePlan.items.filter(item =>
                          planViewToothFdi === null || item.toothFdi === planViewToothFdi
                        ).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            {planViewToothFdi !== null
                              ? `Нет позиций плана для зуба #${planViewToothFdi}`
                              : "Нет шагов. Добавьте первый шаг."}
                          </p>
                        )}
                        {activePlan.items.filter(item =>
                          planViewToothFdi === null || item.toothFdi === planViewToothFdi
                        ).map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border transition-colors ${
                              item.status === "completed"
                                ? "bg-green-50/60 border-green-200"
                                : item.status === "cancelled"
                                ? "bg-gray-50 border-gray-200 opacity-60"
                                : "bg-white border-border/50"
                            }`}
                          >
                            {editingItemId === item.id ? (
                              <div className="p-3 space-y-2">
                                <input
                                  type="text"
                                  value={editItemTitle}
                                  onChange={(e) => setEditItemTitle(e.target.value)}
                                  className="w-full text-sm border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                />
                                <input
                                  type="number"
                                  value={editItemPrice}
                                  onChange={(e) => setEditItemPrice(e.target.value)}
                                  min={0}
                                  className="w-full text-sm border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!editItemTitle.trim() || updateItemMutation.isPending}
                                    onClick={() => {
                                      updateItemMutation.mutate({
                                        id: selectedPatientId,
                                        planId: activePlan.id,
                                        itemId: item.id,
                                        data: { title: editItemTitle.trim(), price: parseFloat(editItemPrice) || 0 },
                                      });
                                    }}
                                  >
                                    Сохранить
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => setEditingItemId(null)}
                                  >
                                    Отмена
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2.5 p-3">
                                <button
                                  className="mt-0.5 shrink-0 disabled:cursor-not-allowed"
                                  disabled={item.status !== "pending" || completeItemMutation.isPending}
                                  onClick={() =>
                                    completeItemMutation.mutate({
                                      id: selectedPatientId,
                                      planId: activePlan.id,
                                      itemId: item.id,
                                    })
                                  }
                                  title={item.status === "pending" ? "Отметить как выполненный" : undefined}
                                >
                                  {item.status === "completed" ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-border hover:text-primary transition-colors" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium leading-tight ${item.status === "completed" ? "line-through text-muted-foreground" : "text-gray-800"}`}>
                                    {item.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.toothFdi && (
                                      <span className="text-xs text-muted-foreground">Зуб #{item.toothFdi}</span>
                                    )}
                                    {item.mkb10Code && (
                                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                        {item.mkb10Code}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-sm font-semibold text-gray-700 mr-1">
                                    {item.price.toLocaleString("ru")} ₸
                                  </span>
                                  {activePlan.status === "draft" && item.status === "pending" && (() => {
                                    const pendingItems = activePlan.items.filter((i) => i.status === "pending");
                                    const pendingIdx = pendingItems.indexOf(item);
                                    return (
                                      <>
                                        <button
                                          disabled={pendingIdx === 0 || updateItemMutation.isPending}
                                          onClick={() => {
                                            const above = pendingItems[pendingIdx - 1];
                                            if (!above) return;
                                            updateItemMutation.mutate({ id: selectedPatientId, planId: activePlan.id, itemId: item.id, data: { sortOrder: above.sortOrder } });
                                            updateItemMutation.mutate({ id: selectedPatientId, planId: activePlan.id, itemId: above.id, data: { sortOrder: item.sortOrder } });
                                          }}
                                          className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Переместить вверх"
                                        >
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                                        </button>
                                        <button
                                          disabled={pendingIdx === pendingItems.length - 1 || updateItemMutation.isPending}
                                          onClick={() => {
                                            const below = pendingItems[pendingIdx + 1];
                                            if (!below) return;
                                            updateItemMutation.mutate({ id: selectedPatientId, planId: activePlan.id, itemId: item.id, data: { sortOrder: below.sortOrder } });
                                            updateItemMutation.mutate({ id: selectedPatientId, planId: activePlan.id, itemId: below.id, data: { sortOrder: item.sortOrder } });
                                          }}
                                          className="p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Переместить вниз"
                                        >
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingItemId(item.id);
                                            setEditItemTitle(item.title);
                                            setEditItemPrice(String(item.price));
                                          }}
                                          className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
                                          title="Редактировать"
                                        >
                                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add item form — only allowed in draft status */}
                        {activePlan.status === "draft" && (
                          showAddItemForm ? (
                            <div className="border border-dashed border-primary/40 rounded-xl p-3 space-y-2 bg-primary/5">
                              <input
                                type="text"
                                placeholder="Название шага"
                                value={newItemTitle}
                                onChange={(e) => setNewItemTitle(e.target.value)}
                                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                              />
                              <input
                                type="number"
                                placeholder="Цена (₸)"
                                value={newItemPrice}
                                onChange={(e) => setNewItemPrice(e.target.value)}
                                min={0}
                                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={!newItemTitle.trim() || addPlanItemMutation.isPending}
                                  onClick={() => {
                                    const price = parseFloat(newItemPrice) || 0;
                                    addPlanItemMutation.mutate({
                                      id: selectedPatientId,
                                      planId: activePlan.id,
                                      data: { title: newItemTitle.trim(), price },
                                    });
                                  }}
                                >
                                  Добавить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => { setShowAddItemForm(false); setNewItemTitle(""); setNewItemPrice(""); }}
                                >
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowAddItemForm(true)}
                              className="w-full flex items-center gap-2 py-2 px-3 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Добавить шаг
                            </button>
                          )
                        )}
                      </div>
                      </>
                      )}

                      {/* Plan history — completed/cancelled plans */}
                {pastPlans.length > 0 && (
                  <div className="border-t border-border/40 shrink-0">
                    <button
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-gray-700 hover:bg-gray-50/60 transition-colors"
                    >
                      <span className="font-medium">История планов ({pastPlans.length})</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${historyExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {historyExpanded && (
                      <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {[...pastPlans].sort((a, b) => b.planNumber - a.planNumber).map((plan) => {
                          const isOpen = expandedPlanId === plan.id;
                          const doneCount = plan.items.filter((i) => i.status === "completed").length;
                          return (
                            <div key={plan.id} className="border-t border-border/30">
                              <button
                                onClick={() => setExpandedPlanId(isOpen ? null : plan.id)}
                                className="w-full px-4 py-2.5 hover:bg-gray-50/60 transition-colors text-left"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                                    <span className="text-xs font-bold text-gray-700">
                                      План {plan.planNumber}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                                      plan.status === "completed"
                                        ? "bg-green-50 text-green-700 border-green-200"
                                        : "bg-gray-100 text-gray-500 border-gray-200"
                                    }`}>
                                      {plan.status === "completed" ? "Завершён" : "Архив"}
                                    </span>
                                  </div>
                                  <span className="text-xs font-semibold text-gray-700">
                                    {plan.totalCost.toLocaleString("ru")} ₸
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                                  {doneCount}/{plan.items.length} шаг{plan.items.length === 1 ? "" : plan.items.length < 5 ? "а" : "ов"} выполнено
                                  {" · "}
                                  {new Date(plan.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" })}
                                </p>
                              </button>
                              {isOpen && (
                                <div className="pb-2 bg-gray-50/40">
                                  {plan.items.length === 0 ? (
                                    <p className="text-xs text-muted-foreground px-8 py-2">Нет шагов</p>
                                  ) : (
                                    plan.items.map((item) => (
                                      <div key={item.id} className="flex items-start gap-2.5 px-8 py-1.5">
                                        <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                          item.status === "completed"
                                            ? "bg-green-500 border-green-500"
                                            : item.status === "cancelled"
                                            ? "bg-gray-200 border-gray-300"
                                            : "border-gray-300 bg-white"
                                        }`}>
                                          {item.status === "completed" && (
                                            <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
                                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          )}
                                          {item.status === "cancelled" && (
                                            <svg className="w-2 h-2 text-gray-400" viewBox="0 0 12 12" fill="none">
                                              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                            </svg>
                                          )}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <p className={`text-xs leading-snug ${
                                            item.status === "completed"
                                              ? "text-gray-500 line-through"
                                              : item.status === "cancelled"
                                              ? "text-gray-400 line-through"
                                              : "text-gray-700"
                                          }`}>
                                            {item.title}
                                          </p>
                                          {(item.toothFdi || item.mkb10Code) && (
                                            <p className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                                              {item.toothFdi && <span>зуб #{item.toothFdi}</span>}
                                              {item.mkb10Code && <span className="font-mono">{item.mkb10Code}</span>}
                                            </p>
                                          )}
                                        </div>
                                        <span className="text-xs text-gray-500 shrink-0">{item.price.toLocaleString("ru")} ₸</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div>
                    )}
                      </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {t("patient.loading")}
          </div>
        )}
      </div>

      {/* Tooth action modal */}
      {modalToothFdi !== null && patient && (
        <ToothActionModal
          fdi={modalToothFdi}
          patientId={selectedPatientId}
          onClose={() => {
            setModalToothFdi(null);
            setSelectedToothFdi(null);
          }}
          onNavigate={() => {
            setModalToothFdi(null);
            setLocation(`/patients/${patient.id}/teeth/${modalToothFdi}`);
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
    </>
  );
}
