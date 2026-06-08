import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import {
  useListPatients,
  useUpdatePatientStatus,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, KanbanSquare, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCardOverlay } from "@/components/kanban/patient-card";
import { useNotifications } from "@/hooks/use-notifications";
import { usePatientFinancials } from "@/hooks/use-patient-financials";
import { PatientDetailPanel } from "@/components/kanban/patient-detail-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { useKanbanStore } from "@/hooks/use-kanban";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import type { Patient, PatientStatus } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";

export default function KanbanPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";
  const queryClient = useQueryClient();
  const { isCreateOpen, setIsCreateOpen, setSelectedPatientId } = useKanbanStore();
  const [activeDragPatient, setActiveDragPatient] = useState<Patient | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });
  const { data: notificationsData } = useNotifications();
  const { data: financials } = usePatientFinancials();

  const patients: Patient[] = data?.data?.patients ?? [];

  const redAlertPatientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notificationsData?.data?.notifications ?? []) {
      if (n.type === "red_alert" && n.patientId && !n.read) {
        ids.add(n.patientId);
      }
    }
    return ids;
  }, [notificationsData]);

  const onSelectPatient = useCallback(
    (patientId: string) => setSelectedPatientId(patientId),
    [setSelectedPatientId],
  );

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      },
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const patient = patients.find((p) => p.id === event.active.id);
    setActiveDragPatient(patient ?? null);
  };

  const resolveOverColumn = (overId: string | number): PatientStatus | null => {
    const overIdStr = String(overId);
    const col = KANBAN_COLUMNS.find((c) => c.id === overIdStr);
    if (col) return col.id;
    const overPatient = patients.find((p) => p.id === overIdStr);
    if (overPatient) return overPatient.status;
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragPatient(null);

    if (!over) return;

    const draggedPatient = patients.find((p) => p.id === active.id);
    if (!draggedPatient) return;

    const overColumnId = resolveOverColumn(over.id);

    if (overColumnId && draggedPatient.status !== overColumnId) {
      queryClient.setQueryData(getListPatientsQueryKey(), (old: typeof data) => {
        if (!old?.data?.patients) return old;
        return {
          ...old,
          data: {
            ...old.data,
            patients: old.data.patients.map((p) =>
              p.id === draggedPatient.id
                ? { ...p, status: overColumnId as PatientStatus }
                : p,
            ),
          },
        };
      });

      statusMutation.mutate({
        id: draggedPatient.id,
        data: { status: overColumnId as PatientStatus },
      });
    }
  };

  const patientsByColumnMap = useMemo(() => {
    const grouped = Object.fromEntries(
      KANBAN_COLUMNS.map((col) => [col.id, [] as Patient[]]),
    ) as Record<PatientStatus, Patient[]>;
    for (const patient of patients) {
      grouped[patient.status]?.push(patient);
    }
    return grouped;
  }, [patients]);

  const totalPatients = patients.length;

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100 shrink-0">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <KanbanSquare className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900 flex-1 truncate">{t("nav.kanban")}</h1>
          <span className="text-xs text-muted-foreground shrink-0">{t("kanban.totalPatients", { count: totalPatients })}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
            className="w-8 h-8 text-gray-500 shrink-0"
            title={t("kanban.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {t("kanban.newPatient")}
          </Button>
        )}
      </div>
      <div className="flex flex-col flex-1 overflow-hidden gap-4 p-4">

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-destructive text-sm">
          {t("kanban.loadError")}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragPatient(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1 items-start custom-scrollbar">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                colorClass={col.color}
                patients={patientsByColumnMap[col.id] ?? []}
                redAlertPatientIds={redAlertPatientIds}
                financials={financials}
                onSelectPatient={onSelectPatient}
              />
            ))}
          </div>

          <DragOverlay adjustScale={false}>
            {activeDragPatient ? (
              <PatientCardOverlay
                patient={activeDragPatient}
                hasRedAlert={redAlertPatientIds.has(activeDragPatient.id)}
                fin={financials?.[activeDragPatient.id]}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ErrorBoundary>
        <PatientDetailPanel />
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
