import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, User, AlertTriangle } from "lucide-react";
import type { Patient } from "@workspace/api-client-react";
import { SOURCE_LABELS, SOURCE_COLORS, KANBAN_COLUMNS, COLUMN_HEADER_COLOR } from "@/lib/patient-utils";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useNotifications } from "@/hooks/use-notifications";
import { usePatientFinancials } from "@/hooks/use-patient-financials";
import { PatientFinancialBar } from "./patient-financial-bar";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";

interface PatientCardProps {
  patient: Patient;
}

export function PatientCard({ patient }: PatientCardProps) {
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const { data: notificationsData } = useNotifications();
  const { data: financials } = usePatientFinancials();
  const fin = financials?.[patient.id];
  const hasRedAlert = (notificationsData?.data?.notifications ?? []).some(
    (n) => n.type === "red_alert" && n.patientId === patient.id && !n.read,
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: patient.id });

  const [isPressed, setIsPressed] = useState(false);

  const mergedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      setIsPressed(true);
      listeners?.onPointerDown?.(e as never);
    },
    onPointerUp: (e: React.PointerEvent) => {
      setIsPressed(false);
      listeners?.onPointerUp?.(e as never);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      setIsPressed(false);
      listeners?.onPointerLeave?.(e as never);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      setIsPressed(false);
      listeners?.onPointerCancel?.(e as never);
    },
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none" as const,
  };

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

  const isLifted = isPressed || isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...mergedListeners}
      onClick={() => setSelectedPatientId(patient.id)}
      className={`
        bg-white rounded-xl border p-3.5 cursor-grab active:cursor-grabbing
        select-none group
        transition-all duration-150
        ${isDragging
          ? "opacity-40 scale-95"
          : isLifted
          ? "rotate-2 scale-[1.03] shadow-2xl -translate-y-1 z-10"
          : "shadow-sm hover:shadow-md hover:-translate-y-0.5"
        }
        ${hasRedAlert ? "border-red-400 bg-red-50/40" : "border-border/60"}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-sm text-foreground leading-tight line-clamp-1 flex items-center gap-1">
          {hasRedAlert && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 animate-pulse" />
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

      {fin && (fin.paid > 0 || fin.debt > 0 || fin.remaining > 0) && (
        <div className="mb-2.5">
          <PatientFinancialBar data={fin} compact />
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
}
