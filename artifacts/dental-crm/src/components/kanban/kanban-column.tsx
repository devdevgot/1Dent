import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { Patient, PatientStatus } from "@workspace/api-client-react";
import { PatientCard } from "./patient-card";
import { COLUMN_HEADER_COLOR } from "@/lib/patient-utils";
import type { PatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  id: PatientStatus;
  label: string;
  colorClass: string;
  patients: Patient[];
  redAlertPatientIds: ReadonlySet<string>;
  progressMap?: Record<string, PatientTreatmentProgress>;
  onSelectPatient: (patientId: string) => void;
  canDragPatients?: boolean;
}

const ColumnPatientList = memo(function ColumnPatientList({
  patients,
  redAlertPatientIds,
  progressMap,
  onSelectPatient,
  canDragPatients = false,
}: {
  patients: Patient[];
  redAlertPatientIds: ReadonlySet<string>;
  progressMap?: Record<string, PatientTreatmentProgress>;
  onSelectPatient: (patientId: string) => void;
  canDragPatients?: boolean;
}) {
  return (
    <>
      {patients.map((patient) => (
        <PatientCard
          key={patient.id}
          patient={patient}
          hasRedAlert={redAlertPatientIds.has(patient.id)}
          progress={progressMap?.[patient.id]}
          onSelect={onSelectPatient}
          draggable={canDragPatients}
        />
      ))}
    </>
  );
});

/** Isolated droppable zone so isOver updates don't re-render the column shell or cards. */
const ColumnDropZone = memo(function ColumnDropZone({
  id,
  children,
}: {
  id: PatientStatus;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="relative flex-1 min-h-[120px] flex flex-col"
    >
      <div className="kanban-column-list flex-1 px-2 pb-3 space-y-2 min-h-[120px] overflow-y-auto overscroll-contain">
        {children}
      </div>
      {isOver && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-b-2xl border-2 border-primary/50 ring-1 ring-primary/20"
        />
      )}
    </div>
  );
});

export const KanbanColumn = memo(function KanbanColumn({
  id,
  label,
  colorClass,
  patients,
  redAlertPatientIds,
  progressMap,
  onSelectPatient,
  canDragPatients = false,
}: KanbanColumnProps) {
  const headerColor = COLUMN_HEADER_COLOR[id];
  const count = patients.length;

  const listProps = useMemo(
    () => ({
      patients,
      redAlertPatientIds,
      progressMap,
      onSelectPatient,
      canDragPatients,
    }),
    [patients, redAlertPatientIds, progressMap, onSelectPatient, canDragPatients],
  );

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 w-[85vw] min-w-[85vw] sm:w-[260px] sm:min-w-[260px] flex-shrink-0 snap-center h-full",
        colorClass,
      )}
    >
      <div className="p-3 flex items-center justify-between shrink-0 sticky top-0 z-10 rounded-t-2xl bg-inherit">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-[#0f172a]/80 leading-tight">
          {label}
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${headerColor}`}>
          {count}
        </span>
      </div>

      <ColumnDropZone id={id}>
        <ColumnPatientList {...listProps} />
      </ColumnDropZone>
    </div>
  );
});
