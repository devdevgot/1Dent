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
  ChevronDown,
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
  onNewAppointment: () => void;
  onEditAppointment: (proc: ProcedureItem) => void;
  onClose: () => void;
}

function DayAppointmentsModal({
  day,
  groups,
  onNewAppointment,
  onEditAppointment,
  onClose,
}: DayAppointmentsModalProps) {
  const dayLabel = format(day, "d MMMM yyyy, EEEE", { locale: ru });
  const totalPatients = groups.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-none">
          <div>
            <h2 className="text-lg font-bold text-gray-900 capitalize">{dayLabel}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {totalPatients === 0
                ? "Нет записей"
                : `${totalPatients} пациент${totalPatients === 1 ? "" : totalPatients < 5 ? "а" : "ов"}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Записей на этот день нет
            </div>
          ) : (
            groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => onEditAppointment(group.procedures[0])}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-start gap-3"
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
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {group.patientName}
                    </span>
                    {group.timeLabel && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                        <Clock className="w-3 h-3" />
                        {group.timeLabel}
                      </span>
                    )}
                  </div>
                  {/* Doctor */}
                  {group.doctorName && (
                    <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {group.doctorName}
                    </p>
                  )}
                  {/* Procedures list */}
                  {group.procedures.length > 0 && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
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
        <div className="px-6 py-4 border-t border-gray-100 flex-none flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Закрыть
          </button>
          <button
            onClick={onNewAppointment}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Новая запись
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
      if (!p.scheduledAt) return false;
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

  const periodLabel = format(currentDate, "LLLL yyyy", { locale: ru });
  const DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Top bar */}
      <div className="flex-none bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Календарь клиники</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{periodLabel}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Doctor filter button */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors",
                  filterDoctorId
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>{filterDoctorId ? doctors.find((d) => d.id === filterDoctorId)?.name ?? "Фильтр" : "Все врачи"}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", filterOpen && "rotate-180")} />
              </button>

              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]">
                    {[{ id: "", name: "Все врачи" }, ...doctors].map((d) => (
                      <button
                        key={d.id}
                        onClick={() => { setFilterDoctorId(d.id); setFilterOpen(false); }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className={d.id === filterDoctorId ? "font-medium text-primary" : "text-gray-700"}>{d.name}</span>
                        {d.id === filterDoctorId && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate((d) => subMonths(d, 1))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-2 text-sm font-medium text-gray-700 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors min-w-[90px] capitalize"
              >
                {format(currentDate, "LLLL", { locale: ru })}
              </button>
              <button
                onClick={() => setCurrentDate((d) => addMonths(d, 1))}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* New appointment */}
            <Button
              onClick={() => openCreateModal(new Date())}
              size="sm"
              className="w-9 h-9 p-0 shrink-0"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden p-3 sm:p-4 flex flex-col gap-2">
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          {/* Day-of-week header */}
          <div className="flex-none grid grid-cols-7 border-b border-gray-100">
            {DOW_LABELS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "py-2.5 text-center text-xs font-semibold uppercase tracking-wide",
                  i >= 5 ? "text-red-400" : "text-gray-500",
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
                    "min-h-[80px] p-2 border-b border-r border-gray-100 cursor-pointer transition-colors",
                    "hover:bg-primary/5",
                    !inMonth && "bg-gray-50/60",
                    isWeekend && inMonth && "bg-red-50/30",
                    today && "ring-2 ring-inset ring-primary/30",
                  )}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        today
                          ? "bg-primary text-white font-bold"
                          : inMonth
                          ? isWeekend ? "text-red-500" : "text-gray-800"
                          : "text-gray-300",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {groups.length > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">{groups.length}</span>
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
                      <div className="text-[10px] text-gray-400 pl-1">
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
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day view */}
      {dayViewDate && !modalDate && (
        <DayAppointmentsModal
          day={dayViewDate}
          groups={getGroupsForDay(dayViewDate)}
          onNewAppointment={() => openCreateModal(dayViewDate)}
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
    </div>
  );
}
