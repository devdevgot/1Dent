import { useCallback } from "react";
import { useListPatients, getListPatientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, KanbanSquare, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { PatientDetailPanelGate } from "@/components/kanban/patient-detail-panel-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";

export default function KanbanPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";
  const queryClient = useQueryClient();
  const { isCreateOpen, setIsCreateOpen, setSelectedPatientId } = useKanbanStore();

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients = data?.data?.patients ?? [];
  const totalPatients = patients.length;

  const onSelectPatient = useCallback(
    (patientId: string) => setSelectedPatientId(patientId),
    [setSelectedPatientId],
  );

  return (
    <div className="flex flex-col h-full bg-[#faf8f4] font-manrope">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-[#e8e3d9] shadow-sm shrink-0">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f1ede4] active:bg-[#e8e3d9] transition-colors text-[#64748b] shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <KanbanSquare className="w-5 h-5 text-[#1f75fe] shrink-0" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-[#0f172a] flex-1 truncate">{t("nav.kanban")}</h1>
          <span className="text-xs text-[#64748b] shrink-0">{t("kanban.totalPatients", { count: totalPatients })}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
            className="w-8 h-8 text-[#64748b] hover:bg-[#f1ede4] hover:text-[#1f75fe] shrink-0 rounded-xl"
            title={t("kanban.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shrink-0 rounded-full bg-[#1f75fe] hover:bg-[#1a65e8] hover:scale-105 font-semibold">
            <Plus className="w-4 h-4" />
            {t("kanban.newPatient")}
          </Button>
        )}
      </div>
      <div className="flex flex-col flex-1 overflow-hidden gap-4 p-4">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#1f75fe]/20 border-t-[#1f75fe] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[#dc2626] text-sm">
            {t("kanban.loadError")}
          </div>
        ) : (
          <KanbanBoard
            patients={patients}
            onSelectPatient={onSelectPatient}
            className="flex gap-3 overflow-x-auto pb-4 flex-1 items-start custom-scrollbar"
          />
        )}

        <ErrorBoundary>
          <PatientDetailPanelGate />
        </ErrorBoundary>

        {isCreateOpen && (
          <CreatePatientDialog
            onClose={() => setIsCreateOpen(false)}
            onExistingPatient={(patientId) => {
              setIsCreateOpen(false);
              setSelectedPatientId(patientId);
            }}
          />
        )}
      </div>
    </div>
  );
}
