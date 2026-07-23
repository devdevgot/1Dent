import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProcedures, useListPatients,
  useListUsers, useListProcedureTemplates,
  useUpdateProcedure,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft, ChevronRight,
  Clock, CheckCircle2, PlayCircle, XCircle, Plus, Lock,
} from "lucide-react";
import { AppointmentModal } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";
import type { ProcedureTemplate } from "@/components/appointment-modal";
import { isCalendarProcedure, isScheduleLockedProcedure } from "@/lib/calendar-procedures";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Bone } from "@/components/skeletons";
import { filterTreatingDoctors, seesClinicSchedule, treatingDoctorLabel } from "@/lib/role-groups";
import { clinicTimeMins, toClinicDateStr } from "@/lib/clinic-timezone";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";
import { usePageBack } from "@/hooks/use-page-back";
import { haptic, hapticNotify } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const HOUR_H  = 64;   // px per hour
const START_H = 0;    // full day — no working-hours restriction
const END_H   = 24;
const DEFAULT_SCROLL_HOUR = 8; // where to land when the day has no appointments
const LONG_PRESS_MS = 320;     // hold duration before drag-to-create kicks in
/** Hold before drag-to-move (matches Kanban TouchSensor delay). */
const MOVE_LONG_PRESS_MS = 180;
/** Movement beyond this before the hold fires cancels drag (scroll / tap). */
const PRESS_TOLERANCE_PX = 5;
const SNAP_MIN = 15;           // drag snaps to 15-minute steps
const NEW_SLOT_DURATION = 60;  // appointment / create block height = 1 hour
/** Distance from viewport edge that starts auto-scroll while dragging. */
const DRAG_EDGE_PX = 64;
/** Peak auto-scroll speed (px/sec) when finger is hard against the edge. */
const DRAG_SCROLL_MAX_PX_S = 920;

type TimelineDragMode = "create" | "move";

type TimelinePress = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  mode: TimelineDragMode;
  /** Appointment being moved (mode === "move"). */
  procId?: string;
  /** Snapshot used to persist the new scheduledAt on drop. */
  proc?: Procedure;
  /** Minutes from block start to the grab point (mode === "move"). */
  grabOffsetMins?: number;
};

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
const toStr = toClinicDateStr;

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
  return clinicTimeMins(iso);
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

