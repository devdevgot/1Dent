import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
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
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCardOverlay } from "@/components/kanban/patient-card";
import { useNotifications } from "@/hooks/use-notifications";
import { usePatientFinancials } from "@/hooks/use-patient-financials";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import type { Patient, PatientStatus } from "@workspace/api-client-react";

interface KanbanBoardProps {
  patients?: Patient[];
  onSelectPatient: (patientId: string) => void;
  className?: string;
}

export const KanbanBoard = memo(function KanbanBoard({
  patients: patientsProp,
  onSelectPatient,
  className,
}: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [activeDragPatient, setActiveDragPatient] = useState<Patient | null>(null);
  const isDraggingRef = useRef(false);
  const patientsRef = useRef<Patient[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 10 },
    }),
  );

  const { data } = useListPatients({
    query: {
      queryKey: getListPatientsQueryKey(),
      enabled: patientsProp === undefined,
    },
  });

  const patients = patientsProp ?? data?.data?.patients ?? [];
  patientsRef.current = patients;

  const { data: notificationsData } = useNotifications();
  const { data: financials } = usePatientFinancials();

  const redAlertPatientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notificationsData?.data?.notifications ?? []) {
      if (n.type === "red_alert" && n.patientId && !n.read) {
        ids.add(n.patientId);
      }
    }
    return ids;
  }, [notificationsData]);

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      },
    },
  });

  const resolveOverColumn = useCallback((overId: string | number): PatientStatus | null => {
    const overIdStr = String(overId);
    const col = KANBAN_COLUMNS.find((c) => c.id === overIdStr);
    if (col) return col.id;
    const overPatient = patientsRef.current.find((p) => p.id === overIdStr);
    if (overPatient) return overPatient.status;
    return null;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    isDraggingRef.current = true;
    const patient = patientsRef.current.find((p) => p.id === event.active.id);
    setActiveDragPatient(patient ?? null);
  }, []);

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveDragPatient(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      isDraggingRef.current = false;
      setActiveDragPatient(null);

      if (!over) return;

      const draggedPatient = patientsRef.current.find((p) => p.id === active.id);
      if (!draggedPatient) return;

      const overColumnId = resolveOverColumn(over.id);
      if (!overColumnId || draggedPatient.status === overColumnId) return;

      queryClient.setQueryData(getListPatientsQueryKey(), (old: typeof data) => {
        if (!old?.data?.patients) return old;
        return {
          ...old,
          data: {
            ...old.data,
            patients: old.data.patients.map((p) =>
              p.id === draggedPatient.id ? { ...p, status: overColumnId as PatientStatus } : p,
            ),
          },
        };
      });

      statusMutation.mutate({
        id: draggedPatient.id,
        data: { status: overColumnId as PatientStatus },
      });
    },
    [queryClient, resolveOverColumn, statusMutation, data],
  );

  const patientsByColumnMap = useMemo(() => {
    const grouped = Object.fromEntries(
      KANBAN_COLUMNS.map((col) => [col.id, [] as Patient[]]),
    ) as Record<PatientStatus, Patient[]>;
    for (const patient of patients) {
      grouped[patient.status]?.push(patient);
    }
    return grouped;
  }, [patients]);

  const isDragging = activeDragPatient !== null;
  const showFinancials = !isDragging;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={className}>
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            colorClass={col.color}
            patients={patientsByColumnMap[col.id] ?? []}
            redAlertPatientIds={redAlertPatientIds}
            financials={showFinancials ? financials : undefined}
            onSelectPatient={onSelectPatient}
            isBoardDragging={isDragging}
          />
        ))}
      </div>

      <DragOverlay
        adjustScale={false}
        dropAnimation={{ duration: 160, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}
      >
        {activeDragPatient ? (
          <PatientCardOverlay
            patient={activeDragPatient}
            hasRedAlert={redAlertPatientIds.has(activeDragPatient.id)}
            fin={financials?.[activeDragPatient.id]}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
