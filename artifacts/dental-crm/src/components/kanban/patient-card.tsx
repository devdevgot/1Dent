import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, User, AlertTriangle } from "lucide-react";
import type { Patient } from "@workspace/api-client-react";
import { SOURCE_LABELS, SOURCE_COLORS, KANBAN_COLUMNS, COLUMN_HEADER_COLOR } from "@/lib/patient-utils";
import type { PatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { PatientTreatmentProgressBar } from "./patient-treatment-progress-bar";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { cn } from "@/lib/utils";

export interface PatientCardViewProps {
  patient: Patient;
  hasRedAlert?: boolean;
  progress?: PatientTreatmentProgress;
  onSelect?: (patientId: string) => void;
  className?: string;
}

export const PatientCardView = memo(function PatientCardView({
  patient,
  hasRedAlert = false,
  progress,
  onSelect,
  className,
}: PatientCardViewProps) {
  const sourceLabel = SOURCE_LABELS[patient.source] ?? patient.source;
  const sourceColor = SOURCE_COLORS[patient.source] ?? "bg-slate-100 text-slate-600";
  const statusLabel = KANBAN_COLUMNS.find((c) => c.id === patient.status)?.label ?? patient.status;
  const statusColor = COLUMN_HEADER_COLOR[patient.status] ?? "text-slate-600 bg-slate-100";

  const formattedDate = new Date(patient.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });

  const ageDisplay = patient.dateOfBirth
    ? `${calculateAge(patient.dateOfBirth)} лет · ${formatDateOfBirth(patient.dateOfBirth)}`
    : null;

  const maskedIIN = patient.iin ? maskIIN(patient.iin) : null;

  return (
    <div
      onClick={onSelect ? () => onSelect(patient.id) : undefined}
      className={cn(
        "bg-white rounded-xl border p-3.5 select-none group shadow-sm",
        hasRedAlert ? "border-red-400 bg-red-50/40" : "border-border/60",
        onSelect && "cursor-pointer hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-sm text-foreground leading-tight line-clamp-1 flex items-center gap-1">
          {hasRedAlert && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          )}
          {patient.name}
        </p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${sourceColor}`}>
          {sourceLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-2 font-mono tracking-tight">
        {patient.phone}
      </p>

      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-2.5 ${statusColor}`}>
        {statusLabel}
      </span>

      {progress && (progress.paid > 0 || progress.debt > 0 || progress.pending > 0) && (
        <div className="mb-2.5">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Прогресс</p>
          <PatientTreatmentProgressBar data={progress} compact />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
        {(ageDisplay || maskedIIN) && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>
              {ageDisplay}
              {ageDisplay && maskedIIN && " · "}
              {maskedIIN && <span className="font-mono">{maskedIIN}</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

export const PatientCardOverlay = memo(function PatientCardOverlay(props: PatientCardViewProps) {
  return (
    <PatientCardView
      {...props}
      className={cn("shadow-2xl rotate-2 scale-[1.03] cursor-grabbing border-primary/30", props.className)}
    />
  );
});

interface PatientCardProps extends PatientCardViewProps {}

export const PatientCard = memo(function PatientCard({
  patient,
  hasRedAlert,
  progress,
  onSelect,
}: PatientCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: patient.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    touchAction: "none" as const,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-[100px] rounded-xl border-2 border-dashed border-primary/25 bg-primary/5"
        {...attributes}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <PatientCardView
        patient={patient}
        hasRedAlert={hasRedAlert}
        progress={progress}
        onSelect={onSelect}
      />
    </div>
  );
});
