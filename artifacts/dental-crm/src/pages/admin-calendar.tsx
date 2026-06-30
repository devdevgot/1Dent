import { useState, useMemo } from "react";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
  useUpdateProcedure,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  User,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  startOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  addMonths,
  subMonths,
  addDays,
} from "date-fns";
import { ru } from "date-fns/locale";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import {
  AppointmentModal,
  STATUS_DOT,
  STATUS_PILL,
  STATUS_OPTIONS,
  type ProcedureItem,
  type PatientEntry,
} from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import { isCalendarProcedure } from "@/lib/calendar-procedures";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";

/* ─── Appointment Group ─────────────────────────────────────────────────────
   Multiple procedures belonging to the same patient at the same time slot
   are collapsed into a single "appointment" entry for display.
   ─────────────────────────────────────────────────────────────────────────── */
interface AppointmentGroup {
  key: string;
  patientId: string;
  patientName: string;
  doctorId: string | null;
  doctorName: string | null;
  timeLabel: string | null;
  status: string;
  procedures: ProcedureItem[];
}

function buildGroups(
  procedures: ProcedureItem[],
  patients: PatientEntry[],
  doctors: { id: string; name: string }[],
): AppointmentGroup[] {
  const map = new Map<string, AppointmentGroup>();

  for (const proc of procedures) {
    const timeLabel = proc.scheduledAt
      ? format(parseISO(proc.scheduledAt), "HH:mm")
      : null;
    const key = `${proc.patientId ?? "unknown"}-${timeLabel ?? "notime"}`;

    if (!map.has(key)) {
      const patient = patients.find((p) => p.id === proc.patientId);
      const doctor = proc.doctorId
        ? doctors.find((d) => d.id === proc.doctorId) ?? null
        : null;
      map.set(key, {
        key,
        patientId: proc.patientId ?? "",
        patientName: patient?.name ?? "—",
        doctorId: proc.doctorId ?? null,
        doctorName: doctor?.name ?? null,
        timeLabel,
        status: proc.status ?? "scheduled",
        procedures: [],
      });
    }
    map.get(key)!.procedures.push(proc);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (!a.timeLabel) return 1;
    if (!b.timeLabel) return -1;
    return a.timeLabel.localeCompare(b.timeLabel);
  });
}

/* ─── Day Appointments List Modal ─── */
interface DayAppointmentsModalProps {
  day: Date;
  groups: AppointmentGroup[];
  onEditAppointment: (proc: ProcedureItem) => void;
  onClose: () => void;
}

