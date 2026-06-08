import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  useListPatients,
  useUpdatePatientStatus,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCardOverlay } from "@/components/kanban/patient-card";
import { useNotifications } from "@/hooks/use-notifications";
import { usePatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
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
  const isDragging = activeDragPatient !== null;
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

  // Pause background polling while a card is being dragged so refetches don't
  // interrupt the gesture.
  const { data: notificationsData } = useNotifications({ paused: isDragging });
  const { data: progressMap } = usePatientTreatmentProgress({ paused: isDragging });

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

  // Prefer the column the pointer is actually inside. This keeps the "over"
  // target (and the column highlight) stable instead of flickering between
  // neighbouring columns the way distance-based detection does, which is what
  // made the columns appear to shake while dragging. Fall back to corner
  // distance only when the pointer isn't over any column (e.g. fast flicks).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCorners(args);
  }, []);

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

  // Freeze the data the columns render from while a drag is in progress. This
  // keeps the props passed to columns/cards referentially stable for the whole
  // gesture, so any background update (notifications, treatment progress, list
  // refetch) that lands mid-drag cannot trigger a re-render of the cards and
  // cause the dragged card to stutter or freeze.
  const renderSnapshotRef = useRef({
    columns: patientsByColumnMap,
    redAlert: redAlertPatientIds,
    progress: progressMap,
  });
  if (!isDragging) {
    renderSnapshotRef.current = {
      columns: patientsByColumnMap,
      redAlert: redAlertPatientIds,
      progress: progressMap,
    };
  }
  const renderColumns = isDragging ? renderSnapshotRef.current.columns : patientsByColumnMap;
  const renderRedAlert = isDragging ? renderSnapshotRef.current.redAlert : redAlertPatientIds;
  const renderProgress = isDragging ? renderSnapshotRef.current.progress : progressMap;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ threshold: { x: 0.2, y: 0.2 }, acceleration: 18 }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Scroll-snap is disabled while dragging: otherwise the browser keeps
          snapping the board back to a column mid-gesture, which fights dnd-kit's
          auto-scroll and makes the board shake and refuse to move left/right. */}
      <div className={cn(className, !isDragging && "snap-x snap-mandatory sm:snap-none")}>
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            colorClass={col.color}
            patients={renderColumns[col.id] ?? []}
            redAlertPatientIds={renderRedAlert}
            progressMap={renderProgress}
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
            hasRedAlert={renderRedAlert.has(activeDragPatient.id)}
            progress={renderProgress?.[activeDragPatient.id]}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
