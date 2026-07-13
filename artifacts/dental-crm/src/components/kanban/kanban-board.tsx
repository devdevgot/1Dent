import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  MeasuringStrategy,
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
  useListNotifications,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCardDragPreview } from "@/components/kanban/patient-card";
import { KanbanDragActiveRefContext } from "@/components/kanban/kanban-drag-context";
import { usePatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { useAuthStore } from "@/hooks/use-auth";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import type { Patient, PatientStatus } from "@workspace/api-client-react";
import type { PatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";

interface KanbanBoardProps {
  patients?: Patient[];
  onSelectPatient: (patientId: string) => void;
  className?: string;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

function progressMapsEqual(
  a?: Record<string, PatientTreatmentProgress>,
  b?: Record<string, PatientTreatmentProgress>,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const av = a[key];
    const bv = b[key];
    if (!bv) return false;
    if (
      av.paid !== bv.paid ||
      av.debt !== bv.debt ||
      av.pending !== bv.pending ||
      av.paidCount !== bv.paidCount ||
      av.debtCount !== bv.debtCount ||
      av.pendingCount !== bv.pendingCount
    ) {
      return false;
    }
  }
  return true;
}

function patientListsEqual(a: Patient[], b: Patient[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function groupPatientsByColumn(patients: Patient[]): Record<PatientStatus, Patient[]> {
  const grouped = Object.fromEntries(
    KANBAN_COLUMNS.map((col) => [col.id, [] as Patient[]]),
  ) as Record<PatientStatus, Patient[]>;
  for (const patient of patients) {
    grouped[patient.status]?.push(patient);
  }
  return grouped;
}

export const KanbanBoard = memo(function KanbanBoard({
  patients: patientsProp,
  onSelectPatient,
  className,
}: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canDragPatients = user?.role === "owner" || user?.role === "admin";
  const [activeDragPatient, setActiveDragPatient] = useState<Patient | null>(null);
  const isDragging = activeDragPatient !== null;
  const isDraggingRef = useRef(false);
  const patientsRef = useRef<Patient[]>([]);
  const stableColumnMapRef = useRef<Record<PatientStatus, Patient[]>>(
    groupPatientsByColumn([]),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
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

  const { data: notificationsData } = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: () => (isDraggingRef.current ? false : 15_000),
    },
  });

  const { data: progressMap } = usePatientTreatmentProgress({
    refetchInterval: () => (isDraggingRef.current ? false : 60_000),
  });

  const redAlertPatientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notificationsData?.data?.notifications ?? []) {
      if (n.type === "red_alert" && n.patientId && !n.read) {
        ids.add(n.patientId);
      }
    }
    return ids;
  }, [notificationsData]);

  const stableRedAlertRef = useRef(redAlertPatientIds);
  if (!setsEqual(stableRedAlertRef.current, redAlertPatientIds)) {
    stableRedAlertRef.current = redAlertPatientIds;
  }

  const stableProgressRef = useRef(progressMap);
  if (!progressMapsEqual(stableProgressRef.current, progressMap)) {
    stableProgressRef.current = progressMap;
  }

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      },
    },
  });

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
    if (!canDragPatients) return;
    isDraggingRef.current = true;
    const patient = patientsRef.current.find((p) => p.id === event.active.id);
    setActiveDragPatient(patient ?? null);
  }, [canDragPatients]);

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
    setActiveDragPatient(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canDragPatients) {
        handleDragCancel();
        return;
      }
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
    [queryClient, resolveOverColumn, statusMutation, canDragPatients, handleDragCancel],
  );

  const patientsByColumnMap = useMemo(() => {
    const next = groupPatientsByColumn(patients);
    const prev = stableColumnMapRef.current;
    const stable = {} as Record<PatientStatus, Patient[]>;

    for (const col of KANBAN_COLUMNS) {
      const nextList = next[col.id] ?? [];
      const prevList = prev[col.id] ?? [];
      stable[col.id] = patientListsEqual(prevList, nextList) ? prevList : nextList;
    }

    stableColumnMapRef.current = stable;
    return stable;
  }, [patients]);

  const renderSnapshotRef = useRef({
    columns: patientsByColumnMap,
    redAlert: stableRedAlertRef.current,
    progress: stableProgressRef.current,
  });
  if (!isDragging) {
    renderSnapshotRef.current = {
      columns: patientsByColumnMap,
      redAlert: stableRedAlertRef.current,
      progress: stableProgressRef.current,
    };
  }
  const renderColumns = isDragging ? renderSnapshotRef.current.columns : patientsByColumnMap;
  const renderRedAlert = isDragging ? renderSnapshotRef.current.redAlert : stableRedAlertRef.current;
  const renderProgress = isDragging ? renderSnapshotRef.current.progress : stableProgressRef.current;

  const columnLabels = useMemo(
    () => Object.fromEntries(KANBAN_COLUMNS.map((col) => [col.id, col.label])) as Record<PatientStatus, string>,
    [],
  );

  return (
    <KanbanDragActiveRefContext.Provider value={isDraggingRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{
          droppable: { strategy: MeasuringStrategy.BeforeDragging },
        }}
        autoScroll={{ threshold: { x: 0.12, y: 0.12 }, acceleration: 8 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          data-kanban-dragging={isDragging ? "" : undefined}
          className={cn(className, !isDragging && "snap-x snap-mandatory sm:snap-none")}
        >
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={columnLabels[col.id]}
              colorClass={col.color}
              patients={renderColumns[col.id] ?? []}
              redAlertPatientIds={renderRedAlert}
              progressMap={renderProgress}
              onSelectPatient={onSelectPatient}
              canDragPatients={canDragPatients}
            />
          ))}
        </div>

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeDragPatient ? (
            <PatientCardDragPreview
              patient={activeDragPatient}
              hasRedAlert={renderRedAlert.has(activeDragPatient.id)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </KanbanDragActiveRefContext.Provider>
  );
});
