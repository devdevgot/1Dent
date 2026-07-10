import { useCallback } from "react";
import { useListPatients, getListPatientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { PatientDetailPanelGate } from "@/components/kanban/patient-detail-panel-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";

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
    <PageShell className="flex flex-col h-full overflow-hidden" animate={false}>
      <PageHeader
        title={t("nav.kanban")}
        subtitle={t("kanban.totalPatients", { count: totalPatients })}
        onBack={() => window.history.back()}
        icon={<KanbanSquare className="w-5 h-5" strokeWidth={1.8} />}
        right={
          <>
            <PageHeaderIconButton
              onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
              title={t("kanban.refresh")}
            >
              <RefreshCw className="w-4 h-4" />
            </PageHeaderIconButton>
            {canCreate && (
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shrink-0 rounded-full bg-[var(--ds-primary)] hover:opacity-90 font-semibold h-8 text-xs px-3">
                <Plus className="w-4 h-4" />
                {t("kanban.newPatient")}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-col flex-1 overflow-hidden gap-4 p-4">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[var(--ds-primary)]/20 border-t-[var(--ds-primary)] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[#dc2626] text-sm">
            {t("kanban.loadError")}
          </div>
        ) : (
          <KanbanBoard
            patients={patients}
            onSelectPatient={onSelectPatient}
            className="flex gap-3 overflow-x-auto pb-4 flex-1 items-stretch custom-scrollbar"
          />
        )}

        <ErrorBoundary>
          <PatientDetailPanelGate />
        </ErrorBoundary>

        <CreatePatientDialog
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onExistingPatient={(patientId) => {
            setIsCreateOpen(false);
            setSelectedPatientId(patientId);
          }}
        />
      </div>
    </PageShell>
  );
}
