import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
} from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppointmentModal } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import type { ProcedureTemplate } from "@/components/appointment-modal";
import { isCalendarProcedure } from "@/lib/calendar-procedures";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { ScheduleMonthSkeleton } from "@/components/skeletons";

/* ─── Status colours ────────────────────────────────────────────────────────── */
const STATUS_PILL: Record<ProcedureStatus, string> = {
  scheduled:   "bg-[#e0f2fe] text-[#0284c7]",
  in_progress: "bg-[#fef3c7] text-[var(--warning)]",
  completed:   "bg-[#f0fdf4] text-[var(--success)]",
  cancelled:   "bg-[#f1f5f9] text-[var(--text-subtle)]",
};

const STATUS_DOT: Record<ProcedureStatus, string> = {
  scheduled:   "bg-[#0284c7]",
  in_progress: "bg-[var(--warning)]",
  completed:   "bg-[var(--success)]",
  cancelled:   "bg-[#94a3b8]",
};

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
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [, navigate] = useLocation();

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
    () => (userData?.data?.users ?? [])
      .filter((u) => u.role === "doctor")
      .map((u) => ({ id: u.id, name: u.name })),
    [userData],
  );
  const templates: ProcedureTemplate[] = useMemo(
    () => (templateData?.data?.templates ?? []) as ProcedureTemplate[],
    [templateData],
  );

  const apptSave = useAppointmentSave({ onDone: () => setModalDate(null) });

  /* Group procedures by local date — only scheduled / in-progress appointments */
  const byDate = useMemo(() => {
    const all = (data?.data?.procedures ?? []) as Procedure[];
    const mine = user?.id ? all.filter(p => p.doctorId === user.id) : all;
    const active = mine.filter(isCalendarProcedure);
    const map = new Map<string, Procedure[]>();
    active.forEach(p => {
      if (!p.scheduledAt) return;
      const k = toStr(new Date(p.scheduledAt));
      map.set(k, [...(map.get(k) ?? []), p]);
    });
    return map;
  }, [data, user?.id]);

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

  return (
    <PageShell className="pb-8" animate={false}>
      <PageHeader
        title={`${MONTHS[month]} ${year}`}
        className="[&>div:first-child>div:first-child]:hidden"
        right={
          <>
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
              <div key={d} className="text-center text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide py-1">
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
        <div className="bg-[var(--ds-surface)] border-b border-[var(--ds-border)]">
          {weeks.map((week, wi) => (
            <div key={wi} className="border-b border-[var(--ds-border)] grid grid-cols-7">
              {week.map((day, di) => {
                if (!day) return (
                  <div key={di} className="min-h-[80px] bg-[var(--surface-2)]/30" />
                );

                const ds     = toStr(day);
                const isToday = ds === todayStr;
                const procs   = byDate.get(ds) ?? [];
                const isOther = day.getMonth() !== month;

                return (
                  <div
                    key={di}
                    onClick={() => navigate(`/schedule/${ds}`)}
                    className={`
                      min-h-[80px] border-r border-[var(--ds-border)] last:border-r-0 p-1.5 cursor-pointer
                      transition-colors select-none
                      ${isOther ? "bg-[var(--surface-2)]/20" : "hover:bg-[var(--bg)]"}
                    `}
                  >
                    {/* Day number */}
                    <div className="flex justify-center mb-1.5">
                      <span className={`
                        w-7 h-7 flex items-center justify-center rounded-full text-body font-bold leading-none
                        ${isToday
                          ? "bg-[#1f75fe] text-white shadow-md"
                          : isOther
                            ? "text-[var(--text-subtle)]/40 font-normal"
                            : "text-[var(--text)]"}
                      `}>
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Event pills */}
                    <div className="space-y-0.5 px-0.5">
                      {procs.slice(0, 2).map(p => (
                        <div
                          key={p.id}
                          className={`
                            flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight truncate
                            ${STATUS_PILL[p.status as ProcedureStatus]}
                          `}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[p.status as ProcedureStatus]}`} />
                          <span className="truncate">{p.name}</span>
                        </div>
                      ))}
                      {procs.length > 2 && (
                        <p className="text-[9px] text-[var(--ds-primary)] font-semibold pl-1">
                          +{procs.length - 2} ещё
                        </p>
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
      <div className="mx-4 mt-4 p-3 bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md">
        <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Статусы</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["scheduled","in_progress","completed","cancelled"] as ProcedureStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
              <span className="text-[11px] text-[var(--text-secondary)]">{t(`procedure.status.${s}`)}</span>
            </div>
          ))}
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
