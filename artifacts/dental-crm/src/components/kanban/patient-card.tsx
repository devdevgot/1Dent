import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, User } from "lucide-react";
import type { Patient } from "@workspace/api-client-react";
import { SOURCE_LABELS, SOURCE_COLORS } from "@/lib/patient-utils";
import { useKanbanStore } from "@/hooks/use-kanban";

interface PatientCardProps {
  patient: Patient;
}

export function PatientCard({ patient }: PatientCardProps) {
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: patient.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sourceLabel = SOURCE_LABELS[patient.source] ?? patient.source;
  const sourceColor = SOURCE_COLORS[patient.source] ?? "bg-slate-100 text-slate-600";

  const formattedDate = new Date(patient.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => setSelectedPatientId(patient.id)}
      className={`
        bg-white rounded-xl border border-border/60 p-3.5 cursor-grab active:cursor-grabbing
        shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
        select-none group
        ${isDragging ? "opacity-50 rotate-1 shadow-xl" : ""}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-sm text-foreground leading-tight line-clamp-1">
          {patient.name}
        </p>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${sourceColor}`}>
          {sourceLabel}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-2.5 font-mono tracking-tight">
        {patient.phone}
      </p>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
        {patient.age && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{patient.age} лет</span>
          </div>
        )}
      </div>
    </div>
  );
}
