import { useMemo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useListProcedures, useListPatients } from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import { buildMockSchedule } from "@/lib/mock-schedule";
import {
  ChevronLeft, ChevronRight,
  Clock, CheckCircle2, PlayCircle, XCircle, Calendar,
} from "lucide-react";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const HOUR_H  = 64;   // px per hour
const START_H = 8;
const END_H   = 21;

/* ─── Status colours ────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<ProcedureStatus, {
  bar: string; bg: string; text: string; badge: string; icon: string;
}> = {
  scheduled:   { bar: "bg-blue-500",    bg: "bg-blue-50",    text: "text-blue-800",    badge: "bg-blue-100 text-blue-700 border-blue-200",    icon: "text-blue-500"    },
  in_progress: { bar: "bg-amber-400",   bg: "bg-amber-50",   text: "text-amber-800",   badge: "bg-amber-100 text-amber-700 border-amber-200",   icon: "text-amber-500"   },
  completed:   { bar: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "text-emerald-500" },
  cancelled:   { bar: "bg-slate-300",   bg: "bg-slate-50",   text: "text-slate-600",   badge: "bg-slate-100 text-slate-500 border-slate-200",   icon: "text-slate-400"   },
};

/* ─── Index-based palette (for variety when status = scheduled) ─────────────── */
const EVENT_PALETTE = [
  { bar: "#16a34a", bg: "#f0fdf4", text: "#14532d", badgeBg: "#dcfce7", badgeText: "#15803d", badgeBorder: "#bbf7d0" },
  { bar: "#2563eb", bg: "#eff6ff", text: "#1e3a8a", badgeBg: "#dbeafe", badgeText: "#1d4ed8", badgeBorder: "#bfdbfe" },
  { bar: "#ca8a04", bg: "#fefce8", text: "#713f12", badgeBg: "#fef9c3", badgeText: "#a16207", badgeBorder: "#fde68a" },
  { bar: "#9333ea", bg: "#fdf4ff", text: "#581c87", badgeBg: "#f3e8ff", badgeText: "#7e22ce", badgeBorder: "#e9d5ff" },
  { bar: "#ea580c", bg: "#fff7ed", text: "#7c2d12", badgeBg: "#ffedd5", badgeText: "#c2410c", badgeBorder: "#fed7aa" },
  { bar: "#0891b2", bg: "#ecfeff", text: "#164e63", badgeBg: "#cffafe", badgeText: "#0e7490", badgeBorder: "#a5f3fc" },
  { bar: "#be185d", bg: "#fdf2f8", text: "#831843", badgeBg: "#fce7f3", badgeText: "#9d174d", badgeBorder: "#fbcfe8" },
];

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
  const { data: pData } = useListProcedures();
  const { data: ptData } = useListPatients();

  const patients = useMemo(() => {
    const m = new Map<string, string>();
    (ptData?.data?.patients ?? []).forEach(p => m.set(p.id, p.name));
    return m;
  }, [ptData]);

  const dayProcs = useMemo(() => {
    const all = (pData?.data?.procedures ?? []) as Procedure[];
    const mine = user?.id ? all.filter(p => p.doctorId === user.id) : all;
    const source = mine.length > 0 ? mine : buildMockSchedule(user?.id ?? "mock");
    return source
      .filter(p => p.scheduledAt && toStr(new Date(p.scheduledAt)) === dateStr)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [pData, user?.id, dateStr]);

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
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-none bg-white border-b border-border">
        {/* Back row */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <button
            onClick={() => navigate("/schedule")}
            className="flex items-center gap-1 text-primary font-semibold text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            {MONTH_FULL[selDate.getMonth()]}
          </button>
        </div>

        {/* Week strip */}
        <div className="flex items-center px-1 pb-2">
          <button onClick={goWeekPrev} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
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
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSel ? "text-primary" : "text-muted-foreground"}`}>
                    {DOW_SHORT[(d.getDay())]}
                  </span>
                  <span className={`
                    w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all
                    ${isSel && isNow  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : isSel           ? "bg-foreground text-background"
                    : isNow           ? "text-primary"
                    :                   "text-foreground"}
                  `}>
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <button onClick={goWeekNext} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Date label */}
        <div className="px-4 py-2 border-t border-border/50 bg-secondary/40">
          <p className="text-[13px] font-bold text-foreground">
            {DOW_FULL[selDate.getDay()]} — {selDate.getDate()} {MONTH_GEN[selDate.getMonth()]} {selDate.getFullYear()} г.
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {dayProcs.length > 0
              ? `${dayProcs.length} ${dayProcs.length === 1 ? "приём" : dayProcs.length < 5 ? "приёма" : "приёмов"}`
              : "Нет приёмов"}
          </p>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div ref={tlRef} className="flex-1 overflow-y-auto bg-white">
        <div className="relative" style={{ height: totalH + HOUR_H }}>

          {/* Hour grid */}
          {hours.map(h => (
            <div
              key={h}
              className="absolute left-0 right-0 flex items-start pointer-events-none"
              style={{ top: (h - START_H) * HOUR_H }}
            >
              <span className="w-14 shrink-0 text-right pr-3 text-[11px] text-muted-foreground font-medium leading-none -translate-y-[6px] select-none">
                {h < END_H ? `${String(h).padStart(2,"0")}:00` : ""}
              </span>
              <div className="flex-1 border-t border-border/50" />
            </div>
          ))}

          {/* Current time */}
          {showNow && (
            <div
              className="absolute left-0 right-0 flex items-center z-20 pointer-events-none"
              style={{ top: nowPx }}
            >
              <div className="w-14 shrink-0 flex justify-end pr-2">
                <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 leading-tight shadow-md shadow-primary/30">
                  {nowDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex-1 h-px bg-primary shadow-sm" />
            </div>
          )}

          {/* Events */}
          {dayProcs.map((proc, idx) => {
            if (!proc.scheduledAt) return null;
            const startMin = timeMins(proc.scheduledAt);
            if (startMin < START_H * 60 || startMin >= END_H * 60) return null;
            const top    = minToPx(startMin - START_H * 60);
            const height = Math.max(minToPx(60), 44);
            const Icon   = STATUS_ICONS[proc.status as ProcedureStatus];
            const patient = patients.get(proc.patientId);

            // Use index-based palette for "scheduled" to add color variety;
            // keep status-based colors for in_progress / completed / cancelled
            const isScheduled = proc.status === "scheduled";
            const pal = EVENT_PALETTE[idx % EVENT_PALETTE.length]!;
            const sc  = STATUS_COLORS[proc.status as ProcedureStatus];

            return (
              <div
                key={proc.id}
                className="absolute left-14 right-3 rounded-xl overflow-hidden flex"
                style={{
                  top: top + 2,
                  height: height - 4,
                  backgroundColor: isScheduled ? pal.bg : undefined,
                }}
              >
                {/* Left accent bar */}
                {isScheduled
                  ? <div className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: pal.bar }} />
                  : <div className={`w-1 shrink-0 rounded-l-xl ${sc.bar}`} />
                }

                <div className="flex-1 px-2.5 py-1.5 min-w-0" style={{ backgroundColor: isScheduled ? pal.bg : undefined }}>
                  <div className="flex items-start justify-between gap-1">
                    <p
                      className="text-[12px] font-bold leading-snug truncate flex-1"
                      style={{ color: isScheduled ? pal.text : undefined }}
                    >
                      {proc.name}
                    </p>
                    <span
                      className={`inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${!isScheduled ? sc.badge : ""}`}
                      style={isScheduled ? {
                        backgroundColor: pal.badgeBg,
                        color: pal.badgeText,
                        borderColor: pal.badgeBorder,
                      } : undefined}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {t(`procedure.status.${proc.status}`)}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-2 mt-0.5 text-[11px] opacity-80"
                    style={{ color: isScheduled ? pal.text : undefined }}
                  >
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
                    <p
                      className="text-[10px] opacity-60 mt-0.5 truncate"
                      style={{ color: isScheduled ? pal.text : undefined }}
                    >
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
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <Calendar className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">Нет приёмов на этот день</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