function fmtMins(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
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

  /* Day nav */
  const goToDate = useCallback((d: Date, replace = false) => {
    const ds = toStr(d);
    if (isOverlay) pushDate(ds, replace);
    else navigate(`/schedule/${ds}`, { replace });
  }, [isOverlay, pushDate, navigate]);

  /* Slide-in animation when the day changes (swipe / week strip) */
  const [slideClass, setSlideClass] = useState("");
  const prevDateRef = useRef(dateStr);
  useEffect(() => {
    if (prevDateRef.current === dateStr) return;
    const forward = dateStr > prevDateRef.current;
    prevDateRef.current = dateStr;
    setSlideClass(
      forward
        ? "animate-in slide-in-from-right-8 fade-in duration-200"
        : "animate-in slide-in-from-left-8 fade-in duration-200",
    );
  }, [dateStr]);

  /* Live clock */
  const [nowDate, setNowDate] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMins   = clinicTimeMins(nowDate.toISOString());
  const nowPx     = minToPx(nowMins - START_H * 60);
  const isToday   = dateStr === todayStr;
  const showNow   = isToday;

  /* Timeline container */
  const tlRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /* ── Drag interactions (Apple Calendar + Kanban hold-to-drag) ──
     • Empty space long-press → create a 1-hour slot that follows the finger
     • Hold an existing appointment, then drag → reschedule (snap 15 min)
     Near the viewport edges the timeline auto-scrolls. */
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dragVisualMins, setDragVisualMins] = useState<number | null>(null);
  const [dragSnapMins, setDragSnapMins] = useState<number | null>(null);
  const [movingProcId, setMovingProcId] = useState<string | null>(null);
  /** Keep the block at the dropped time until the list refetch catches up. */
  const [optimisticScheduledAt, setOptimisticScheduledAt] = useState<Record<string, string>>({});
  const pressRef = useRef<TimelinePress | null>(null);
  const suppressClickRef = useRef(false);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollLastTsRef = useRef(0);
  const dragClientYRef = useRef(0);

  const blockTouchScroll = useCallback((e: TouchEvent) => { e.preventDefault(); }, []);

  const clampSlotStart = useCallback((mins: number) => {
    return Math.min(Math.max(mins, 0), 24 * 60 - NEW_SLOT_DURATION);
  }, []);

  /** Absolute minutes of day under a clientY on the timeline content. */
  const clientYToMins = useCallback((clientY: number) => {
    const el = contentRef.current;
    if (!el) return 0;
    const y = clientY - el.getBoundingClientRect().top;
    return (y / HOUR_H) * 60 + START_H * 60;
  }, []);

  /** Continuous start minutes for create (block centered on touch). */
  const yToCreateRawMins = useCallback((clientY: number) => {
    return clampSlotStart(clientYToMins(clientY) - NEW_SLOT_DURATION / 2);
  }, [clampSlotStart, clientYToMins]);

  const snapMins = useCallback((raw: number) => {
    return clampSlotStart(Math.round(raw / SNAP_MIN) * SNAP_MIN);
  }, [clampSlotStart]);

  const applyDragFromClientY = useCallback((clientY: number) => {
    const p = pressRef.current;
    let raw: number;
    if (p?.mode === "move" && p.grabOffsetMins != null) {
      raw = clampSlotStart(clientYToMins(clientY) - p.grabOffsetMins);
    } else {
      raw = yToCreateRawMins(clientY);
    }
    setDragVisualMins(raw);
    setDragSnapMins(snapMins(raw));
  }, [clampSlotStart, clientYToMins, yToCreateRawMins, snapMins]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    autoScrollLastTsRef.current = 0;
  }, []);

  const tickAutoScroll = useCallback((ts: number) => {
    const tl = tlRef.current;
    const p = pressRef.current;
    if (!tl || !p?.active) {
      stopAutoScroll();
      return;
    }

    const last = autoScrollLastTsRef.current || ts;
    const dt = Math.min(0.048, Math.max(0, (ts - last) / 1000));
    autoScrollLastTsRef.current = ts;

    const rect = tl.getBoundingClientRect();
    const y = dragClientYRef.current;
    let speed = 0; // px/sec

    if (y < rect.top + DRAG_EDGE_PX) {
      const t = Math.min(1, Math.max(0, (rect.top + DRAG_EDGE_PX - y) / DRAG_EDGE_PX));
      // Ease-in so scrolling ramps gently instead of jumping.
      speed = -DRAG_SCROLL_MAX_PX_S * t * t;
    } else if (y > rect.bottom - DRAG_EDGE_PX) {
      const t = Math.min(1, Math.max(0, (y - (rect.bottom - DRAG_EDGE_PX)) / DRAG_EDGE_PX));
      speed = DRAG_SCROLL_MAX_PX_S * t * t;
    }

    if (speed !== 0 && dt > 0) {
      const maxScroll = Math.max(0, tl.scrollHeight - tl.clientHeight);
      const next = Math.min(maxScroll, Math.max(0, tl.scrollTop + speed * dt));
      if (next !== tl.scrollTop) {
        tl.scrollTop = next;
        // Content moved under the finger — keep the ghost / block aligned.
        applyDragFromClientY(y);
      }
    }

    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, [applyDragFromClientY, stopAutoScroll]);

  const ensureAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) return;
    autoScrollLastTsRef.current = 0;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  }, [tickAutoScroll]);

  const openCreateAt = useCallback((mins: number) => {
    const d = new Date(selDate);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    setCreateDate(d);
    setEditingProcedure(null);
  }, [selDate]);

  const clearDragVisual = useCallback(() => {
    setDragVisualMins(null);
    setDragSnapMins(null);
    setMovingProcId(null);
  }, []);

  const cancelPress = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    if (p.active) {
      contentRef.current?.removeEventListener("touchmove", blockTouchScroll);
      suppressClickRef.current = true;
    }
    stopAutoScroll();
    pressRef.current = null;
    clearDragVisual();
  }, [blockTouchScroll, stopAutoScroll, clearDragVisual]);

  const activateDrag = useCallback((p: TimelinePress) => {
    if (p.active) return;
    p.active = true;
    haptic("light");
    contentRef.current?.addEventListener("touchmove", blockTouchScroll, { passive: false });
    if (p.mode === "move" && p.procId) setMovingProcId(p.procId);
    applyDragFromClientY(p.lastY);
    ensureAutoScroll();
  }, [blockTouchScroll, applyDragFromClientY, ensureAutoScroll]);

  const onTimelinePointerDown = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    if ((e.target as HTMLElement).closest("button")) return; // events use their own handler
    const { clientX, clientY, pointerId } = e;
    dragClientYRef.current = clientY;
    const timer = setTimeout(() => {
      const p = pressRef.current;
      if (!p || p.active || p.mode !== "create") return;
      activateDrag(p);
    }, LONG_PRESS_MS);
    pressRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      timer,
      active: false,
      mode: "create",
    };
  }, [activateDrag]);

  const onEventPointerDown = useCallback((e: React.PointerEvent, proc: Procedure) => {
    if (!e.isPrimary || !proc.scheduledAt) return;
    e.stopPropagation();
    // Completed / closed visits stay fixed on the timeline (procedure already happened).
    if (isScheduleLockedProcedure(proc)) return;
    const { clientX, clientY, pointerId } = e;
    dragClientYRef.current = clientY;
    const startMin = timeMins(proc.scheduledAt);
    const grabOffsetMins = Math.min(
      NEW_SLOT_DURATION - SNAP_MIN,
      Math.max(0, clientYToMins(clientY) - startMin),
    );
    // Kanban-style: must hold briefly before the block can be dragged.
    // A short tap still opens the edit modal; a quick flick scrolls the day.
    const timer = setTimeout(() => {
      const p = pressRef.current;
      if (!p || p.active || p.mode !== "move" || p.procId !== proc.id) return;
      activateDrag(p);
    }, MOVE_LONG_PRESS_MS);
    pressRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      timer,
      active: false,
      mode: "move",
      procId: proc.id,
      proc,
      grabOffsetMins,
    };
  }, [clientYToMins, activateDrag]);

  const onTimelinePointerMove = useCallback((e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    dragClientYRef.current = e.clientY;
    if (!p.active) {
      const dx = Math.abs(e.clientX - p.startX);
      const dy = Math.abs(e.clientY - p.startY);
      // Finger moved before the hold completed → cancel (scroll / tap), don't drag.
      if (p.timer && (dx > PRESS_TOLERANCE_PX || dy > PRESS_TOLERANCE_PX)) {
        clearTimeout(p.timer);
        p.timer = null;
      }
      return;
    }
    applyDragFromClientY(e.clientY);
    ensureAutoScroll();
  }, [applyDragFromClientY, ensureAutoScroll]);

  const rescheduleMutation = useUpdateProcedure({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListProceduresQueryKey() });
      },
    },
  });

  const rescheduleProcedure = useCallback(async (proc: Procedure, mins: number) => {
    if (!proc.scheduledAt) return;
    const prevMins = timeMins(optimisticScheduledAt[proc.id] ?? proc.scheduledAt);
    if (mins === prevMins) return;

    const d = new Date(selDate);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    const iso = d.toISOString();
    setOptimisticScheduledAt((prev) => ({ ...prev, [proc.id]: iso }));
    try {
      await rescheduleMutation.mutateAsync({
        id: proc.id,
        data: { scheduledAt: iso },
      });
      hapticNotify("success");
    } catch {
      setOptimisticScheduledAt((prev) => {
        const next = { ...prev };
        delete next[proc.id];
        return next;
      });
      hapticNotify("error");
      toast({
        title: t("common.error", { defaultValue: "Ошибка" }),
        description: t("schedule.rescheduleError", { defaultValue: "Не удалось перенести запись" }),
        variant: "destructive",
      });
    }
  }, [optimisticScheduledAt, selDate, rescheduleMutation, toast, t]);

  const onTimelinePointerUp = useCallback((e: React.PointerEvent) => {
    const p = pressRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    if (p.timer) clearTimeout(p.timer);
    stopAutoScroll();

    if (p.active) {
      contentRef.current?.removeEventListener("touchmove", blockTouchScroll);
      suppressClickRef.current = true;
      const droppedMins = snapMins(
        p.mode === "move" && p.grabOffsetMins != null
          ? clampSlotStart(clientYToMins(p.lastY) - p.grabOffsetMins)
          : yToCreateRawMins(p.lastY),
      );
      if (p.mode === "create") {
        openCreateAt(droppedMins);
      } else if (p.mode === "move" && p.proc) {
        void rescheduleProcedure(p.proc, droppedMins);
      }
    } else {
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (p.mode === "create") {
        // Horizontal swipe → previous / next day (Apple Calendar style)
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          suppressClickRef.current = true;
          const d = new Date(selDate);
          d.setDate(d.getDate() + (dx < 0 ? 1 : -1));
          goToDate(d, true);
        }
      } else if (p.mode === "move") {
        // Moved past tolerance without completing hold → scroll/flick, not a tap.
        if (Math.abs(dx) > PRESS_TOLERANCE_PX || Math.abs(dy) > PRESS_TOLERANCE_PX) {
          suppressClickRef.current = true;
        }
      }
    }

    pressRef.current = null;
    clearDragVisual();
  }, [
    blockTouchScroll,
    openCreateAt,
    snapMins,
    yToCreateRawMins,
    clampSlotStart,
    clientYToMins,
    selDate,
    goToDate,
    stopAutoScroll,
    clearDragVisual,
    rescheduleProcedure,
  ]);

  useEffect(() => cancelPress, [cancelPress]);

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
      .map((p) => {
        const optimistic = optimisticScheduledAt[p.id];
        return optimistic ? { ...p, scheduledAt: optimistic } : p;
      })
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [pData, user?.id, dateStr, clinicWideSchedule, optimisticScheduledAt]);

  // Drop optimistic overrides once the server list matches the new time.
  useEffect(() => {
    if (!Object.keys(optimisticScheduledAt).length) return;
    const all = (pData?.data?.procedures ?? []) as Procedure[];
    setOptimisticScheduledAt((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, iso] of Object.entries(prev)) {
        const server = all.find((p) => p.id === id);
        if (
          server?.scheduledAt &&
          Math.abs(new Date(server.scheduledAt).getTime() - new Date(iso).getTime()) < 2000
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pData, optimisticScheduledAt]);

  const visibleProcs = dayProcs;
  const overlapLayout = useMemo(() => layoutOverlaps(dayProcs), [dayProcs]);

  /* Scroll to now / first appointment / working-day start.
     Instant jump (no smooth) — a smooth scroll fighting a touch pan is what
     made the timeline feel frozen. Never re-anchor after the user scrolls. */
  const firstProcMins = dayProcs.length && dayProcs[0].scheduledAt
    ? timeMins(dayProcs[0].scheduledAt)
    : null;
  const userScrolledRef = useRef(false);
  const anchoredDateRef = useRef<string | null>(null);
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    const markScrolled = () => { userScrolledRef.current = true; };
    el.addEventListener("touchstart", markScrolled, { passive: true });
    el.addEventListener("wheel", markScrolled, { passive: true });
    return () => {
      el.removeEventListener("touchstart", markScrolled);
      el.removeEventListener("wheel", markScrolled);
    };
  }, []);
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    const firstAnchorForDate = anchoredDateRef.current !== dateStr;
    if (firstAnchorForDate) userScrolledRef.current = false;
    // Re-anchor when data arrives only if the user hasn't touched the list yet
    if (!firstAnchorForDate && (proceduresLoading || userScrolledRef.current)) return;
    anchoredDateRef.current = dateStr;
    const anchorMins = isToday
      ? nowMins
      : firstProcMins ?? DEFAULT_SCROLL_HOUR * 60;
    el.scrollTop = Math.max(0, minToPx(anchorMins - START_H * 60) - 120);
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
    () => filterTreatingDoctors(userData?.data?.users ?? [])
      .map((u) => ({ id: u.id, name: treatingDoctorLabel(u) })),
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
      {/* data-ptr-ignore: long-press drag-to-create must not trigger page pull-to-refresh */}
      <div
        ref={tlRef}
        data-ptr-ignore
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-white border-t border-[#e8e3d9] relative"
      >
        <div
          ref={contentRef}
          key={dateStr}
          data-ptr-ignore
          className={`relative select-none ${slideClass}`}
          style={{ height: totalH + HOUR_H, touchAction: "pan-y" }}
          onPointerDown={onTimelinePointerDown}
          onPointerMove={onTimelinePointerMove}
          onPointerUp={onTimelinePointerUp}
          onPointerCancel={cancelPress}
          onClick={(e) => {
            // Tap on empty space → create appointment at that half-hour
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            if (e.target !== e.currentTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const mins = Math.floor((y / HOUR_H) * 60 / 30) * 30 + START_H * 60;
            openCreateAt(mins);
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

          {/* Events — side-by-side columns when overlapping (iPhone style).
              Long-press then drag to reschedule; tap opens the edit modal. */}
          {visibleProcs.map(proc => {
            if (!proc.scheduledAt) return null;
            const locked = isScheduleLockedProcedure(proc);
            const isMoving = !locked && movingProcId === proc.id && dragVisualMins != null;
            const startMin = isMoving ? dragVisualMins! : timeMins(proc.scheduledAt);
            const labelMins = isMoving && dragSnapMins != null ? dragSnapMins : timeMins(proc.scheduledAt);
            const top    = minToPx(startMin - START_H * 60);
            const height = Math.max(minToPx(60), 44);
            const sc     = STATUS_COLORS[proc.status as ProcedureStatus] ?? STATUS_COLORS.scheduled;
            const Icon   = STATUS_ICONS[proc.status as ProcedureStatus] ?? Clock;
            const patient = patients.get(proc.patientId);
            const layout = overlapLayout.get(proc.id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / layout.cols;
            return (
              <button
                key={proc.id}
                type="button"
                onPointerDown={(e) => onEventPointerDown(e, proc)}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setEditingProcedure(proc);
                }}
                className={`absolute rounded-xl overflow-hidden flex text-left hover:ring-2 hover:ring-[var(--ds-primary)]/30 transition-shadow ${sc.bg} ${
                  isMoving
                    ? "z-40 cursor-grabbing shadow-lg shadow-[#1f75fe]/25 ring-2 ring-[#1f75fe]/40"
                    : locked
                      ? "cursor-pointer hover:z-10 opacity-90"
                      : "cursor-pointer hover:z-10"
                }`}
                style={{
                  top: top + 2,
                  height: height - 4,
                  left: `calc(3.5rem + (100% - 3.5rem - 0.75rem) * ${(layout.col * widthPct) / 100})`,
                  width: `calc((100% - 3.5rem - 0.75rem) * ${widthPct / 100} - ${layout.cols > 1 ? 3 : 0}px)`,
                  willChange: isMoving ? "top" : undefined,
                  touchAction: isMoving ? "none" : undefined,
                }}
              >
                {/* Left accent bar */}
                <div className={`w-1 shrink-0 ${sc.bar}`} />

                <div className="flex-1 px-2.5 py-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className={`text-[12px] font-bold leading-snug ${sc.text} truncate flex-1`}>
                      {locked && <Lock className={`inline w-3 h-3 mr-1 align-[-1px] ${sc.text}`} />}
                      {proc.name}
                    </p>
                    {layout.cols === 1 && !isMoving && (
                      <span className={`inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.badge}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {t(`procedure.status.${proc.status}`)}
                      </span>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 mt-0.5 text-[11px] ${sc.text} opacity-80`}>
                    <span className="flex items-center gap-0.5 tabular-nums">
                      <Clock className="w-3 h-3" />
                      {fmtMins(labelMins)}
                      {layout.cols === 1 && (
                        <>
                          {" — "}
                          {fmtMins(labelMins + NEW_SLOT_DURATION)}
                        </>
                      )}
                    </span>
                    {patient && (
                      <span className="truncate opacity-70">· {patient}</span>
                    )}
                  </div>

                  {proc.notes && height > 60 && layout.cols === 1 && !isMoving && (
                    <p className={`text-[10px] ${sc.text} opacity-60 mt-0.5 truncate`}>
                      {proc.notes}
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {/* Snap time badges while moving an appointment */}
          {movingProcId != null && dragVisualMins != null && dragSnapMins != null && (
            <div
              className="absolute left-0 right-0 z-50 pointer-events-none"
              style={{
                top: minToPx(dragVisualMins - START_H * 60),
                height: minToPx(NEW_SLOT_DURATION),
              }}
            >
              <div className="absolute left-0 top-0 z-50 w-14 -translate-y-1/2 pr-2 text-right">
                <span className="inline-block rounded-md bg-[#1f75fe] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm tabular-nums">
                  {fmtMins(dragSnapMins)}
                </span>
              </div>
              <div className="absolute left-0 bottom-0 z-50 w-14 translate-y-1/2 pr-2 text-right">
                <span className="inline-block rounded-md bg-[#1f75fe] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm tabular-nums">
                  {fmtMins(dragSnapMins + NEW_SLOT_DURATION)}
                </span>
              </div>
            </div>
          )}

          {/* Drag-to-create ghost block (long press) — visual follows finger, labels snap */}
          {movingProcId == null && dragVisualMins != null && dragSnapMins != null && (
            <div
              className="absolute left-0 right-0 z-40 pointer-events-none will-change-[top]"
              style={{
                top: minToPx(dragVisualMins - START_H * 60),
                height: minToPx(NEW_SLOT_DURATION),
              }}
            >
              {/* Gutter time badges — solid blue so they fully cover black hour labels */}
              <div className="absolute left-0 top-0 z-50 w-14 -translate-y-1/2 pr-2 text-right">
                <span className="inline-block rounded-md bg-[#1f75fe] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm tabular-nums">
                  {fmtMins(dragSnapMins)}
                </span>
              </div>
              <div className="absolute left-0 bottom-0 z-50 w-14 translate-y-1/2 pr-2 text-right">
                <span className="inline-block rounded-md bg-[#1f75fe] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm tabular-nums">
                  {fmtMins(dragSnapMins + NEW_SLOT_DURATION)}
                </span>
              </div>
              {/* Rounded block, 1 hour tall */}
              <div className="absolute left-14 right-3 top-[2px] bottom-[2px] rounded-2xl bg-[#1f75fe] shadow-lg shadow-[#1f75fe]/30 flex items-start px-3 py-2">
                <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Новая запись
                </span>
              </div>
            </div>
          )}

          {/* Loading: appointment-block silhouettes over the hour grid */}
          {proceduresLoading && (
            <div className="absolute left-14 right-3 top-0 pointer-events-none">
              <Bone className="absolute w-3/4 h-14 rounded-xl" style={{ top: HOUR_H * 9 + 2 }} />
              <Bone className="absolute w-2/3 h-14 rounded-xl" style={{ top: HOUR_H * 11 + 2 }} />
              <Bone className="absolute w-3/4 h-14 rounded-xl" style={{ top: HOUR_H * 13 + 2 }} />
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
