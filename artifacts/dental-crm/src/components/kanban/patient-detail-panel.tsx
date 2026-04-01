import { useState, useCallback } from "react";
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
  getListPatientsQueryKey,
  getGetPatientQueryKey,
  getListTeethQueryKey,
  getListPatientTreatmentsQueryKey,
} from "@workspace/api-client-react";
import type { ToothRecord, ToothTreatment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown, CheckCircle2, Clock, ArrowUpRight } from "lucide-react";
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
import { FdiChart, CONDITION_CONFIG } from "@/components/dental-chart/fdi-chart";
import { useTranslation } from "react-i18next";

const INTERACTION_TYPE_KEYS = [
  { value: "note"        as const },
  { value: "call"        as const },
  { value: "whatsapp"   as const },
  { value: "appointment" as const },
];

type DiagnosisMap = Map<number, ToothCondition>;
type DiagnosisNotesMap = Map<number, string>;

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

  const [modalToothFdi, setModalToothFdi] = useState<number | null>(null);

  const { data, isLoading } = useGetPatient(selectedPatientId ?? "", {
    query: {
      queryKey: getGetPatientQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId,
    },
  });

  const { data: teethData, refetch: refetchTeeth } = useListTeeth(selectedPatientId ?? "", {
    query: {
      queryKey: getListTeethQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "dental",
    },
  });
  const teethRecords: ToothRecord[] = teethData?.data?.teeth ?? [];
  const hasDiagnosis = teethRecords.length > 0;
  const teethMap = new Map(teethRecords.map((t) => [t.toothFdi, t]));

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

  const handleFinishDiagnosis = useCallback(async () => {
    if (!selectedPatientId) return;
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
    await refetchTeeth();
    setDiagnosisMap(new Map());
    setDiagnosisNotesMap(new Map());
    setDiagnosisToothFdi(null);
    setIsDiagnosisMode(false);
    toast({ title: t("patient.diagnosisSaved") });
  }, [selectedPatientId, diagnosisMap, diagnosisNotesMap, teethMap, updateToothMutation, refetchTeeth, toast, t]);

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
    { id: "history" as const, label: t("patient.tabHistory") },
    { id: "dental"  as const, label: t("patient.tabDental") },
  ];

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
              setActiveTab("history");
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
            {/* Dental Chart Tab */}
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
                            setDiagnosisToothFdi(fdi === diagnosisToothFdi ? null : fdi);
                          }}
                        />

                        {diagnosisToothFdi !== null && (
                          <div className="bg-slate-50 rounded-xl p-3 border border-border/30 space-y-3">
                            <p className="text-xs font-semibold text-muted-foreground">
                              {t("tooth.title", { fdi: diagnosisToothFdi })} — {t("tooth.conditionLabel")}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(Object.entries(CONDITION_CONFIG) as [ToothCondition, typeof CONDITION_CONFIG[ToothCondition]][]).map(([cond, cfg]) => {
                                const current = diagnosisMap.get(diagnosisToothFdi) ?? teethMap.get(diagnosisToothFdi)?.condition ?? "healthy";
                                return (
                                  <button
                                    key={cond}
                                    onClick={() => {
                                      const next = new Map(diagnosisMap);
                                      next.set(diagnosisToothFdi, cond);
                                      setDiagnosisMap(next);
                                    }}
                                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left text-xs transition-all ${
                                      current === cond ? "ring-2 ring-primary ring-offset-1 border-transparent" : "border-border"
                                    }`}
                                    style={{
                                      background: current === cond ? cfg.crownFill : undefined,
                                      borderColor: current === cond ? cfg.stroke : undefined,
                                    }}
                                  >
                                    <span
                                      className="w-3 h-3 rounded-sm shrink-0 border"
                                      style={{ background: cfg.crownFill, borderColor: cfg.stroke }}
                                    />
                                    <span style={{ color: current === cond ? cfg.textColor : undefined }}>
                                      {t(`condition.${cond}`)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
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
                            {updateToothMutation.isPending ? t("tooth.saving") : t("patient.finishDiagnosis")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Normal mode — has diagnosis */}
                    {hasDiagnosis && !isDiagnosisMode && (
                      <div className="space-y-3">
                        <p className="text-[11px] text-muted-foreground">
                          {t("patient.clickTooth")}
                        </p>
                        <FdiChart
                          teethData={teethMap}
                          selectedFdi={selectedToothFdi}
                          onToothClick={(fdi) => {
                            setSelectedToothFdi(fdi);
                            setModalToothFdi(fdi);
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
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === "history" && (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{patient.name}</h3>
                    <p className="text-sm font-mono text-muted-foreground mt-0.5">{patient.phone}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {patient.age && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                        {t("patient.age", { age: patient.age })}
                      </span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sourceColor}`}>
                      {sourceLabel}
                    </span>
                  </div>

                  {patient.notes && (
                    <div className="bg-slate-50 rounded-xl p-3.5 text-sm text-muted-foreground">
                      {patient.notes}
                    </div>
                  )}

                  {canChangeStatus && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        {t("patient.statusLabel")}
                      </label>
                      <div className="relative">
                        <button
                          onClick={() => setIsStatusOpen(!isStatusOpen)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                          <span>{currentColumn?.label ?? patient.status}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isStatusOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl z-10 overflow-hidden">
                            {KANBAN_COLUMNS.map((col) => (
                              <button
                                key={col.id}
                                onClick={() => handleStatusChange(col.id)}
                                disabled={statusMutation.isPending}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                                  patient.status === col.id ? "font-semibold text-primary bg-primary/5" : ""
                                }`}
                              >
                                {col.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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

                <div className="px-6 py-5 border-t border-border/50 bg-slate-50/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t("patient.addRecord")}
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
                      rows={3}
                      required
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      placeholder={t("patient.interactionPlaceholder")}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={interactionMutation.isPending || !interactionContent.trim()}
                    >
                      {interactionMutation.isPending ? t("tooth.saving") : t("patient.addRecord")}
                    </Button>
                  </form>
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
    </>
  );
}
