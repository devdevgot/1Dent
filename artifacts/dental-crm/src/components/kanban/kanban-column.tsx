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
  isBoardDragging?: boolean;
}

const ColumnPatientList = memo(function ColumnPatientList({
  patients,
  redAlertPatientIds,
  progressMap,
  onSelectPatient,
  isBoardDragging,
}: {
  patients: Patient[];
  redAlertPatientIds: ReadonlySet<string>;
  progressMap?: Record<string, PatientTreatmentProgress>;
  onSelectPatient: (patientId: string) => void;
  isBoardDragging?: boolean;
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
          isBoardDragging={isBoardDragging}
        />
      ))}
    </>
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
  isBoardDragging = false,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const headerColor = COLUMN_HEADER_COLOR[id];
  const count = patients.length;

  const listProps = useMemo(
    () => ({
      patients,
      redAlertPatientIds,
      progressMap,
      onSelectPatient,
      isBoardDragging,
    }),
    [patients, redAlertPatientIds, progressMap, onSelectPatient, isBoardDragging],
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border-2 w-[85vw] min-w-[85vw] sm:w-[260px] sm:min-w-[260px] flex-shrink-0 snap-center h-full transition-[border-color,box-shadow] duration-150",
        colorClass,
        isOver && "border-primary/50 ring-1 ring-primary/20",
      )}
    >
      <div className="p-3 flex items-center justify-between shrink-0 sticky top-0 z-10 rounded-t-2xl bg-inherit">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground/80 leading-tight">
          {label}
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${headerColor}`}>
          {count}
        </span>
      </div>

      <div className="flex-1 px-2 pb-3 space-y-2 min-h-[120px] overflow-y-auto overscroll-contain">
        <ColumnPatientList {...listProps} />
      </div>
    </div>
  );
});
