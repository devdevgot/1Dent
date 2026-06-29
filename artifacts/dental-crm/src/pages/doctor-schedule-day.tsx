import { useMemo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListProcedures, useListPatients,
  useListUsers, useListProcedureTemplates,
} from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft, ChevronRight,
  Clock, CheckCircle2, PlayCircle, XCircle, Calendar, Plus,
} from "lucide-react";
import { AppointmentModal } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import type { ProcedureTemplate } from "@/components/appointment-modal";
import { isCalendarProcedure } from "@/lib/calendar-procedures";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const HOUR_H  = 64;   // px per hour
const START_H = 8;
const END_H   = 21;

/* ─── Status colours ────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<ProcedureStatus, {
  bar: string; bg: string; text: string; badge: string; icon: string;
}> = {
  scheduled:   { bar: "bg-[#0284c7]", bg: "bg-[#e0f2fe]", text: "text-[#0284c7]", badge: "bg-[#e0f2fe] text-[#0284c7] border-[#bae6fd]", icon: "text-[#0284c7]" },
  in_progress: { bar: "bg-[#d97706]", bg: "bg-[#fef3c7]", text: "text-[#d97706]", badge: "bg-[#fef3c7] text-[#d97706] border-[#fde68a]", icon: "text-[#d97706]" },
  completed:   { bar: "bg-[#16a34a]", bg: "bg-[#f0fdf4]", text: "text-[#16a34a]", badge: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]", icon: "text-[#16a34a]" },
  cancelled:   { bar: "bg-[#94a3b8]", bg: "bg-[#f8fafc]", text: "text-[#64748b]", badge: "bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]", icon: "text-[#94a3b8]" },
};


const STATUS_ICONS: Record<ProcedureStatus, React.ElementType> = {
  scheduled: Clock, in_progress: PlayCircle, completed: CheckCircle2, cancelled: XCircle,
};

/* ─── Locale ────────────────────────────────────────────────────────────────── */
const DOW_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const MONTH_FULL = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const MONTH_GEN = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];
const DOW_FULL = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getWeek(date: Date): Date[] {
  // Mon-first week
  const dow  = (date.getDay() + 6) % 7; // 0=Mon
  const mon  = new Date(date);
  mon.setDate(date.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function minToPx(min: number) { return (min / 60) * HOUR_H; }

function timeMins(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function DoctorScheduleDayPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const params = useParams<{ date: string }>();

  const dateStr  = params.date ?? toStr(new Date());
  const selDate  = new Date(dateStr + "T00:00:00");
  const weekDays = getWeek(selDate);
  const todayStr = toStr(new Date());

  /* Modal state */
  const [showModal, setShowModal] = useState(false);

  /* Live clock */
  const [nowDate, setNowDate] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMins   = nowDate.getHours() * 60 + nowDate.getMinutes();
  const nowPx     = minToPx(nowMins - START_H * 60);
  const isToday   = dateStr === todayStr;
  const showNow   = isToday && nowMins >= START_H * 60 && nowMins < END_H * 60;

  /* Scroll to now */
  const tlRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tlRef.current) return;
    const top = isToday ? Math.max(0, nowPx - 100) : 0;
    tlRef.current.scrollTo({ top, behavior: "smooth" });
  }, [dateStr]);

  /* Data */
  const { data: pData }        = useListProcedures();
  const { data: ptData }       = useListPatients();
  const { data: userData }     = useListUsers();
  const { data: templateData } = useListProcedureTemplates();

  const patients = useMemo(() => {
    const m = new Map<string, string>();
    (ptData?.data?.patients ?? []).forEach(p => m.set(p.id, p.name));
    return m;
  }, [ptData]);

  const dayProcs = useMemo(() => {
    const all = (pData?.data?.procedures ?? []) as Procedure[];
    const mine = user?.id ? all.filter(p => p.doctorId === user.id) : all;
    return mine
      .filter(p => isCalendarProcedure(p) && toStr(new Date(p.scheduledAt!)) === dateStr)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [pData, user?.id, dateStr]);

  /* Modal data */
  const patientsForModal = useMemo(
    () => (ptData?.data?.patients ?? []).map((p) => ({
      id: p.id, name: p.name,
      phone: (p as any).phone ?? "",
      iin:   (p as any).iin   ?? null,
      doctorId: (p as any).doctorId ?? null,
    })),
    [ptData],
  );
  const doctorsForModal = useMemo(
    () => (userData?.data?.users ?? [])
      .filter((u) => u.role === "doctor")
      .map((u) => ({ id: u.id, name: u.name })),
    [userData],
  );
  const templatesForModal: ProcedureTemplate[] = useMemo(
    () => (templateData?.data?.templates ?? []) as ProcedureTemplate[],
    [templateData],
  );
  const apptSave = useAppointmentSave({ onDone: () => setShowModal(false) });

  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const totalH = (END_H - START_H) * HOUR_H;

  /* Week nav */
  const goWeekPrev = () => {
    const d = new Date(selDate);
    d.setDate(d.getDate() - 7);
    navigate(`/schedule/${toStr(d)}`);
  };
  const goWeekNext = () => {
    const d = new Date(selDate);
    d.setDate(d.getDate() + 7);
    navigate(`/schedule/${toStr(d)}`);
  };

  return (
    <div className="flex flex-col h-full bg-[#faf8f4] font-manrope overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-none bg-white border-b border-[#e8e3d9] shadow-sm">
        {/* Back row */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <button
            onClick={() => navigate("/schedule")}
            className="flex items-center gap-1 text-[#1f75fe] font-semibold text-sm hover:text-[#1a65e8] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {MONTH_FULL[selDate.getMonth()]}
          </button>
        </div>

        {/* Week strip */}
        <div className="flex items-center px-1 pb-2">
          <button onClick={goWeekPrev} className="w-7 h-7 flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1ede4] rounded-xl transition-colors shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 grid grid-cols-7">
            {weekDays.map((d, i) => {
              const ds    = toStr(d);
              const isSel = ds === dateStr;
              const isNow = ds === todayStr;
              return (
                <button
                  key={i}
                  onClick={() => navigate(`/schedule/${ds}`)}
                  className="flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors"
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSel ? "text-[#1f75fe]" : "text-[#64748b]"}`}>
                    {DOW_SHORT[(d.getDay())]}
                  </span>
                  <span className={`
                    w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all
                    ${isSel && isNow  ? "bg-[#1f75fe] text-white shadow-lg"
                    : isSel           ? "bg-[#1f75fe]/10 text-[#1f75fe]"
                    : isNow           ? "text-[#1f75fe]"
                    :                   "text-[#0f172a]"}
                  `}>
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <button onClick={goWeekNext} className="w-7 h-7 flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1ede4] rounded-xl transition-colors shrink-0">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Date label */}
        <div className="px-4 py-2 border-t border-[#e8e3d9] bg-[#faf8f4] flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-[#0f172a]">
              {DOW_FULL[selDate.getDay()]} — {selDate.getDate()} {MONTH_GEN[selDate.getMonth()]} {selDate.getFullYear()} г.
            </p>
            <p className="text-[11px] text-[#64748b] mt-0.5">
              {dayProcs.length > 0
                ? `${dayProcs.length} ${dayProcs.length === 1 ? "приём" : dayProcs.length < 5 ? "приёма" : "приёмов"}`
                : "Нет приёмов"}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1f75fe] text-white text-xs font-semibold hover:bg-[#1a65e8] hover:scale-105 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Новая запись
          </button>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div ref={tlRef} className="flex-1 overflow-y-auto bg-white border-t border-[#e8e3d9]">
        <div className="relative" style={{ height: totalH + HOUR_H }}>

          {/* Hour grid */}
          {hours.map(h => (
            <div
              key={h}
              className="absolute left-0 right-0 flex items-start pointer-events-none"
              style={{ top: (h - START_H) * HOUR_H }}
            >
              <span className="w-14 shrink-0 text-right pr-3 text-[11px] text-[#64748b] font-medium leading-none -translate-y-[6px] select-none">
                {h < END_H ? `${String(h).padStart(2,"0")}:00` : ""}
              </span>
              <div className="flex-1 border-t border-[#e8e3d9]" />
            </div>
          ))}

          {/* Current time */}
          {showNow && (
            <div
              className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: nowPx }}
            >
              <div className="w-14 shrink-0 flex justify-end pr-2">
                <span className="text-[10px] font-bold bg-[#1f75fe] text-white rounded-full px-1.5 py-0.5 leading-tight shadow-md">
                  {nowDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex-1 h-px bg-[#1f75fe] shadow-sm" />
            </div>
          )}

          {/* Events — only scheduled / in-progress appointments */}
          {dayProcs.map(proc => {
            if (!proc.scheduledAt) return null;
            const startMin = timeMins(proc.scheduledAt);
            if (startMin < START_H * 60 || startMin >= END_H * 60) return null;
            const top    = minToPx(startMin - START_H * 60);
            const height = Math.max(minToPx(60), 44);
            const sc     = STATUS_COLORS[proc.status as ProcedureStatus];
            const Icon   = STATUS_ICONS[proc.status as ProcedureStatus];
            const patient = patients.get(proc.patientId);

            return (
              <div
                key={proc.id}
                className={`absolute left-14 right-3 rounded-xl overflow-hidden flex ${sc.bg}`}
                style={{ top: top + 2, height: height - 4 }}
              >
                {/* Left accent bar */}
                <div className={`w-1 shrink-0 ${sc.bar}`} />

                <div className="flex-1 px-2.5 py-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className={`text-[12px] font-bold leading-snug ${sc.text} truncate flex-1`}>
                      {proc.name}
                    </p>
                    <span className={`inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.badge}`}>
                      <Icon className="w-2.5 h-2.5" />
                      {t(`procedure.status.${proc.status}`)}
                    </span>
                  </div>

                  <div className={`flex items-center gap-2 mt-0.5 text-[11px] ${sc.text} opacity-80`}>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {fmtTime(proc.scheduledAt)}
                      {" — "}
                      {fmtTime(new Date(new Date(proc.scheduledAt).getTime() + 3600_000).toISOString())}
                    </span>
                    {patient && (
                      <span className="truncate opacity-70">· {patient}</span>
                    )}
                  </div>

                  {proc.notes && height > 60 && (
                    <p className={`text-[10px] ${sc.text} opacity-60 mt-0.5 truncate`}>
                      {proc.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {dayProcs.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-14 h-14 rounded-2xl bg-[#f1ede4] flex items-center justify-center">
                <Calendar className="w-7 h-7 text-[#94a3b8]" />
              </div>
              <p className="text-sm font-semibold text-[#64748b]">Нет приёмов на этот день</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Appointment modal ── */}
      {showModal && (
        <AppointmentModal
          date={selDate}
          procedure={null}
          patients={patientsForModal}
          doctors={doctorsForModal}
          templates={templatesForModal}
          defaultDoctorId={user?.id}
          onSave={(data) => apptSave.save(data, null)}
          onClose={() => setShowModal(false)}
          isSaving={apptSave.isSaving}
        />
      )}
    </div>
  );
}
