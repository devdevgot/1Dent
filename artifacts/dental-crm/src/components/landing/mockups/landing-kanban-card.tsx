import type { Patient } from "@workspace/api-client-react";
import { SOURCE_COLORS, SOURCE_LABELS, KANBAN_COLUMNS } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";

export function LandingKanbanCard({
  patient,
  className,
}: {
  patient: Patient;
  className?: string;
}) {
  const sourceLabel = SOURCE_LABELS[patient.source] ?? patient.source;
  const sourceColor = SOURCE_COLORS[patient.source] ?? "bg-[#f1ede4] text-[#64748b]";
  const statusLabel = KANBAN_COLUMNS.find((c) => c.id === patient.status)?.label ?? patient.status;
  const statusColor = KANBAN_COLUMNS.find((c) => c.id === patient.status)?.headerColor ?? "text-[#64748b] bg-[#f1ede4]";

  const formattedDate = new Date(patient.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#e8e3d9]/70 p-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1">
        <p className="font-semibold text-[11px] text-[#0f172a] leading-tight truncate">
          {patient.name}
        </p>
        <span className={cn("text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", sourceColor)}>
          {sourceLabel}
        </span>
      </div>

      <p className="text-[9px] text-[#64748b] font-mono mb-1.5 truncate">
        {patient.phone}
      </p>

      <div className="flex items-center justify-between gap-1">
        <span className={cn("inline-block text-[8px] font-medium px-1.5 py-0.5 rounded-full truncate", statusColor)}>
          {statusLabel}
        </span>
        <span className="text-[8px] text-[#94a3b8] shrink-0">{formattedDate}</span>
      </div>
    </div>
  );
}
