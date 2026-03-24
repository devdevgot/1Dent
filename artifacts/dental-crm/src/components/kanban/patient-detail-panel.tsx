import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPatient,
  useListTeeth,
  useUpdatePatientStatus,
  useAddPatientInteraction,
  getListPatientsQueryKey,
  getGetPatientQueryKey,
  getListTeethQueryKey,
} from "@workspace/api-client-react";
import type { ToothRecord } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown } from "lucide-react";
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
import type { PatientStatus, InteractionType } from "@workspace/api-client-react";
import { FdiChart } from "@/components/dental-chart/fdi-chart";
import { useTranslation } from "react-i18next";

const INTERACTION_TYPE_KEYS = [
  { value: "note"        as const },
  { value: "call"        as const },
  { value: "whatsapp"   as const },
  { value: "appointment" as const },
];

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

  const { data, isLoading } = useGetPatient(selectedPatientId ?? "", {
    query: {
      queryKey: getGetPatientQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId,
    },
  });

  const { data: teethData } = useListTeeth(selectedPatientId ?? "", {
    query: {
      queryKey: getListTeethQueryKey(selectedPatientId ?? ""),
      enabled: !!selectedPatientId && activeTab === "dental",
    },
  });
  const teethRecords: ToothRecord[] = teethData?.data?.teeth ?? [];
  const teethMap = new Map(teethRecords.map((t) => [t.toothFdi, t]));

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(selectedPatientId ?? "") });
        // Refresh all doctor analytics dashboards when patient status changes
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && (
              key.includes('DoctorDetailedAnalyticsMe') || 
              key.includes('DoctorDetailedAnalytics')
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
    user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";

  const currentColumn = patient ? KANBAN_COLUMNS.find((c) => c.id === patient.status) : null;
  const sourceLabel = patient ? (SOURCE_LABELS[patient.source] ?? patient.source) : "";
  const sourceColor = patient ? (SOURCE_COLORS[patient.source] ?? "bg-slate-100 text-slate-600") : "";

  const tabs = [
    { id: "history" as const, label: t("patient.tabHistory") },
    { id: "dental"  as const, label: t("patient.tabDental") },
  ];

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
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {t("patient.clickTooth")}
                    </p>
                    <FdiChart
                      teethData={teethMap}
                      selectedFdi={selectedToothFdi}
                      onToothClick={(fdi) => {
                        setLocation(`/patients/${patient.id}/teeth/${fdi}`);
                      }}
                    />
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
    </>
  );
}
