import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Patient, PatientStatus } from "@workspace/api-client-react";
import { PatientCard } from "./patient-card";
import { COLUMN_HEADER_COLOR } from "@/lib/patient-utils";
import type { PatientFinancial } from "@/hooks/use-patient-financials";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  id: PatientStatus;
  label: string;
  colorClass: string;
  patients: Patient[];
  redAlertPatientIds: ReadonlySet<string>;
  financials?: Record<string, PatientFinancial>;
  onSelectPatient: (patientId: string) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  label,
  colorClass,
  patients,
  redAlertPatientIds,
  financials,
  onSelectPatient,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const itemIds = useMemo(() => patients.map((p) => p.id), [patients]);
  const headerColor = COLUMN_HEADER_COLOR[id];

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 w-[85vw] min-w-[85vw] sm:w-[260px] sm:min-w-[260px] flex-shrink-0 snap-center h-full",
        colorClass,
        isOver && "border-primary/50 ring-1 ring-primary/20",
      )}
    >
      <div className="p-3 flex items-center justify-between shrink-0 sticky top-0 z-10 rounded-t-2xl bg-inherit">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground/80 leading-tight">
          {label}
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${headerColor}`}>
          {patients.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-3 space-y-2 min-h-[120px] overflow-y-auto"
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {patients.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              hasRedAlert={redAlertPatientIds.has(patient.id)}
              fin={financials?.[patient.id]}
              onSelect={onSelectPatient}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
});
