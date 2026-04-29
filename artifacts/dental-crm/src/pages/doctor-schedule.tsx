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
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { AppointmentModal } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import type { ProcedureTemplate } from "@/components/appointment-modal";

/* ─── Status colours ────────────────────────────────────────────────────────── */
const STATUS_PILL: Record<ProcedureStatus, string> = {
  scheduled:   "bg-blue-50   text-blue-600",
  in_progress: "bg-amber-50  text-amber-600",
  completed:   "bg-emerald-50 text-emerald-600",
  cancelled:   "bg-slate-100 text-slate-400",
};

const STATUS_DOT: Record<ProcedureStatus, string> = {
  scheduled:   "bg-blue-400",
  in_progress: "bg-amber-400",
  completed:   "bg-emerald-400",
  cancelled:   "bg-slate-300",
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

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [modalDate, setModalDate] = useState<Date | null>(null);

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

  /* Group procedures by local date — completed hidden from calendar */
  const byDate = useMemo(() => {
    const all = (data?.data?.procedures ?? []) as Procedure[];
    const mine = user?.id ? all.filter(p => p.doctorId === user.id) : all;
    const active = mine.filter(p => p.status !== "completed");
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

  const todayStr = toStr(now);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const next = () => { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); };

  return (
    <div className="min-h-full bg-background pb-8">

      {/* ── Header ── */}
      <div className="bg-white border-b border-border px-4 pt-5 pb-4">
        <div className="flex items-end justify-between mb-1">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-0.5">
              {year}
            </p>
            <h1 className="text-3xl font-black font-display text-foreground leading-none">
              {MONTHS[month]}
            </h1>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <button
              onClick={prev}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={next}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setModalDate(now)}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary text-white hover:bg-primary/90 transition-colors ml-1"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Weekday row */}
        <div className="grid grid-cols-7 mt-3">
          {DOW.map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide py-1">
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* ── Calendar body ── */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white">
          {weeks.map((week, wi) => (
            <div key={wi} className="border-b border-border/60 grid grid-cols-7">
              {week.map((day, di) => {
                if (!day) return (
                  <div key={di} className="min-h-[80px] bg-secondary/30" />
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
                      min-h-[80px] border-r border-border/60 last:border-r-0 p-1.5 cursor-pointer
                      transition-colors select-none
                      ${isOther ? "bg-secondary/20" : "hover:bg-primary/5"}
                    `}
                  >
                    {/* Day number */}
                    <div className="flex justify-center mb-1.5">
                      <span className={`
                        w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold leading-none
                        ${isToday
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                          : isOther
                            ? "text-muted-foreground/40 font-normal"
                            : "text-foreground"}
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
                        <p className="text-[9px] text-primary font-semibold pl-1">
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
      <div className="mx-4 mt-4 p-3 bg-white rounded-2xl border border-border shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Статусы</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["scheduled","in_progress","completed","cancelled"] as ProcedureStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
              <span className="text-[11px] text-muted-foreground">{t(`procedure.status.${s}`)}</span>
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
    </div>
  );
}
