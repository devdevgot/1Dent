import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Brain, FileText, Paperclip, Play, Square, CheckCircle2,
  Ban, Loader2, Clock, Upload, Trash2, Image, File,
  UserRound, ChevronDown, ChevronLeft, ChevronRight, Stethoscope, RefreshCw, StickyNote,
  Camera, FlipHorizontal, CircleDot, Send, Lock, FileSignature, Check,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCompleteTreatmentPlanItem,
  useUpdateTreatmentPlanItem,
  getGetActiveTreatmentPlanQueryKey,
  getListTeethQueryKey,
  useListPatientContracts,
  useGetPatient,
  useUpdatePatient,
  getGetPatientQueryKey,
} from "@workspace/api-client-react";
import type { TreatmentPlanItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { getBaseUrl } from "@/lib/base-url";

type User = { id: string; name: string; role?: string };

interface PlanItemDetailModalProps {
  item: TreatmentPlanItem;
  patientId: string;
  planId: string;
  allUsers: User[];
  timerStart: number | undefined;
  timerDuration: number | undefined;
  tick: number;
  onStart: (id: string, durationMs?: number | null) => void;
  onStopTimer: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  completingId: string | null;
  cancellingId: string | null;
  onClose: () => void;
}

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface ToothAiSection {
  title: string;
  lines: string[];
}

function parseToothAnalysis(text: string): ToothAiSection[] {
  const sections: ToothAiSection[] = [];
  let current: ToothAiSection | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else if (current) {
      const clean = line.replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
      if (clean) current.lines.push(clean);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function AiToothSection({
  patientId,
  toothFdi,
  planTitle,
}: {
  patientId: string;
  toothFdi?: number | null;
  planTitle?: string;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!toothFdi) return;
    setLoading(true);
    setError(null);
    try {
      const tok = localStorage.getItem("auth_token");
      const qs = planTitle ? `?planTitle=${encodeURIComponent(planTitle)}` : "";
      const res = await fetch(`${getBaseUrl()}/api/patients/${patientId}/teeth/${toothFdi}/tooth-ai-analysis${qs}`, {
        headers: { Authorization: `Bearer ${tok ?? ""}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { success: boolean; data: { analysis: string | null } };
      setAnalysis(json.data?.analysis ?? null);
      setFetchedAt(new Date());
    } catch {
      setError("Не удалось получить анализ. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [patientId, toothFdi, planTitle]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  if (!toothFdi) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-primary/10 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-[12px] text-primary/70">
          <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
          ИИ анализирует зуб {toothFdi}…
        </div>
        <div className="space-y-1.5">
          {[60, 80, 50].map((w, i) => (
            <div key={i} className="h-2.5 bg-primary/10 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5 flex items-start gap-2">
        <span className="text-red-400 text-[12px] flex-1">{error}</span>
        <button
          onClick={() => void fetchAnalysis()}
          className="text-[11px] font-medium text-red-500 hover:text-red-700 underline shrink-0"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <p className="text-[12px] text-[#94a3b8] py-1">
        Проведите диагностику зуба для получения анализа
      </p>
    );
  }

  const sections = parseToothAnalysis(analysis);

  return (
    <div className="rounded-xl border border-primary/10 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-primary/10">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
            ИИ-анализ · Зуб {toothFdi}
          </span>
        </div>
        <button
          onClick={() => void fetchAnalysis()}
          className="p-1 rounded-md hover:bg-primary/10 transition-colors"
          title="Обновить анализ"
        >
          <RefreshCw className="w-3 h-3 text-primary/60" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {sections.length === 0 ? (
          <p className="text-[12px] text-[#64748b]">Анализ недоступен</p>
        ) : (
          sections.map((sec) => (
            <div key={sec.title}>
              <p className="text-[10px] font-bold text-primary/80 uppercase tracking-wide mb-1">
                {sec.title}
              </p>
              {sec.lines.map((line, i) => (
                <p key={i} className="text-[12px] text-[#0f172a] leading-snug flex gap-1.5 mb-0.5">
                  <span className="text-primary/60 shrink-0 mt-0.5">•</span>
                  {line}
                </p>
              ))}
            </div>
          ))
        )}
        {fetchedAt && (
          <p className="text-[10px] text-[#94a3b8] pt-0.5">
            Обновлено: {fetchedAt.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── helpers for schedule picker ─── */
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_RU = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const SCHEDULE_TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const min  = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const padding  = (firstDow + 6) % 7;
  const days     = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(padding).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

interface TreatmentSchedulePickerProps {
  scheduledAt: string | null;
  onConfirm: (date: string, time: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

function TreatmentSchedulePicker({ scheduledAt, onConfirm, onClear, onClose }: TreatmentSchedulePickerProps) {
  const now = new Date();
  const initDate = scheduledAt ? new Date(scheduledAt) : now;

  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [selDate, setSelDate] = useState(
    scheduledAt
      ? `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, "0")}-${String(initDate.getDate()).padStart(2, "0")}`
      : ""
  );
  const [selTime, setSelTime] = useState(
    scheduledAt
      ? `${String(initDate.getHours()).padStart(2, "0")}:${String(initDate.getMinutes()).padStart(2, "0")}`
      : "09:00"
  );

  const timeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = timeRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, []);

  const weeks = buildCalendarWeeks(viewYear, viewMonth);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelDate(d);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border)]">
          <p className="font-semibold text-[var(--text)] text-[15px]">Назначить дату лечения</p>
          <button onClick={onClose} className="text-[var(--text-subtle)] hover:text-[var(--text-secondary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors">
              <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <span className="text-sm font-semibold text-[var(--text)]">
              {MONTHS_RU[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors">
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map(d => (
              <div key={d} className="text-center text-xs font-medium text-[var(--text-subtle)] py-1">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                const isoDay = day
                  ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : null;
                const isSelected = isoDay === selDate;
                const isToday    = isoDay === todayStr;
                const isPast     = isoDay ? isoDay < todayStr : false;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!day || isPast}
                    onClick={() => day && selectDay(day)}
                    className={cn(
                      "aspect-square flex items-center justify-center text-sm rounded-full transition-all m-0.5",
                      !day && "invisible",
                      isPast && day && "text-[var(--text-subtle)] cursor-not-allowed",
                      isSelected && "bg-primary text-white font-semibold shadow-sm",
                      !isSelected && isToday && "text-primary font-semibold",
                      !isSelected && !isToday && day && !isPast && "text-[var(--text)] hover:bg-primary/10",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mx-5 border-t border-[var(--ds-border)] my-1" />

        {/* Time list */}
        <div className="px-5 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Время</span>
          </div>
          <div ref={timeRef} className="h-36 overflow-y-scroll custom-scrollbar space-y-0.5 pr-1">
            {SCHEDULE_TIME_SLOTS.map(slot => (
              <button
                key={slot}
                data-selected={slot === selTime}
                type="button"
                onClick={() => setSelTime(slot)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all",
                  slot === selTime
                    ? "bg-primary text-white font-semibold"
                    : "text-[var(--text)] hover:bg-primary/10",
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--ds-border)] flex gap-3">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="dash-btn px-3 py-2 !text-red-500 !border-red-200 hover:!bg-red-50 text-[12px] font-semibold"
            >
              Снять
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="dash-btn dash-btn-secondary flex-1 py-2 text-sm font-semibold"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!selDate}
            onClick={() => onConfirm(selDate, selTime)}
            className={cn(
              "dash-btn flex-1 py-2 text-sm font-semibold",
              selDate
                ? "dash-btn-primary"
                : "!bg-[var(--surface-2)] !text-[var(--text-subtle)] cursor-not-allowed border-[var(--ds-border)]"
            )}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanItemDetailModal({
  item,
  patientId,
  planId,
  allUsers,
  timerStart,
  timerDuration,
  tick,
  onStart,
  onStopTimer,
  onComplete,
  onCancel,
  completingId,
  cancellingId,
  onClose,
}: PlanItemDetailModalProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"info" | "ai" | "files">("info");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachments, setAttachments] = useState<string[]>(item.attachments ?? []);
  
  // Fetch patient details to get their assigned doctor
  const { data: patientRes } = useGetPatient(patientId);
  const patient = patientRes?.data?.patient;
  const patientDoctorId = patient?.doctorId ?? "";

  const [selectedDoctor, setSelectedDoctor] = useState<string>(item.assignedDoctorId ?? "");
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);
  const [doctorToTransfer, setDoctorToTransfer] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(item.scheduledAt ?? null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Default to patient's assigned doctor if not set on the plan item
  useEffect(() => {
    if (!selectedDoctor && patientDoctorId) {
      setSelectedDoctor(patientDoctorId);
    }
  }, [patientDoctorId, selectedDoctor]);

  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed";
  const isCancelled = item.status === "cancelled";
  const isCompletingThis = completingId === item.id;
  const isCancellingThis = cancellingId === item.id;
  const isTimerRunning = !!timerStart;
  // tick is a re-render trigger; elapsed/remaining use real Date.now()
  void tick;
  const elapsed = isTimerRunning ? Date.now() - timerStart! : 0;
  const duration = timerDuration ?? null;
  const remaining = duration && isTimerRunning ? Math.max(0, timerStart! + duration - Date.now()) : null;

  const updateMutation = useUpdateTreatmentPlanItem({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
      },
      onError: () => {
        toast({ title: "Ошибка сохранения", variant: "destructive" });
      },
    },
  });

  const updatePatientMutation = useUpdatePatient({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: ["listPatients"] });
        qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
      },
    },
  });

  const { data: contractsData, refetch: refetchContracts, isFetching: isFetchingContracts } = useListPatientContracts(
    patientId,
    {
      query: {
        refetchInterval: (query: any) => {
          const data = query?.state?.data;
          const list = data?.data?.contracts ?? [];
          const sub = item.bundleToken ? list.filter((c: any) => c.bundleToken === item.bundleToken) : [];
          const isAllSigned = !!item.bundleToken && sub.length > 0 && sub.every((c: any) => c.status === "signed");
          return item.bundleToken && !isAllSigned ? 5000 : false;
        }
      } as any
    }
  );

  const bundleToken = item.bundleToken;
  const bundleContracts = contractsData?.data?.contracts.filter(c => c.bundleToken === bundleToken) ?? [];
  const hasBundle = !!bundleToken;
  const allSigned = hasBundle && bundleContracts.length > 0 && bundleContracts.every(c => c.status === "signed");

  const [sendingBundle, setSendingBundle] = useState(false);
  const handleSendBundle = async () => {
    setSendingBundle(true);
    try {
      const authTok = localStorage.getItem("auth_token");
      const authHeaders = authTok ? { Authorization: `Bearer ${authTok}` } : {};

      let tokenToSend = bundleToken;

      if (!tokenToSend) {
        const prepareRes = await fetch(
          `${getBaseUrl()}/api/contracts/patient/${patientId}/prepare-extraction-bundle`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              ...authHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ serviceNames: [item.title] }),
          },
        );
        const prepareData = await prepareRes.json() as {
          success: boolean;
          error?: string;
          data?: { bundleToken: string; contracts?: unknown[] };
        };
        if (!prepareRes.ok || !prepareData.success || !prepareData.data?.bundleToken) {
          throw new Error(prepareData.error ?? "Не удалось сформировать пакет документов");
        }
        if (!prepareData.data.contracts?.length) {
          throw new Error("Нет документов для данной услуги. Проверьте шаблоны договоров.");
        }
        tokenToSend = prepareData.data.bundleToken;

        await updateMutation.mutateAsync({
          id: patientId,
          planId,
          itemId: item.id,
          data: { bundleToken: tokenToSend },
        });
      }

      const sendRes = await fetch(
        `${getBaseUrl()}/api/contracts/bundle/${tokenToSend}/send-whatsapp`,
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders,
        },
      );
      const sendData = await sendRes.json() as {
        success: boolean;
        code?: string;
        error?: string;
      };
      if (!sendRes.ok || !sendData.success) {
        if (sendData.code === "WHATSAPP_NOT_CONNECTED" || sendRes.status === 422) {
          throw new Error("WhatsApp не подключён. Подключите WhatsApp в настройках каналов.");
        }
        throw new Error(sendData.error ?? "Ошибка отправки WhatsApp");
      }

      toast({ title: "Пакет документов отправлен пациенту на WhatsApp" });
      void refetchContracts();
    } catch (err) {
      toast({
        title: "Ошибка отправки",
        description: err instanceof Error ? err.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    } finally {
      setSendingBundle(false);
    }
  };

  const handleSaveNotes = useCallback(async () => {
    if (!notesDirty) return;
    setSavingNotes(true);
    await updateMutation.mutateAsync({ id: patientId, planId, itemId: item.id, data: { notes } });
    setSavingNotes(false);
    setNotesDirty(false);
    toast({ title: "Заметка сохранена" });
  }, [notes, notesDirty, patientId, planId, item.id, updateMutation, toast]);

  const performDoctorAssignment = useCallback(async (doctorId: string) => {
    setSelectedDoctor(doctorId);
    try {
      await updateMutation.mutateAsync({
        id: patientId, planId, itemId: item.id,
        data: { assignedDoctorId: doctorId || null },
      });
      toast({ title: doctorId ? "Врач назначен" : "Врач снят" });
    } catch {
      // handled by mutation
    }
  }, [patientId, planId, item.id, updateMutation, toast]);

  const handleAssignDoctor = useCallback((doctorId: string) => {
    setShowDoctorPicker(false);
    if (doctorId && doctorId !== selectedDoctor) {
      setDoctorToTransfer(doctorId);
    } else {
      void performDoctorAssignment(doctorId);
    }
  }, [selectedDoctor, performDoctorAssignment]);

  const handleScheduleSave = useCallback(async (dateStr: string, timeStr: string) => {
    setSavingSchedule(true);
    const isoStr = new Date(`${dateStr}T${timeStr}`).toISOString();
    setScheduledAt(isoStr);
    try {
      await updateMutation.mutateAsync({
        id: patientId, planId, itemId: item.id,
        data: { scheduledAt: isoStr },
      });
      toast({ title: "Дата лечения назначена" });
    } catch {
      // handled by mutation
    } finally {
      setSavingSchedule(false);
    }
  }, [patientId, planId, item.id, updateMutation, toast]);

  const handleScheduleClear = useCallback(async () => {
    setSavingSchedule(true);
    setScheduledAt(null);
    try {
      await updateMutation.mutateAsync({
        id: patientId, planId, itemId: item.id,
        data: { scheduledAt: null },
      });
      toast({ title: "Дата лечения снята" });
    } catch {
      // handled by mutation
    } finally {
      setSavingSchedule(false);
    }
  }, [patientId, planId, item.id, updateMutation, toast]);

  const handleConfirmTransfer = async () => {
    if (!doctorToTransfer) return;
    const targetDoctorId = doctorToTransfer;
    setDoctorToTransfer(null);
    setSelectedDoctor(targetDoctorId);

    try {
      // 1. Update treatment plan item doctor
      await updateMutation.mutateAsync({
        id: patientId,
        planId,
        itemId: item.id,
        data: { assignedDoctorId: targetDoctorId || null },
      });

      // 2. Update patient doctor record
      await updatePatientMutation.mutateAsync({
        id: patientId,
        data: { doctorId: targetDoctorId || undefined },
      });

      toast({ title: "Врач успешно изменен и лечение передано" });
    } catch (err) {
      console.error("Failed to transfer doctor", err);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadingFile(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch(`${getBaseUrl()}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = (await res.json()) as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Upload failed");

      const newAttachments = [...attachments, objectPath];
      setAttachments(newAttachments);
      await updateMutation.mutateAsync({
        id: patientId, planId, itemId: item.id,
        data: { attachments: newAttachments },
      });
      toast({ title: "Файл загружен" });
    } catch {
      toast({ title: "Ошибка загрузки файла", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  }, [attachments, patientId, planId, item.id, updateMutation, toast]);

  const handleRemoveAttachment = useCallback(async (path: string) => {
    const newAttachments = attachments.filter((a) => a !== path);
    setAttachments(newAttachments);
    await updateMutation.mutateAsync({
      id: patientId, planId, itemId: item.id,
      data: { attachments: newAttachments },
    });
    toast({ title: "Файл удалён" });
  }, [attachments, patientId, planId, item.id, updateMutation, toast]);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("Нет доступа к камере");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
    setCameraError(null);
  }, []);

  const handleOpenCamera = useCallback((facing: "environment" | "user" = "environment") => {
    setCameraFacing(facing);
    setShowCamera(true);
    // startCamera is triggered by useEffect after the <video> element is in the DOM
  }, []);

  // Start camera stream once the viewfinder <video> element has been mounted
  useEffect(() => {
    if (!showCamera) return;
    void startCamera(cameraFacing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCamera]); // intentionally only on showCamera toggle, not cameraFacing

  const handleFlipCamera = useCallback(async () => {
    const next = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(next);
    await startCamera(next);
  }, [cameraFacing, startCamera]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new (window as any).File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      await handleFileSelect(file);
    }, "image/jpeg", 0.92);
  }, [stopCamera, handleFileSelect]);

  // Stop camera on unmount
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const handleComplete = useCallback(() => {
    onComplete(item.id);
    onClose();
  }, [item.id, onComplete, onClose]);

  const handleCancel = useCallback(() => {
    onCancel(item.id);
    onClose();
  }, [item.id, onCancel, onClose]);

  const assignedUser = allUsers.find((u) => u.id === selectedDoctor);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tabs = [
    { id: "info" as const, label: "Процедура", icon: Stethoscope },
    { id: "ai" as const, label: "ИИ-анализ", icon: Brain },
    { id: "files" as const, label: "Снимки", icon: Paperclip },
  ];

  const fileUrl = (path: string) => {
    const tok = localStorage.getItem("auth_token");
    return `/api/storage/objects/${path.replace(/^\/objects\//, "")}${tok ? `?token=${tok}` : ""}`;
  };

  const isImage = (path: string) => /\.(jpe?g|png|gif|webp|heic)$/i.test(path);
  const isVideo = (path: string) => /\.(mp4|webm|mov|ogg|mkv)$/i.test(path);
  const isPdf = (path: string) => /\.pdf$/i.test(path);
  const fileName = (path: string) => path.split("/").pop() ?? path;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-in-fade">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel — takes ~75% of screen height, anchored near bottom */}
      <div
        className="relative bg-[var(--ds-surface)] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--ds-border)] shadow-xl flex flex-col overflow-hidden animate-in-slide"
        style={{ height: "75dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--ds-border)]" />
        </div>

        {/* ── Header ── */}
        <div className="px-4 pt-3 pb-3 border-b border-[var(--ds-border)] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[var(--text)] leading-snug">{item.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.toothFdi != null && (
                  <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
                    Зуб №{item.toothFdi}
                  </span>
                )}
                <span className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                  isCompleted ? "bg-emerald-50 text-emerald-700" :
                  isCancelled ? "bg-red-50 text-red-500" :
                  "bg-blue-50 text-blue-600"
                )}>
                  {isCompleted ? "Завершена" : isCancelled ? "Отменена" : "В ожидании"}
                </span>
                {item.discount > 0 ? (
                  <span className="text-[12px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <span className="line-through text-[var(--text-subtle)]">{item.price.toLocaleString("ru-KZ")} ₸</span>
                    <span className="text-emerald-600 font-bold">{(item.price * (1 - item.discount / 100)).toLocaleString("ru-KZ")} ₸</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-100">-{item.discount}%</span>
                  </span>
                ) : (
                  <span className="text-[12px] font-semibold text-[var(--text)]">
                    {item.price.toLocaleString("ru-KZ")} ₸
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                  tab === id ? "bg-primary/10 text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ── Tab: Процедура ── */}
          {tab === "info" && (
            <div className="px-4 py-4 space-y-4">
              {/* Timer & Documents section */}
              {isPending && !isAdmin && (
                <div className="space-y-3">
                  {/* Documents step */}
                  {!isTimerRunning && (
                    <>
                      {!hasBundle ? (
                        <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-100/80 flex items-center justify-center shrink-0">
                              <FileSignature className="w-4 h-4 text-amber-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-[13px] font-bold text-amber-950">Необходима подпись документов</h4>
                              <p className="text-[11.5px] text-amber-850 leading-relaxed mt-0.5">
                                Перед началом лечения пациенту необходимо подписать пакет документов в электронном виде. Отправьте ссылку на подпись в WhatsApp.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleSendBundle}
                            disabled={sendingBundle}
                            className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-[12px] font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                          >
                            {sendingBundle ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Отправить пакет документов на WhatsApp
                          </button>
                        </div>
                      ) : !allSigned ? (
                        <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-xl bg-blue-100/80 flex items-center justify-center shrink-0">
                                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-[13px] font-bold text-blue-950">Ожидание подписи пациента</h4>
                                <p className="text-[11.5px] text-blue-800/80 leading-relaxed mt-0.5">
                                  Ссылка отправлена в WhatsApp. Вы сможете начать лечение после того, как пациент подпишет все документы.
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => void refetchContracts()}
                              disabled={isFetchingContracts}
                              className="p-1.5 rounded-lg hover:bg-blue-100/80 text-blue-600 transition-colors shrink-0"
                              title="Обновить статус"
                            >
                              <RefreshCw className={cn("w-3.5 h-3.5", isFetchingContracts && "animate-spin")} />
                            </button>
                          </div>

                          {/* Documents list */}
                          <div className="bg-white/80 border border-blue-100/50 rounded-xl p-3 space-y-2">
                            {bundleContracts.length === 0 ? (
                              <div className="flex items-center gap-2 text-[11px] text-[#94a3b8]">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Загрузка списка документов...
                              </div>
                            ) : (
                              bundleContracts.map((c) => (
                                <div key={c.id} className="flex items-center justify-between text-[11px] gap-2">
                                  <span className="text-[#0f172a] font-medium truncate flex-1">{c.templateName}</span>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                                    c.status === "signed" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-orange-50 text-orange-600 border border-orange-100"
                                  )}>
                                    {c.status === "signed" ? "Подписан" : "Ожидает"}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleSendBundle}
                              disabled={sendingBundle}
                              className="flex-1 h-9 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {sendingBundle ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              Переотправить в WhatsApp
                            </button>
                            <a
                              href={`${window.location.origin}/p/bundle/${bundleToken}`}
                              target="_blank"
                              rel="noreferrer"
                              className="h-9 px-3 rounded-xl border border-[#e8e3d9] bg-white hover:bg-[#faf8f4] text-[#64748b] text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                            >
                              Открыть пакет
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-4 space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100/80 flex items-center justify-center shrink-0">
                              <Check className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-[13px] font-bold text-emerald-950">Документы подписаны</h4>
                              <p className="text-[11.5px] text-emerald-800/80 leading-relaxed mt-0.5">
                                Пациент подписал все необходимые согласия. Доступ к запуску лечения разблокирован.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Timer UI Card */}
                  <div className="bg-gradient-to-br from-primary/5 to-blue-50 rounded-2xl p-4 border border-primary/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-[13px] font-semibold text-[#0f172a]">Таймер лечения</span>
                    </div>

                    {isTimerRunning ? (
                      <div className="space-y-3">
                        <div className="text-center">
                          <div className="text-[32px] font-bold text-primary tabular-nums">
                            {remaining != null ? formatTimer(remaining) : formatTimer(elapsed)}
                          </div>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">
                            {remaining != null ? "осталось" : "прошло"}
                          </p>
                        </div>
                        {duration && (
                          <div className="h-1.5 bg-white/80 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(100, ((elapsed) / duration) * 100)}%` }}
                            />
                          </div>
                        )}
                        <button
                          onClick={() => { onStopTimer(item.id); handleComplete(); }}
                          disabled={isCompletingThis}
                          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                          {isCompletingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Отметить выполнение
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onStart(item.id, null)}
                        disabled={!allSigned}
                        className={cn(
                          "w-full h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-sm",
                          allSigned
                            ? "bg-primary text-white hover:bg-primary/90 active:bg-primary/80"
                            : "bg-[#f1ede4] text-[#94a3b8] cursor-not-allowed border border-[#e8e3d9]"
                        )}
                      >
                        {allSigned ? <Play className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                        {/удал/i.test(item.title) ? "Начать удаление" : "Начать лечение"}
                      </button>
                    )}
                  </div>
                </div>
              )}              {/* Doctor assignment */}
              <div>
                <p className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Врач</p>
                <div className="relative">
                  <button
                    onClick={() => !isAdmin && setShowDoctorPicker(!showDoctorPicker)}
                    disabled={isAdmin}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-white hover:border-primary/40 transition-colors",
                      isAdmin && "cursor-default opacity-85 hover:border-[#e8e3d9]"
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <UserRound className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="flex-1 text-left text-[13px] font-medium text-[#0f172a]">
                      {assignedUser?.name ?? "Не назначен"}
                    </span>
                    {!isAdmin && <ChevronDown className={cn("w-4 h-4 text-[#94a3b8] transition-transform", showDoctorPicker && "rotate-180")} />}
                  </button>
                  {showDoctorPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e3d9] rounded-xl shadow-lg z-10 overflow-hidden">
                      <button
                        onClick={() => void handleAssignDoctor("")}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#faf8f4] text-[13px] text-[#64748b] transition-colors"
                      >
                        Не назначен
                      </button>
                      {allUsers.filter((u) => u.role === "doctor" || u.role === "admin" || u.role === "owner").map((u) => (
                        <button
                          key={u.id}
                          onClick={() => void handleAssignDoctor(u.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 text-[13px] transition-colors",
                            selectedDoctor === u.id ? "text-primary font-semibold bg-primary/5" : "text-[#0f172a]"
                          )}
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          {u.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule date/time */}
              {isPending && (
                <div>
                  <p className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide mb-2">Дата лечения</p>
                  <div className="relative">
                    <button
                      onClick={() => !isAdmin && setShowSchedulePicker(!showSchedulePicker)}
                      disabled={isAdmin}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-white hover:border-primary/40 transition-colors",
                        isAdmin && "cursor-default opacity-85 hover:border-[#e8e3d9]"
                      )}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarDays className="w-3.5 h-3.5 text-primary" />
                      </div>
                      {scheduledAt ? (
                        <span className="flex-1 text-left text-[13px] font-medium text-[#0f172a] flex items-center gap-2">
                          <span>
                            {new Date(scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                          </span>
                          <span className="text-[#94a3b8]">·</span>
                          <Clock className="w-3 h-3 text-[#94a3b8]" />
                          <span>
                            {new Date(scheduledAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                      ) : (
                        <span className="flex-1 text-left text-[13px] text-[#94a3b8]">
                          Дата не назначена
                        </span>
                      )}
                      {!isAdmin && (
                        savingSchedule
                          ? <Loader2 className="w-4 h-4 text-[#94a3b8] animate-spin" />
                          : <ChevronDown className={cn("w-4 h-4 text-[#94a3b8] transition-transform", showSchedulePicker && "rotate-180")} />
                      )}
                    </button>

                    {showSchedulePicker && (
                      <TreatmentSchedulePicker
                        scheduledAt={scheduledAt}
                        onConfirm={(date, time) => {
                          setShowSchedulePicker(false);
                          void handleScheduleSave(date, time);
                        }}
                        onClear={scheduledAt ? () => {
                          setShowSchedulePicker(false);
                          void handleScheduleClear();
                        } : undefined}
                        onClose={() => setShowSchedulePicker(false)}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Scheduled date badge (for completed/cancelled items) */}
              {!isPending && scheduledAt && (
                <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>
                    Было назначено: {new Date(scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}{" "}
                    в {new Date(scheduledAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" /> Заметки
                  </p>
                  {notesDirty && !isAdmin && (
                    <button
                      onClick={() => void handleSaveNotes()}
                      disabled={savingNotes}
                      className="text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity disabled:opacity-50 flex items-center gap-1"
                    >
                      {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Сохранить
                    </button>
                  )}
                </div>
                <textarea
                  readOnly={isAdmin}
                  value={notes}
                  onChange={(e) => { if (!isAdmin) { setNotes(e.target.value); setNotesDirty(true); } }}
                  onBlur={() => { if (notesDirty && !isAdmin) void handleSaveNotes(); }}
                  placeholder={isAdmin ? "Нет заметок" : "Добавьте заметки по процедуре…"}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
                />
              </div>


              {isCompleted && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-[13px] font-medium text-emerald-700">Процедура выполнена</span>
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <Ban className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-[13px] font-medium text-red-500">Позиция отменена</span>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: ИИ-анализ ── */}
          {tab === "ai" && (
            <div className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0f172a]">ИИ-анализ</p>
                  {item.toothFdi != null && (
                    <p className="text-[11px] text-[#94a3b8]">Зуб №{item.toothFdi}</p>
                  )}
                </div>
              </div>
              <AiToothSection patientId={patientId} toothFdi={item.toothFdi} planTitle={item.title} />
            </div>
          )}

          {/* ── Tab: Документы ── */}
          {tab === "files" && (
            <div className="px-4 py-4 space-y-4">

              {/* Camera viewfinder */}
              {showCamera && (
                <div className="rounded-2xl overflow-hidden border border-[#e8e3d9] bg-black relative">
                  {cameraError ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                      <Camera className="w-8 h-8 text-[#94a3b8]" />
                      <p className="text-[13px] text-[#94a3b8]">{cameraError}</p>
                      <button
                        onClick={stopCamera}
                        className="mt-1 text-[12px] text-primary font-semibold"
                      >
                        Закрыть
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full aspect-[4/3] object-cover"
                      />
                      <canvas ref={canvasRef} className="hidden" />
                      {/* Controls overlay */}
                      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
                        <button
                          onClick={stopCamera}
                          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleCapture()}
                          disabled={uploadingFile}
                          className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
                        >
                          {uploadingFile
                            ? <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            : <CircleDot className="w-7 h-7 text-primary" />}
                        </button>
                        <button
                          onClick={() => void handleFlipCamera()}
                          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                        >
                          <FlipHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Action buttons row */}
              {!showCamera && !isAdmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void handleOpenCamera("environment")}
                    disabled={uploadingFile}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-dashed border-[#e8e3d9] hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-6 h-6 text-[#94a3b8]" />
                    <span className="text-[12px] font-medium text-[#64748b]">Сделать фото</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-dashed border-[#e8e3d9] hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {uploadingFile ? (
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-[#94a3b8]" />
                    )}
                    <span className="text-[12px] font-medium text-[#64748b]">
                      {uploadingFile ? "Загружаем…" : "Загрузить файл"}
                    </span>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf,.docx,.doc"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileSelect(file);
                  e.target.value = "";
                }}
              />

              {/* Attachment list */}
              {attachments.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <FileText className="w-8 h-8 text-[#e8e3d9]" />
                  <p className="text-[12px] text-[#94a3b8]">Нет прикреплённых файлов</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((path) => (
                    <div key={path} className="flex items-center gap-3 p-3 bg-white border border-[#e8e3d9] rounded-xl shadow-sm">
                      {isImage(path) || isVideo(path) ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPath(path)}
                          className="shrink-0 group/img focus:outline-none"
                        >
                          {isImage(path) ? (
                            <img
                              src={fileUrl(path)}
                              alt={fileName(path)}
                              className="w-10 h-10 rounded-lg object-cover border border-[#e8e3d9] group-hover/img:opacity-85 transition-opacity"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 border border-[#e8e3d9] relative group-hover/img:opacity-85 transition-opacity">
                              <Play className="w-4 h-4 text-white fill-white absolute" />
                            </div>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewPath(path)}
                          className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors focus:outline-none"
                        >
                          <File className="w-5 h-5 text-primary" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setPreviewPath(path)}
                          className="text-[12px] font-medium text-[#0f172a] truncate block hover:text-primary transition-colors text-left w-full focus:outline-none"
                        >
                          {fileName(path)}
                        </button>
                        <span className="text-[10px] text-[#94a3b8] block">
                          {isImage(path) ? "Изображение" : isVideo(path) ? "Видео" : isPdf(path) ? "Документ PDF" : "Файл"}
                        </span>
                      </div>
                      {!isAdmin && (
                        <button
                          onClick={() => void handleRemoveAttachment(path)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#94a3b8] hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── File Preview Modal ── */}
      {previewPath && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          {/* Close button */}
          <button
            onClick={() => {
              setPreviewPath(null);
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              setIsFullscreen(false);
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-50 transition-colors"
            title="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Fullscreen toggle button */}
          {(isImage(previewPath) || isVideo(previewPath)) && (
            <button
              onClick={handleFullscreenToggle}
              className="absolute top-4 right-16 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-50 transition-colors"
              title={isFullscreen ? "Свернуть" : "На весь экран"}
            >
              {isFullscreen ? (
                <X className="w-5 h-5" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
          )}

          {/* Content container */}
          <div
            className={cn(
              "flex flex-col items-center justify-center p-4 transition-all duration-300",
              isFullscreen ? "w-screen h-screen" : "max-w-4xl max-h-[85vh] w-full"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {isImage(previewPath) ? (
              <img
                src={fileUrl(previewPath)}
                alt={fileName(previewPath)}
                className={cn(
                  "object-contain select-none rounded-lg shadow-2xl transition-all",
                  isFullscreen ? "w-full h-full max-h-screen rounded-none" : "max-w-full max-h-[75vh]"
                )}
              />
            ) : isVideo(previewPath) ? (
              <video
                src={fileUrl(previewPath)}
                controls
                autoPlay
                className={cn(
                  "object-contain rounded-lg shadow-2xl transition-all",
                  isFullscreen ? "w-full h-full max-h-screen rounded-none" : "max-w-full max-h-[75vh]"
                )}
              />
            ) : isPdf(previewPath) ? (
              <div className="w-full h-[75vh] flex flex-col bg-white rounded-2xl overflow-hidden shadow-2xl">
                <div className="px-4 py-3 bg-[var(--bg)] border-b border-[var(--ds-border)] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text)] truncate">{fileName(previewPath)}</span>
                  <a
                    href={fileUrl(previewPath)}
                    download
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Скачать
                  </a>
                </div>
                <iframe
                  src={`${fileUrl(previewPath)}#toolbar=0`}
                  className="w-full flex-1 border-0"
                />
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <File className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0f172a] truncate px-2">{fileName(previewPath)}</h3>
                  <p className="text-xs text-[#94a3b8] mt-1">Данный формат не поддерживается для предпросмотра</p>
                </div>
                <a
                  href={fileUrl(previewPath)}
                  download
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/95 shadow-sm transition-colors w-full"
                >
                  Скачать файл
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {doctorToTransfer && (() => {
        const targetDoctor = allUsers.find((u) => u.id === doctorToTransfer);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-[var(--ds-surface)] w-full max-w-[340px] rounded-2xl p-5 shadow-xl border border-[var(--ds-border)] flex flex-col text-center space-y-4 animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                <UserRound className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-[var(--text)] text-[16px]">Передача лечения</h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Вы точно хотите передать это лечение врачу{" "}
                  <span className="font-semibold text-[var(--text)]">{targetDoctor?.name}</span>? 
                  Имя нового врача обновится на канбан-доске и во всех списках.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDoctorToTransfer(null)}
                  className="dash-btn dash-btn-secondary flex-1 py-2 text-sm font-semibold"
                >
                  Нет
                </button>
                <button
                  onClick={handleConfirmTransfer}
                  disabled={updatePatientMutation.isPending || updateMutation.isPending}
                  className="dash-btn dash-btn-primary flex-1 py-2 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {(updatePatientMutation.isPending || updateMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Да"
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