function DayAppointmentsModal({
  day,
  groups,
  onEditAppointment,
  onClose,
}: DayAppointmentsModalProps) {
  const dayLabel = format(day, "d MMMM yyyy, EEEE", { locale: ru });
  const totalPatients = groups.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 font-manrope">
      <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e3d9] flex-none">
          <div>
            <h2 className="text-lg font-bold text-[#0f172a] capitalize">{dayLabel}</h2>
            <p className="text-sm text-[#64748b] mt-0.5">
              {totalPatients === 0
                ? "Нет записей"
                : `${totalPatients} пациент${totalPatients === 1 ? "" : totalPatients < 5 ? "а" : "ов"}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[#f1ede4] transition-colors">
            <X className="w-5 h-5 text-[#64748b]" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-10 text-[#94a3b8] text-sm">
              Записей на этот день нет
            </div>
          ) : (
            groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => onEditAppointment(group.procedures[0])}
                className="w-full text-left px-4 py-3 rounded-xl border border-[#e8e3d9] hover:border-[#1f75fe]/30 hover:bg-[#1f75fe]/5 transition-all flex items-start gap-3"
              >
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full flex-none mt-1.5",
                    STATUS_DOT[group.status ?? "scheduled"],
                  )}
                />
                <div className="flex-1 min-w-0">
                  {/* Patient name + time */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#0f172a] truncate">
                      {group.patientName}
                    </span>
                    {group.timeLabel && (
                      <span className="flex items-center gap-1 text-xs text-[#64748b] shrink-0">
                        <Clock className="w-3 h-3" />
                        {group.timeLabel}
                      </span>
                    )}
                  </div>
                  {/* Doctor */}
                  {group.doctorName && (
                    <p className="text-xs text-[#64748b] truncate mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {group.doctorName}
                    </p>
                  )}
                  {/* Procedures list */}
                  {group.procedures.length > 0 && (
                    <p className="text-xs text-[#94a3b8] truncate mt-0.5">
                      {group.procedures.map((p) => p.name).join(", ")}
                    </p>
                  )}
                </div>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border self-center shrink-0", STATUS_PILL[group.status ?? "scheduled"])}>
                  {STATUS_OPTIONS.find((s) => s.value === group.status)?.label ?? group.status}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e8e3d9] flex-none flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#e8e3d9] text-sm text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AdminCalendar() {
  const qc = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterDoctorId, setFilterDoctorId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingProcedure, setEditingProcedure] = useState<ProcedureItem | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const { data: procedureData } = useListProcedures();
  const { data: patientData }   = useListPatients();
  const { data: userData }      = useListUsers();
  const { data: templateData }  = useListProcedureTemplates();

  const allProcedures: ProcedureItem[] = useMemo(
    () => (procedureData?.data?.procedures ?? []) as ProcedureItem[],
    [procedureData],
  );
  const patients = useMemo(
    () => (patientData?.data?.patients ?? []).map((p) => {
      const lastProc = allProcedures
        .filter((proc) => proc.patientId === p.id && proc.doctorId)
        .sort((a, b) => new Date(b.scheduledAt ?? 0).getTime() - new Date(a.scheduledAt ?? 0).getTime())[0];
      return {
        id: p.id,
        name: p.name,
        phone: (p as any).phone ?? "",
        iin: (p as any).iin ?? null,
        doctorId: lastProc?.doctorId ?? null,
      };
    }),
    [patientData, allProcedures],
  );
  const doctors = useMemo(
    () =>
      (userData?.data?.users ?? [])
        .filter((u) => u.role === "doctor")
        .map((u) => ({ id: u.id, name: u.name })),
    [userData],
  );
  const templates: ProcedureTemplate[] = useMemo(
    () => (templateData?.data?.templates ?? []) as ProcedureTemplate[],
    [templateData],
  );

  const apptSave = useAppointmentSave({ onDone: closeModal });
  const dropMutation = useUpdateProcedure({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: ["/procedures"] }) },
  });

  /* Month grid */
  const monthStart = startOfMonth(currentDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridDays   = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });

  const filteredProcedures = useMemo(() => {
    return allProcedures.filter((p) => {
      if (!isCalendarProcedure(p)) return false;
      if (filterDoctorId && p.doctorId !== filterDoctorId) return false;
      return true;
    });
  }, [allProcedures, filterDoctorId]);

  function getGroupsForDay(day: Date): AppointmentGroup[] {
    const procs = filteredProcedures.filter((p) => {
      if (!p.scheduledAt) return false;
      return isSameDay(parseISO(p.scheduledAt), day);
    });
    return buildGroups(procs, patients, doctors);
  }

  function openDayView(day: Date) {
    setDayViewDate(day);
  }

  function openCreateModal(day: Date) {
    const d = new Date(day);
    d.setHours(9, 0, 0, 0);
    setEditingProcedure(null);
    setModalDate(d);
    setDayViewDate(null);
  }

  function openEditModal(proc: ProcedureItem) {
    setEditingProcedure(proc);
    setModalDate(proc.scheduledAt ? parseISO(proc.scheduledAt) : new Date());
    setDayViewDate(null);
  }

  function closeModal() {
    setModalDate(null);
    setEditingProcedure(null);
  }

  async function handleDrop(procIds: string[], day: Date) {
    for (const procId of procIds) {
      const proc = allProcedures.find((p) => p.id === procId);
      if (!proc) continue;
      const old = proc.scheduledAt ? parseISO(proc.scheduledAt) : new Date();
      const newDate = new Date(day);
      newDate.setHours(old.getHours(), old.getMinutes(), 0, 0);
      await dropMutation.mutateAsync({
        id: procId,
        data: { scheduledAt: newDate.toISOString() },
      });
    }
  }

  const isSaving = apptSave.isSaving;

  const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <PageShell className="flex flex-col h-full overflow-hidden" animate={false}>
      <PageHeader
        title="Календарь"
        sticky
        right={
          <>
            <div className="flex items-center gap-1">
              <PageHeaderIconButton onClick={() => setCurrentDate((d) => subMonths(d, 1))} title="Предыдущий месяц">
                <ChevronLeft className="w-4 h-4" />
              </PageHeaderIconButton>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-sm font-medium text-[var(--text)] rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors min-w-[90px] capitalize"
              >
                {format(currentDate, "LLLL", { locale: ru })}
              </button>
              <PageHeaderIconButton onClick={() => setCurrentDate((d) => addMonths(d, 1))} title="Следующий месяц">
                <ChevronRight className="w-4 h-4" />
              </PageHeaderIconButton>
            </div>

            <div className="relative">
              <PageHeaderIconButton
                onClick={() => setFilterOpen((v) => !v)}
                active={!!filterDoctorId}
                title="Фильтр по врачу"
                className="relative"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {filterDoctorId && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[var(--primary)] rounded-full" />
                )}
              </PageHeaderIconButton>

              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-20 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-lg py-1.5 min-w-[180px]">
                    {[{ id: "", name: "Все врачи" }, ...doctors].map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { setFilterDoctorId(d.id); setFilterOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors text-left",
                          d.id === filterDoctorId
                            ? "bg-[var(--primary-light)] text-[var(--primary)] font-semibold"
                            : "text-[var(--text)] hover:bg-[var(--bg)]",
                        )}
                      >
                        <span>{d.name}</span>
                        {d.id === filterDoctorId && <Check className="w-4 h-4 text-[var(--primary)] shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <Button
              onClick={() => openCreateModal(new Date())}
              size="sm"
              className="w-9 h-9 p-0 shrink-0 rounded-full bg-[#1f75fe] hover:bg-[#1a65e8] hover:scale-105 font-semibold shadow-sm"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-hidden p-3 sm:p-4 flex flex-col gap-2">
        <div className="flex-1 bg-white rounded-2xl shadow-md border border-[#e8e3d9] overflow-hidden flex flex-col">
          {/* Day-of-week header */}
          <div className="flex-none grid grid-cols-7 border-b border-[#e8e3d9]">
            {DOW_LABELS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "py-2.5 text-center text-xs font-semibold uppercase tracking-wide",
                  i >= 5 ? "text-[#dc2626]" : "text-[#64748b]",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid rows — inner scroll, outer stays fixed */}
          <div className="flex-1 overflow-auto custom-scrollbar">
          <div className="grid grid-cols-7">
            {gridDays.map((day, idx) => {
              const groups = getGroupsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const isWeekend = idx % 7 >= 5;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => openDayView(day)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("groupProcIds");
                    if (raw) {
                      try {
                        const ids = JSON.parse(raw) as string[];
                        handleDrop(ids, day);
                      } catch {}
                    }
                  }}
                  className={cn(
                    "min-h-[80px] p-2 border-b border-r border-[#e8e3d9] cursor-pointer transition-colors",
                    "hover:bg-[#faf8f4]",
                    !inMonth && "bg-[#f1ede4]/30",
                    isWeekend && inMonth && "bg-[#fef2f2]/30",
                    today && "ring-2 ring-inset ring-[#1f75fe]/30",
                  )}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        today
                          ? "bg-[#1f75fe] text-white font-bold"
                          : inMonth
                          ? isWeekend ? "text-[#dc2626]" : "text-[#0f172a]"
                          : "text-[#94a3b8]",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {groups.length > 0 && (
                      <span className="text-[10px] text-[#94a3b8] font-medium">{groups.length}</span>
                    )}
                  </div>

                  {/* Appointment pills — one per patient visit */}
                  <div className="space-y-0.5">
                    {groups.slice(0, 3).map((group) => (
                      <div
                        key={group.key}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData("groupProcIds", JSON.stringify(group.procedures.map((p) => p.id)));
                          setDraggingKey(group.key);
                        }}
                        onDragEnd={() => setDraggingKey(null)}
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium truncate cursor-pointer transition-opacity",
                          STATUS_PILL[group.status ?? "scheduled"],
                          draggingKey === group.key && "opacity-50",
                        )}
                        title={`${group.patientName}${group.doctorName ? " · " + group.doctorName : ""}${group.timeLabel ? " — " + group.timeLabel : ""}`}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full flex-none",
                            STATUS_DOT[group.status ?? "scheduled"],
                          )}
                        />
                        <span className="truncate flex-1">{group.patientName}</span>
                        {group.timeLabel && (
                          <span className="opacity-60 shrink-0">{group.timeLabel}</span>
                        )}
                      </div>
                    ))}
                    {groups.length > 3 && (
                      <div className="text-[10px] text-[#94a3b8] pl-1">
                        +{groups.length - 3} ещё
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap px-1 flex-none">
          {STATUS_OPTIONS.map((s) => (
            <div key={s.value} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[s.value])} />
              <span className="text-xs text-[#64748b]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day view */}
      {dayViewDate && !modalDate && (
        <DayAppointmentsModal
          day={dayViewDate}
          groups={getGroupsForDay(dayViewDate)}
          onEditAppointment={(proc) => openEditModal(proc)}
          onClose={() => setDayViewDate(null)}
        />
      )}

      {/* Appointment modal */}
      {modalDate && (
        <AppointmentModal
          date={modalDate}
          procedure={editingProcedure}
          patients={patients}
          doctors={doctors}
          templates={templates}
          onSave={(data) => apptSave.save(data, editingProcedure)}
          onDelete={editingProcedure ? () => apptSave.remove(editingProcedure.id) : undefined}
          onClose={closeModal}
          isSaving={isSaving}
        />
      )}
    </PageShell>
  );
}
