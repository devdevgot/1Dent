import { useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  useListPatients,
  useUpdatePatientStatus,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCard } from "@/components/kanban/patient-card";
import { PatientDetailPanel } from "@/components/kanban/patient-detail-panel";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { useKanbanStore } from "@/hooks/use-kanban";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import type { Patient, PatientStatus } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

export default function KanbanPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isCreateOpen, setIsCreateOpen } = useKanbanStore();
  const [activeDragPatient, setActiveDragPatient] = useState<Patient | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients: Patient[] = data?.data?.patients ?? [];

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

  const patientsByColumn = (columnId: PatientStatus) =>
    patients.filter((p) => p.status === columnId);

  const totalPatients = patients.length;

  return (
    <div className="flex flex-col h-[calc(100dvh-7.5rem)] gap-4 p-4">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {t("kanban.totalPatients", { count: totalPatients })}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
            className="w-8 h-8"
            title={t("kanban.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t("kanban.newPatient")}
        </Button>
      </div>

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
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1 items-start custom-scrollbar">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                colorClass={col.color}
                patients={patientsByColumn(col.id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDragPatient ? (
              <div className="rotate-2 opacity-90 pointer-events-none">
                <PatientCard patient={activeDragPatient} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <PatientDetailPanel />

      {isCreateOpen && <CreatePatientDialog onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}
