import { useState, useMemo } from "react";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
} from "@workspace/api-client-react";
import type { Procedure } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppointmentModal } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import type { ProcedureTemplate } from "@/components/appointment-modal";
import { isCalendarProcedure } from "@/lib/calendar-procedures";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { ScheduleMonthSkeleton } from "@/components/skeletons";
import { filterTreatingDoctors, seesClinicSchedule, treatingDoctorLabel } from "@/lib/role-groups";

/** Solid blue used for day markers (dot / multi-line) — no per-status colors. */
const MARKER_BLUE = "bg-[#1f75fe]";

/* ─── Locale ────────────────────────────────────────────────────────────────── */
const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
// Пн Вт Ср Чт Пт Сб Вс  (Monday-first, clinic standard)
const DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function DoctorSchedulePage() {
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const { isOverlay, pushDate } = useOverlayNavigation();

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modalDate, setModalDate] = useState<Date | null>(null);

  const todayStr = toStr(new Date());

  const { data, isLoading } = useListProcedures();
  const { data: patientData }  = useListPatients();
  const { data: userData }     = useListUsers();
  const { data: templateData } = useListProcedureTemplates();

  const patients = useMemo(
    () => (patientData?.data?.patients ?? []).map((p) => ({
      id: p.id, name: p.name,
      phone: (p as any).phone ?? "",
      iin:   (p as any).iin   ?? null,
      doctorId: (p as any).doctorId ?? null,
    })),
    [patientData],
  );
  const doctors = useMemo(
    () => filterTreatingDoctors(userData?.data?.users ?? [])
      .map((u) => ({ id: u.id, name: treatingDoctorLabel(u) })),
    [userData],
  );
  const templates: ProcedureTemplate[] = useMemo(
    () => (templateData?.data?.templates ?? []) as ProcedureTemplate[],
    [templateData],
  );

  const apptSave = useAppointmentSave({ onDone: () => setModalDate(null) });

  const clinicWideSchedule = seesClinicSchedule(user?.role);

  /* Group procedures by local date — only scheduled / in-progress appointments */
  const byDate = useMemo(() => {
    const all = (data?.data?.procedures ?? []) as Procedure[];
    const mine = clinicWideSchedule || !user?.id ? all : all.filter(p => p.doctorId === user.id);
    const active = mine.filter(isCalendarProcedure);
    const map = new Map<string, Procedure[]>();
    active.forEach(p => {
      if (!p.scheduledAt) return;
      const k = toStr(new Date(p.scheduledAt));
      map.set(k, [...(map.get(k) ?? []), p]);
    });
    return map;
  }, [data, user?.id, clinicWideSchedule]);

  /* Calendar grid (Mon-first) */
  const weeks = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
    // convert to Mon-first offset: Sun→6, Mon→0, Tue→1 …
    const offset = (firstDow + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array(offset).fill(null),
      ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const next = () => { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); };
  const goToday = () => { const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth()); };
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <PageShell className="pb-8" animate={false}>
      <PageHeader
        title={`${MONTHS[month]} ${year}`}
        right={
          <>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={goToday}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#1f75fe] bg-[var(--primary-light)] hover:bg-[#1f75fe]/15 transition-colors"
              >
                Сегодня
              </button>
            )}
            <PageHeaderIconButton onClick={prev} title="Предыдущий месяц">
              <ChevronLeft className="w-4 h-4" />
            </PageHeaderIconButton>
            <PageHeaderIconButton onClick={next} title="Следующий месяц">
              <ChevronRight className="w-4 h-4" />
            </PageHeaderIconButton>
            <button
              type="button"
              onClick={() => setModalDate(new Date())}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--ds-primary)] text-white hover:opacity-90 hover:scale-105 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
            </button>
          </>
        }
        bottom={
          <div className="grid grid-cols-7">
            {DOW.map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-[#64748b] uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>
        }
      />

      {/* ── Calendar body ── */}
      {isLoading ? (
        <ScheduleMonthSkeleton />
      ) : (
        // data-ptr-ignore: day-cell taps must not be stolen by page pull-to-refresh
        <div data-ptr-ignore className="bg-white border-b border-[#e8e3d9]">
          {weeks.map((week, wi) => (
            <div key={wi} className="border-b border-[#e8e3d9] grid grid-cols-7">
              {week.map((day, di) => {
                if (!day) return (
                  <div key={di} className="min-h-[64px] bg-[#f1ede4]/30" />
                );

                const ds     = toStr(day);
                const isToday = ds === todayStr;
                const procs   = byDate.get(ds) ?? [];
                const isOther = day.getMonth() !== month;
                const count   = procs.length;

                return (
                  <div
                    key={di}
                    data-ptr-ignore
                    onClick={() => (isOverlay ? pushDate(ds) : navigate(`/schedule/${ds}`))}
                    title={
                      count === 0
                        ? undefined
                        : count === 1
                          ? "1 запись"
                          : `${count} записей`
                    }
                    className={`
                      min-h-[64px] border-r border-[#e8e3d9] last:border-r-0 p-1.5 cursor-pointer
                      transition-colors select-none
                      ${isOther ? "bg-[#f1ede4]/20" : "hover:bg-[#faf8f4]"}
                    `}
                  >
                    {/* Day number */}
                    <div className="flex justify-center">
                      <span className={`
                        w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold leading-none
                        ${isToday
                          ? "bg-[#1f75fe] text-white shadow-md"
                          : isOther
                            ? "text-[#94a3b8]/40 font-normal"
                            : "text-[#0f172a]"}
                      `}>
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Entry markers: 1 → blue dot, 2+ → blue horizontal pill */}
                    <div className="flex justify-center items-center h-3 mt-0.5" aria-hidden={count === 0}>
                      {count === 1 && (
                        <span className={`w-1.5 h-1.5 rounded-full ${MARKER_BLUE}`} />
                      )}
                      {count > 1 && (
                        <span className={`w-3.5 h-1 rounded-full ${MARKER_BLUE}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="mx-4 mt-4 p-3 bg-white rounded-2xl border border-[#e8e3d9] shadow-md">
        <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Записи</p>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MARKER_BLUE}`} />
            <span className="text-[11px] text-[#64748b]">1 запись</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-3.5 h-1 rounded-full shrink-0 ${MARKER_BLUE}`} />
            <span className="text-[11px] text-[#64748b]">Несколько записей</span>
          </div>
        </div>
      </div>

      {/* ── Appointment modal ── */}
      {modalDate && (
        <AppointmentModal
          date={modalDate}
          procedure={null}
          patients={patients}
          doctors={doctors}
          templates={templates}
          defaultDoctorId={user?.id}
          onSave={(data) => apptSave.save(data, null)}
          onClose={() => setModalDate(null)}
          isSaving={apptSave.isSaving}
        />
      )}
    </PageShell>
  );
}
