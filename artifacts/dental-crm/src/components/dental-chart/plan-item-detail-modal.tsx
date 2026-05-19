import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Brain, FileText, Paperclip, Play, Square, CheckCircle2,
  Ban, Loader2, Clock, Upload, Trash2, Image, File,
  UserRound, ChevronDown, Stethoscope, RefreshCw, StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGetDentalAiAnalysis,
  useCompleteTreatmentPlanItem,
  useUpdateTreatmentPlanItem,
  getGetActiveTreatmentPlanQueryKey,
  getListTeethQueryKey,
} from "@workspace/api-client-react";
import type { TreatmentPlanItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

function AiToothSection({ patientId, toothFdi }: { patientId: string; toothFdi?: number | null }) {
  const { data, isLoading, isFetching } = useGetDentalAiAnalysis(patientId, {
    query: { staleTime: 5 * 60 * 1000 },
  });
  const analysis = data?.data ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Анализ недоступен</p>
          <p className="text-xs text-gray-400 mt-1">Проведите диагностику для получения ИИ-анализа</p>
        </div>
        {isFetching && <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse"><RefreshCw className="w-3 h-3 animate-spin" />Загружаем…</div>}
      </div>
    );
  }

  const lines = analysis.reportText.split("\n");
  const elements: JSX.Element[] = [];
  let key = 0;
  let inRelevantSection = false;
  const fdiStr = toothFdi != null ? String(toothFdi) : null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { elements.push(<div key={key++} className="h-1.5" />); continue; }
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3);
      inRelevantSection = !fdiStr || heading.includes(fdiStr) || heading.toLowerCase().includes("рекоменд") || heading.toLowerCase().includes("вывод");
      elements.push(
        <h3 key={key++} className={cn("text-[12px] font-bold mt-3 mb-1 flex items-center gap-1.5", inRelevantSection ? "text-primary" : "text-gray-500")}>
          <span className={cn("w-1 h-3.5 rounded-full inline-block shrink-0", inRelevantSection ? "bg-primary" : "bg-gray-300")} />
          {heading}
        </h3>,
      );
    } else if (/^\d+\./.test(trimmed) || trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      elements.push(<p key={key++} className="text-[12px] text-gray-700 pl-3">{trimmed.replace(/^[-•]\s/, "• ")}</p>);
    } else {
      elements.push(<p key={key++} className="text-[12px] text-gray-700 leading-relaxed">{trimmed}</p>);
    }
  }

  const updatedAt = new Date(analysis.updatedAt);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 mb-3">
        <Clock className="w-3 h-3 text-gray-400" />
        <span className="text-[11px] text-gray-400">
          Обновлено {updatedAt.toLocaleDateString("ru", { day: "2-digit", month: "short" })} {updatedAt.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isFetching && <RefreshCw className="w-3 h-3 text-primary animate-spin ml-1" />}
      </div>
      <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">{elements}</div>
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
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"info" | "ai" | "files">("info");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachments, setAttachments] = useState<string[]>(item.attachments ?? []);
  const [selectedDoctor, setSelectedDoctor] = useState<string>(item.assignedDoctorId ?? "");
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed";
  const isCancelled = item.status === "cancelled";
  const isCompletingThis = completingId === item.id;
  const isCancellingThis = cancellingId === item.id;
  const isTimerRunning = !!timerStart;
  const elapsed = isTimerRunning ? tick - timerStart! : 0;
  const duration = timerDuration ?? null;
  const remaining = duration && isTimerRunning ? Math.max(0, timerStart! + duration - tick) : null;

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

  const handleSaveNotes = useCallback(async () => {
    if (!notesDirty) return;
    setSavingNotes(true);
    await updateMutation.mutateAsync({ id: patientId, planId, itemId: item.id, data: { notes } });
    setSavingNotes(false);
    setNotesDirty(false);
    toast({ title: "Заметка сохранена" });
  }, [notes, notesDirty, patientId, planId, item.id, updateMutation, toast]);

  const handleAssignDoctor = useCallback(async (doctorId: string) => {
    setSelectedDoctor(doctorId);
    setShowDoctorPicker(false);
    await updateMutation.mutateAsync({
      id: patientId, planId, itemId: item.id,
      data: { assignedDoctorId: doctorId || null },
    });
    toast({ title: doctorId ? "Врач назначен" : "Врач снят" });
  }, [patientId, planId, item.id, updateMutation, toast]);

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadingFile(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch("/api/storage/uploads/request-url", {
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

  const handleComplete = useCallback(() => {
    onComplete(item.id);
    onClose();
  }, [item.id, onComplete, onClose]);

  const handleCancel = useCallback(() => {
    onCancel(item.id);
    onClose();
  }, [item.id, onCancel, onClose]);

  const handleStartTimer = useCallback(() => {
    const dMs = durationMinutes ? Number(durationMinutes) * 60 * 1000 : null;
    onStart(item.id, dMs);
  }, [item.id, onStart, durationMinutes]);

  const assignedUser = allUsers.find((u) => u.id === selectedDoctor);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tabs = [
    { id: "info" as const, label: "Процедура", icon: Stethoscope },
    { id: "ai" as const, label: "ИИ-анализ", icon: Brain },
    { id: "files" as const, label: "Документы", icon: Paperclip },
  ];

  const fileUrl = (path: string) => {
    const tok = localStorage.getItem("auth_token");
    return `/api/storage/objects/${path.replace(/^\/objects\//, "")}${tok ? `?token=${tok}` : ""}`;
  };

  const isImage = (path: string) => /\.(jpe?g|png|gif|webp|heic)$/i.test(path);
  const fileName = (path: string) => path.split("/").pop() ?? path;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="bg-white w-full flex flex-col h-full overflow-hidden">

        {/* ── Header ── */}
        <div className="px-4 pt-3 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-gray-900 leading-snug">{item.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.toothFdi != null && (
                  <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
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
                <span className="text-[12px] font-semibold text-gray-700">
                  {item.price.toLocaleString("ru-KZ")} ₸
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
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
                  tab === id ? "bg-primary/10 text-primary" : "text-gray-500 hover:bg-gray-100"
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

              {/* Timer section */}
              {isPending && (
                <div className="bg-gradient-to-br from-primary/5 to-blue-50 rounded-2xl p-4 border border-primary/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-[13px] font-semibold text-gray-800">Таймер</span>
                  </div>

                  {isTimerRunning ? (
                    <div className="space-y-3">
                      <div className="text-center">
                        <div className="text-[32px] font-bold text-primary tabular-nums">
                          {remaining != null ? formatTimer(remaining) : formatTimer(elapsed)}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
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
                        onClick={() => onStopTimer(item.id)}
                        className="w-full py-2 rounded-xl bg-white border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Square className="w-4 h-4 text-red-400" /> Остановить
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="300"
                          placeholder="Длительность (мин)"
                          value={durationMinutes}
                          onChange={(e) => setDurationMinutes(e.target.value)}
                          className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-[13px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                          onClick={handleStartTimer}
                          className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 flex items-center gap-1.5 transition-colors shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" /> Начать
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400">Укажите длительность или нажмите «Начать» без неё</p>
                    </div>
                  )}
                </div>
              )}

              {/* Doctor assignment */}
              <div>
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Врач</p>
                <div className="relative">
                  <button
                    onClick={() => setShowDoctorPicker(!showDoctorPicker)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-primary/40 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <UserRound className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="flex-1 text-left text-[13px] font-medium text-gray-700">
                      {assignedUser?.name ?? "Не назначен"}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", showDoctorPicker && "rotate-180")} />
                  </button>
                  {showDoctorPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 overflow-hidden">
                      <button
                        onClick={() => void handleAssignDoctor("")}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-[13px] text-gray-500 transition-colors"
                      >
                        Не назначен
                      </button>
                      {allUsers.filter((u) => u.role === "doctor" || u.role === "admin" || u.role === "owner").map((u) => (
                        <button
                          key={u.id}
                          onClick={() => void handleAssignDoctor(u.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 text-[13px] transition-colors",
                            selectedDoctor === u.id ? "text-primary font-semibold bg-primary/5" : "text-gray-700"
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

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" /> Заметки
                  </p>
                  {notesDirty && (
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
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                  onBlur={() => { if (notesDirty) void handleSaveNotes(); }}
                  placeholder="Добавьте заметки по процедуре…"
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-700 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
                />
              </div>

              {/* Actions */}
              {isPending && (
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleComplete}
                    disabled={isCompletingThis || isCancellingThis}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {isCompletingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Отметить выполненной
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isCancellingThis || isCompletingThis}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 font-medium text-[13px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {isCancellingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                    Отменить позицию
                  </button>
                </div>
              )}

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
                  <p className="text-[13px] font-semibold text-gray-900">ИИ-анализ</p>
                  {item.toothFdi != null && (
                    <p className="text-[11px] text-gray-400">Зуб №{item.toothFdi}</p>
                  )}
                </div>
              </div>
              <AiToothSection patientId={patientId} toothFdi={item.toothFdi} />
            </div>
          )}

          {/* ── Tab: Документы ── */}
          {tab === "files" && (
            <div className="px-4 py-4 space-y-4">
              {/* Upload zone */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="w-full flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <span className="text-[13px] text-gray-500">Загружаем…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-[13px] font-medium text-gray-600">Нажмите для загрузки</span>
                    <span className="text-[11px] text-gray-400">Фото, документы, рентген</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.docx,.doc"
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
                  <FileText className="w-8 h-8 text-gray-200" />
                  <p className="text-[12px] text-gray-400">Нет прикреплённых файлов</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((path) => (
                    <div key={path} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                      {isImage(path) ? (
                        <a href={fileUrl(path)} target="_blank" rel="noreferrer" className="shrink-0">
                          <img
                            src={fileUrl(path)}
                            alt={fileName(path)}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-100"
                          />
                        </a>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <File className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <a
                          href={fileUrl(path)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] font-medium text-gray-700 truncate block hover:text-primary transition-colors"
                        >
                          {fileName(path)}
                        </a>
                        {isImage(path) && (
                          <span className="text-[10px] text-gray-400">Изображение</span>
                        )}
                      </div>
                      <button
                        onClick={() => void handleRemoveAttachment(path)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
