import { memo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
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
  const sourceColor = SOURCE_COLORS[patient.source] ?? "bg-[var(--surface-2)] text-[var(--text-secondary)]";
  const statusLabel = KANBAN_COLUMNS.find((c) => c.id === patient.status)?.label ?? patient.status;
  const statusColor = COLUMN_HEADER_COLOR[patient.status] ?? "text-[var(--text-secondary)] bg-[var(--surface-2)]";

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
      className={cn(
        "bg-[var(--surface)] rounded-2xl border p-3.5 select-none group shadow-sm",
        hasRedAlert ? "border-red-400 bg-red-50/40" : "border-[var(--border)]/60",
        onSelect && "cursor-pointer hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-sm text-[var(--text)] leading-tight line-clamp-1 flex items-center gap-1">
          {hasRedAlert && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          )}
          {patient.name}
        </p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${sourceColor}`}>
          {sourceLabel}
        </span>
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-2 font-mono tracking-tight">
        {patient.phone}
      </p>

      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-2.5 ${statusColor}`}>
        {statusLabel}
      </span>

      <div className="mb-2.5">
        <p className="text-[9px] font-semibold text-[var(--text-subtle)] uppercase tracking-wide mb-1.5">Прогресс</p>
        {progress && (progress.paid > 0 || progress.debt > 0 || progress.pending > 0) ? (
          <PatientTreatmentProgressBar data={progress} compact />
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full border-[3px] border-[var(--border)] flex items-center justify-center shrink-0">
              <span className="text-[10px] text-[var(--text-subtle)]">—</span>
            </div>
            <span className="text-[10px] text-[var(--text-subtle)]">Нет плана</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
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
      className={cn(
        "shadow-2xl rotate-1 scale-[1.02] cursor-grabbing border-primary/30 will-change-transform",
        props.className,
      )}
    />
  );
});

interface PatientCardProps extends PatientCardViewProps {
  isBoardDragging?: boolean;
}

export const PatientCard = memo(function PatientCard({
  patient,
  hasRedAlert,
  progress,
  onSelect,
  isBoardDragging = false,
}: PatientCardProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: patient.id,
    data: { type: "patient", status: patient.status },
  });

  // The moving clone is rendered by <DragOverlay>, so the source card stays in
  // place and is only dimmed. Avoiding a translate transform here means the
  // active card doesn't have to recompute its style on every pointer move.
  const style = {
    opacity: isDragging ? 0.25 : 1,
    touchAction: "none" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        if (isBoardDragging || isDragging || !onSelect) return;
        const start = pointerStart.current;
        if (!start) return;
        const moved =
          Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8;
        if (moved) return;
        onSelect(patient.id);
      }}
      className="cursor-grab active:cursor-grabbing touch-none"
    >
      <PatientCardView
        patient={patient}
        hasRedAlert={hasRedAlert}
        progress={progress}
        className={isDragging ? "pointer-events-none" : undefined}
      />
    </div>
  );
});
