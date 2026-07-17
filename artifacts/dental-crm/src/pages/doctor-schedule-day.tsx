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
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Bone } from "@/components/skeletons";
import { seesClinicSchedule } from "@/lib/role-groups";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { usePageBack } from "@/hooks/use-page-back";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const HOUR_H  = 64;   // px per hour
const START_H = 0;    // full day — no working-hours restriction
const END_H   = 24;
const DEFAULT_SCROLL_HOUR = 8; // where to land when the day has no appointments

/* ─── Status colours ────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<ProcedureStatus, {
  bar: string; bg: string; text: string; badge: string; icon: string;
}> = {
  scheduled:   { bar: "bg-[#0284c7]", bg: "bg-[#e0f2fe]", text: "text-[#0284c7]", badge: "bg-[#e0f2fe] text-[#0284c7] border-[#bae6fd]", icon: "text-[#0284c7]" },
  in_progress: { bar: "bg-[var(--warning)]", bg: "bg-[#fef3c7]", text: "text-[#d97706]", badge: "bg-[#fef3c7] text-[#d97706] border-[#fde68a]", icon: "text-[#d97706]" },
  completed:   { bar: "bg-[var(--success)]", bg: "bg-[#f0fdf4]", text: "text-[#16a34a]", badge: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]", icon: "text-[#16a34a]" },
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

function parseDateParam(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime()) || toStr(d) !== dateStr) return null;
  return d;
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

/** iPhone-calendar-style overlap layout: column index + column count per event. */
function layoutOverlaps(procs: Procedure[]): Map<string, { col: number; cols: number }> {
  const result = new Map<string, { col: number; cols: number }>();
  const events = procs
    .filter((p) => p.scheduledAt)
    .map((p) => ({ id: p.id, start: timeMins(p.scheduledAt!), end: timeMins(p.scheduledAt!) + 60 }))
    .sort((a, b) => a.start - b.start);

  let cluster: typeof events = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const assigned = cluster.map((ev) => {
      let col = colEnds.findIndex((end) => end <= ev.start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = ev.end;
      return { ev, col };
    });
    for (const { ev, col } of assigned) {
      result.set(ev.id, { col, cols: colEnds.length });
    }
    cluster = [];
  };

  for (const ev of events) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();

  return result;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function DoctorScheduleDayPage({
  overlayDate,
}: {
  overlayDate?: string;
} = {}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const { isOverlay, popStack } = useOverlayNavigation();
  const params = useParams<{ date: string }>();

  const dateStr = overlayDate ?? params.date ?? toStr(new Date());
  const selDate = parseDateParam(dateStr);

  useEffect(() => {
    if (!selDate) {
      if (isOverlay) popStack();
      else navigate("/schedule", { replace: true });
    }
  }, [selDate, navigate, isOverlay, popStack]);

  if (!selDate) return null;

  return <DoctorScheduleDayContent dateStr={dateStr} selDate={selDate} />;
}

function DoctorScheduleDayContent({ dateStr, selDate }: { dateStr: string; selDate: Date }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const clinicWideSchedule = seesClinicSchedule(user?.role);
  const [, navigate] = useLocation();
  const { isOverlay, pushDate } = useOverlayNavigation();
  const goBack = usePageBack();

  const weekDays = getWeek(selDate);
  const todayStr = toStr(new Date());

  /* Modal state: undefined = closed, null = create, Procedure = edit */
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null | undefined>(undefined);
  /* Prefilled create time from a timeline tap (iPhone-calendar style) */
  const [createDate, setCreateDate] = useState<Date | null>(null);

  /* Live clock */
  const [nowDate, setNowDate] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMins   = nowDate.getHours() * 60 + nowDate.getMinutes();
  const nowPx     = minToPx(nowMins - START_H * 60);
  const isToday   = dateStr === todayStr;
  const showNow   = isToday;

  /* Timeline container */
  const tlRef = useRef<HTMLDivElement>(null);

  /* Data */
  const { data: pData, isLoading: proceduresLoading } = useListProcedures();
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
    const mine = clinicWideSchedule || !user?.id ? all : all.filter(p => p.doctorId === user.id);
    return mine
      .filter(p => isCalendarProcedure(p) && toStr(new Date(p.scheduledAt!)) === dateStr)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [pData, user?.id, dateStr, clinicWideSchedule]);

  const visibleProcs = dayProcs;
  const overlapLayout = useMemo(() => layoutOverlaps(dayProcs), [dayProcs]);

  /* Scroll to now / first appointment / working-day start */
  const firstProcMins = dayProcs.length && dayProcs[0].scheduledAt
    ? timeMins(dayProcs[0].scheduledAt)
    : null;
  useEffect(() => {
    if (!tlRef.current) return;
    const anchorMins = isToday
      ? nowMins
      : firstProcMins ?? DEFAULT_SCROLL_HOUR * 60;
    const top = Math.max(0, minToPx(anchorMins - START_H * 60) - 120);
    tlRef.current.scrollTo({ top, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, proceduresLoading]);

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
  const apptSave = useAppointmentSave({ onDone: () => setEditingProcedure(undefined) });

  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const totalH = (END_H - START_H) * HOUR_H;

  /* Week nav */
  const goToDate = (d: Date, replace = false) => {
    const ds = toStr(d);
    if (isOverlay) pushDate(ds, replace);
    else navigate(`/schedule/${ds}`, { replace });
  };

  const goWeekPrev = () => {
    const d = new Date(selDate);
    d.setDate(d.getDate() - 7);
    goToDate(d);
  };
  const goWeekNext = () => {
    const d = new Date(selDate);
    d.setDate(d.getDate() + 7);
    goToDate(d);
  };

  const appointmentSubtitle =
    dayProcs.length > 0
      ? `${dayProcs.length} ${dayProcs.length === 1 ? "приём" : dayProcs.length < 5 ? "приёма" : "приёмов"}`
      : "Нет приёмов";

  return (
    <PageShell className="flex flex-col h-full overflow-hidden" animate={false}>
      <PageHeader
        title={`${DOW_FULL[selDate.getDay()]} — ${selDate.getDate()} ${MONTH_GEN[selDate.getMonth()]} ${selDate.getFullYear()} г.`}
        subtitle={appointmentSubtitle}
        onBack={goBack}
        backLabel={MONTH_FULL[selDate.getMonth()]}
        right={
          <>
            {!isToday && (
              <button
                type="button"
                onClick={() => goToDate(new Date(), true)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#1f75fe] bg-[var(--primary-light)] hover:bg-[#1f75fe]/15 transition-colors"
              >
                Сегодня
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditingProcedure(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--ds-primary)] text-white text-xs font-semibold hover:bg-[#1a65e8] hover:scale-105 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Новая запись
            </button>
          </>
        }
        bottom={
          <div className="flex items-center">
            <PageHeaderIconButton onClick={goWeekPrev} title="Предыдущая неделя">
              <ChevronLeft className="w-4 h-4" />
            </PageHeaderIconButton>

            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((d, i) => {
                const ds    = toStr(d);
                const isSel = ds === dateStr;
                const isNow = ds === todayStr;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToDate(d, true)}
                    className="flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors"
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSel ? "text-[#1f75fe]" : "text-[#64748b]"}`}>
                      {DOW_SHORT[(d.getDay())]}
                    </span>
                    <span className={`
                      w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all
                      ${isSel && isNow  ? "bg-[var(--ds-primary)] text-white shadow-lg"
                      : isSel           ? "bg-[var(--primary-light)] text-[#1f75fe]"
                      : isNow           ? "text-[#1f75fe]"
                      :                   "text-[#0f172a]"}
                    `}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            <PageHeaderIconButton onClick={goWeekNext} title="Следующая неделя">
              <ChevronRight className="w-4 h-4" />
            </PageHeaderIconButton>
          </div>
        }
      />

      {/* ── Timeline ── */}
      <div ref={tlRef} className="flex-1 overflow-y-auto bg-white border-t border-[#e8e3d9]">
        <div
          className="relative"
          style={{ height: totalH + HOUR_H }}
          onClick={(e) => {
            // Tap on empty space → create appointment at that half-hour (iPhone style)
            if (e.target !== e.currentTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const mins = Math.floor((y / HOUR_H) * 60 / 30) * 30 + START_H * 60;
            const d = new Date(selDate);
            d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
            setCreateDate(d);
            setEditingProcedure(null);
          }}
        >

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
                <span className="text-[10px] font-bold bg-[var(--ds-primary)] text-white rounded-full px-1.5 py-0.5 leading-tight shadow-md">
                  {nowDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex-1 relative">
                <div className="h-[2px] bg-[var(--ds-primary)] shadow-sm rounded-full" />
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--ds-primary)]" />
              </div>
            </div>
          )}

          {/* Events — side-by-side columns when overlapping (iPhone style) */}
          {visibleProcs.map(proc => {
            if (!proc.scheduledAt) return null;
            const startMin = timeMins(proc.scheduledAt);
            const top    = minToPx(startMin - START_H * 60);
            const height = Math.max(minToPx(60), 44);
            const sc     = STATUS_COLORS[proc.status as ProcedureStatus];
            const Icon   = STATUS_ICONS[proc.status as ProcedureStatus];
            const patient = patients.get(proc.patientId);
            const layout = overlapLayout.get(proc.id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / layout.cols;

            return (
              <button
                key={proc.id}
                type="button"
                onClick={() => setEditingProcedure(proc)}
                className={`absolute rounded-xl overflow-hidden flex text-left cursor-pointer hover:ring-2 hover:ring-[var(--ds-primary)]/30 hover:z-10 transition-shadow ${sc.bg}`}
                style={{
                  top: top + 2,
                  height: height - 4,
                  left: `calc(3.5rem + (100% - 3.5rem - 0.75rem) * ${(layout.col * widthPct) / 100})`,
                  width: `calc((100% - 3.5rem - 0.75rem) * ${widthPct / 100} - ${layout.cols > 1 ? 3 : 0}px)`,
                }}
              >
                {/* Left accent bar */}
                <div className={`w-1 shrink-0 ${sc.bar}`} />

                <div className="flex-1 px-2.5 py-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className={`text-[12px] font-bold leading-snug ${sc.text} truncate flex-1`}>
                      {proc.name}
                    </p>
                    {layout.cols === 1 && (
                      <span className={`inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.badge}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {t(`procedure.status.${proc.status}`)}
                      </span>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 mt-0.5 text-[11px] ${sc.text} opacity-80`}>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {fmtTime(proc.scheduledAt)}
                      {layout.cols === 1 && (
                        <>
                          {" — "}
                          {fmtTime(new Date(new Date(proc.scheduledAt).getTime() + 3600_000).toISOString())}
                        </>
                      )}
                    </span>
                    {patient && (
                      <span className="truncate opacity-70">· {patient}</span>
                    )}
                  </div>

                  {proc.notes && height > 60 && layout.cols === 1 && (
                    <p className={`text-[10px] ${sc.text} opacity-60 mt-0.5 truncate`}>
                      {proc.notes}
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {/* Loading: appointment-block silhouettes over the hour grid */}
          {proceduresLoading && (
            <div className="absolute left-14 right-3 top-0 pointer-events-none">
              <Bone className="absolute w-3/4 h-14 rounded-xl" style={{ top: HOUR_H * 9 + 2 }} />
              <Bone className="absolute w-2/3 h-14 rounded-xl" style={{ top: HOUR_H * 11 + 2 }} />
              <Bone className="absolute w-3/4 h-14 rounded-xl" style={{ top: HOUR_H * 13 + 2 }} />
            </div>
          )}

          {/* Empty state */}
          {!proceduresLoading && dayProcs.length === 0 && (
            <div
              className="absolute left-0 right-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
              style={{ top: DEFAULT_SCROLL_HOUR * HOUR_H, height: HOUR_H * 5 }}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#f1ede4] flex items-center justify-center">
                <Calendar className="w-7 h-7 text-[#94a3b8]" />
              </div>
              <p className="text-sm font-semibold text-[#64748b]">Нет приёмов на этот день</p>
              <p className="text-xs text-[#94a3b8]">Нажмите на свободное время, чтобы записать</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Appointment modal ── */}
      {editingProcedure !== undefined && (
        <AppointmentModal
          date={editingProcedure ? selDate : (createDate ?? selDate)}
          procedure={editingProcedure}
          patients={patientsForModal}
          doctors={doctorsForModal}
          templates={templatesForModal}
          defaultDoctorId={user?.id}
          onSave={(data) => apptSave.save(data, editingProcedure)}
          onDelete={editingProcedure ? () => apptSave.remove(editingProcedure.id) : undefined}
          onClose={() => { setEditingProcedure(undefined); setCreateDate(null); }}
          isSaving={apptSave.isSaving}
        />
      )}
    </PageShell>
  );
}
