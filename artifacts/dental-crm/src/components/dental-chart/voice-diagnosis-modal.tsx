import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Mic, X, Loader2, Check, Trash2, ChevronDown, ChevronRight,
  RotateCcw, CheckSquare, Square, Clock, Stethoscope, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useUpdateTooth,
  getListTeethQueryKey,
  useListProcedureTemplates,
  useCreateProcedure,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { getBaseUrl } from "@/lib/base-url";
import { CONDITION_CONFIG } from "./fdi-chart";
import type { ToothCondition } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const AUTH_TOKEN_KEY = "auth_token";

const CONDITION_VALUES: ToothCondition[] = [
  "healthy", "cavity", "treated", "crown",
  "root_canal", "implant", "missing", "extraction_needed",
];

const CONDITION_TO_CATEGORY: Record<string, string | undefined> = {
  cavity: "therapy",
  treated: "therapy",
  root_canal: "therapy",
  crown: "orthopedics",
  implant: "implantation",
  extraction_needed: "surgery",
  missing: "surgery",
};

const CATEGORY_LABELS: Record<string, string> = {
  therapy: "Терапия",
  surgery: "Хирургия",
  orthopedics: "Ортопедия",
  implantation: "Имплантация",
  pediatric: "Детский прайс",
  hygiene: "Гигиена",
  periodontology: "Пародонтология",
  radiology: "Рентген",
  restoration: "Реставрация",
  other: "Прочее",
};

export type SuggestedTemplate = { id: string; name: string; defaultPrice: number };

export type VoiceDiagnosisEntry = {
  fdi: number;
  condition: string;
  notes: string;
  price: number;
  mkb10Code?: string;
  suggestedTemplates?: SuggestedTemplate[];
};

type VoiceDraft = {
  timestamp: number;
  transcript: string;
  entries: VoiceDiagnosisEntry[];
  selectedServiceIds: Record<number, string[]>;
};

type Phase = "idle" | "recording" | "processing" | "review" | "applying";

interface Props {
  patientId: string;
  onClose: () => void;
  onApplied?: () => void;
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function VoiceDiagnosisModal({ patientId, onClose, onApplied }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const updateToothMutation = useUpdateTooth();
  const createProcedureMutation = useCreateProcedure();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [entries, setEntries] = useState<VoiceDiagnosisEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Per-tooth: selected service IDs
  const [selectedServiceIds, setSelectedServiceIds] = useState<Record<number, Set<string>>>({});
  // Per-tooth: expanded service panel
  const [expandedFdi, setExpandedFdi] = useState<number | null>(null);
  // Per-tooth expanded category browser
  const [browseCategory, setBrowseCategory] = useState<string | null>(null);

  // Draft state
  const DRAFT_KEY = `1dent:voice-draft:${patientId}`;
  const [draftInfo, setDraftInfo] = useState<{ ts: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch all procedure templates for the service picker
  const { data: allTemplatesData } = useListProcedureTemplates(undefined, {
    query: { staleTime: 60_000 },
  });
  const allTemplates: ProcedureTemplate[] = useMemo(
    () => allTemplatesData?.data?.templates ?? [],
    [allTemplatesData],
  );

  // ── Draft management ────────────────────────────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft: VoiceDraft = JSON.parse(raw);
      if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
        setDraftInfo({ ts: draft.timestamp });
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [DRAFT_KEY]);

  const saveDraft = useCallback(() => {
    if (entries.length === 0) return;
    const draft: VoiceDraft = {
      timestamp: Date.now(),
      transcript,
      entries,
      selectedServiceIds: Object.fromEntries(
        Object.entries(selectedServiceIds).map(([k, v]) => [k, [...v]]),
      ),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [DRAFT_KEY, transcript, entries, selectedServiceIds]);

  // Auto-save every time review state changes
  useEffect(() => {
    if (phase === "review") saveDraft();
  }, [phase, entries, selectedServiceIds, saveDraft]);

  const restoreDraft = () => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft: VoiceDraft = JSON.parse(raw);
      setTranscript(draft.transcript);
      setEntries(draft.entries);
      const restored: Record<number, Set<string>> = {};
      for (const [k, v] of Object.entries(draft.selectedServiceIds)) {
        restored[Number(k)] = new Set(v as string[]);
      }
      setSelectedServiceIds(restored);
      setPhase("review");
      setDraftInfo(null);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
      setDraftInfo(null);
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftInfo(null);
  };

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  // ── Recording ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "recording") { setRecordingSeconds(0); return; }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pickMimeType = () => {
        const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
        for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t;
        return "";
      };
      const mimeType = pickMimeType();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const actualMime = mr.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        await sendAudio(blob, actualMime);
      };
      mr.start(250);
      setPhase("recording");
    } catch {
      const msg = "Не удалось получить доступ к микрофону. Проверьте разрешения браузера.";
      setError(msg);
      toast({ title: "Нет доступа к микрофону", description: msg, variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    setPhase("processing");
    mediaRecorderRef.current?.stop();
  }, []);

  const getAudioExt = (mime: string) => {
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("mpeg")) return "mp4";
    return "webm";
  };

  const sendAudio = async (blob: Blob, mimeType: string) => {
    const ext = getAudioExt(mimeType);
    const formData = new FormData();
    formData.append("audio", blob, `recording.${ext}`);
    const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
    const baseUrl = getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/patients/${patientId}/teeth/voice-diagnose`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(json.error ?? json.message ?? `Ошибка сервера: ${res.status}`);
      }
      const json = (await res.json()) as {
        success: boolean;
        data: { transcript: string; diagnoses: VoiceDiagnosisEntry[] };
      };
      setTranscript(json.data.transcript ?? "");
      setEntries(json.data.diagnoses ?? []);
      setSelectedServiceIds({});
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при обработке голоса");
      setPhase("idle");
    }
  };

  // ── Entry editing ────────────────────────────────────────────────────────────

  const updateEntry = (idx: number, patch: Partial<VoiceDiagnosisEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => {
      const removed = prev[idx];
      if (removed) {
        setSelectedServiceIds((s) => {
          const next = { ...s };
          delete next[removed.fdi];
          return next;
        });
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Service selection ────────────────────────────────────────────────────────

  const toggleService = (fdi: number, id: string) => {
    setSelectedServiceIds((prev) => {
      const cur = new Set(prev[fdi] ?? []);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      return { ...prev, [fdi]: cur };
    });
  };

  const totalSelectedServices = useMemo(
    () => Object.values(selectedServiceIds).reduce((sum, s) => sum + s.size, 0),
    [selectedServiceIds],
  );

  const totalServiceCost = useMemo(() => {
    let sum = 0;
    for (const [fdiStr, ids] of Object.entries(selectedServiceIds)) {
      void fdiStr;
      for (const id of ids) {
        const tpl = allTemplates.find((t) => t.id === id);
        if (tpl) sum += tpl.defaultPrice ?? 0;
      }
    }
    return sum;
  }, [selectedServiceIds, allTemplates]);

  // ── Apply ────────────────────────────────────────────────────────────────────

  const applyAll = async () => {
    if (entries.length === 0) return;
    setPhase("applying");

    let appliedTeeth = 0;
    const toothErrors: string[] = [];

    for (const entry of entries) {
      try {
        await updateToothMutation.mutateAsync({
          id: patientId,
          toothFdi: entry.fdi,
          data: {
            condition: entry.condition as ToothCondition,
            notes: entry.notes || undefined,
          },
        });
        appliedTeeth++;
      } catch {
        toothErrors.push(`Зуб ${entry.fdi}`);
      }
    }

    await qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });

    // Create procedures for selected services
    let appliedServices = 0;
    const serviceErrors: string[] = [];

    for (const [fdiStr, ids] of Object.entries(selectedServiceIds)) {
      const fdi = Number(fdiStr);
      for (const id of ids) {
        const tpl = allTemplates.find((t) => t.id === id);
        if (!tpl) continue;
        try {
          await createProcedureMutation.mutateAsync({
            data: {
              patientId,
              doctorId: user?.id,
              templateId: tpl.id,
              name: `[Зуб ${fdi}] ${tpl.name}`,
              price: tpl.defaultPrice,
            },
          });
          appliedServices++;
        } catch {
          serviceErrors.push(tpl.name);
        }
      }
    }

    if (appliedServices > 0) {
      await qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
    }

    clearDraft();

    const parts: string[] = [];
    if (appliedTeeth > 0) parts.push(`${appliedTeeth} ${plural(appliedTeeth, "зуб", "зуба", "зубов")}`);
    if (appliedServices > 0) parts.push(`${appliedServices} ${plural(appliedServices, "услуга", "услуги", "услуг")} добавлено`);

    if (toothErrors.length === 0 && serviceErrors.length === 0) {
      toast({ title: `Диагностика применена: ${parts.join(", ")}` });
    } else {
      const errParts = [...toothErrors, ...serviceErrors].join(", ");
      toast({
        title: `Применено частично: ${parts.join(", ")}`,
        description: `Ошибки: ${errParts}`,
        variant: "destructive",
      });
    }

    onApplied?.();
    onClose();
  };

  // ── Per-entry service panel ──────────────────────────────────────────────────

  const ServicePanel = ({ entry }: { entry: VoiceDiagnosisEntry }) => {
    const fdi = entry.fdi;
    const defaultCat = CONDITION_TO_CATEGORY[entry.condition];
    const activeCat = browseCategory ?? defaultCat;

    const displayedTemplates = useMemo(
      () =>
        activeCat
          ? allTemplates.filter((t) => t.category === activeCat && t.defaultPrice > 0)
          : entry.suggestedTemplates ?? [],
      [entry.suggestedTemplates, activeCat],
    );

    const suggestedIds = useMemo(
      () => new Set((entry.suggestedTemplates ?? []).map((t) => t.id)),
      [entry.suggestedTemplates],
    );

    const selected = selectedServiceIds[fdi] ?? new Set<string>();
    const selectedCount = selected.size;

    const allCategories = useMemo(
      () => [...new Set(allTemplates.map((t) => t.category))].filter(Boolean).sort(),
      [],
    );

    return (
      <div className="space-y-2">
        {/* Category tabs */}
        {allTemplates.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {defaultCat && (
              <button
                onClick={() => setBrowseCategory(null)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-full border transition-colors",
                  !browseCategory
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {CATEGORY_LABELS[defaultCat] ?? defaultCat}
              </button>
            )}
            {allCategories
              .filter((c) => c !== defaultCat)
              .map((cat) => (
                <button
                  key={cat}
                  onClick={() => setBrowseCategory(cat)}
                  className={cn(
                    "text-[10px] px-2 py-1 rounded-full border transition-colors",
                    browseCategory === cat
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
          </div>
        )}

        {/* Template list */}
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {displayedTemplates.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2 text-center">
              Нет услуг в этой категории
            </p>
          ) : (
            displayedTemplates.map((tpl) => {
              const checked = selected.has(tpl.id);
              const isSuggested = suggestedIds.has(tpl.id);
              return (
                <button
                  key={tpl.id}
                  onClick={() => toggleService(fdi, tpl.id)}
                  className={cn(
                    "w-full flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left text-[11px] transition-all",
                    checked
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/40 hover:bg-slate-50",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {checked
                      ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                      : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground leading-snug">{tpl.name}</span>
                      {isSuggested && !browseCategory && (
                        <span className="shrink-0 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                          ИИ
                        </span>
                      )}
                    </span>
                    <span className="block mt-0.5 text-primary font-semibold">
                      {tpl.defaultPrice > 0
                        ? `${tpl.defaultPrice.toLocaleString("ru-KZ")} ₸`
                        : "Бесплатно"}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {selectedCount > 0 && (
          <p className="text-[11px] text-primary font-medium text-right">
            Выбрано: {selectedCount} {plural(selectedCount, "услуга", "услуги", "услуг")}
          </p>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-foreground">Голосовая диагностика</h2>
              <p className="text-[11px] text-muted-foreground">Диктуйте на русском, казахском или английском</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phase === "review" && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Черновик сохранён
              </div>
            )}
            <button
              onClick={onClose}
              disabled={phase === "recording" || phase === "applying"}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Draft restore banner */}
        {draftInfo && phase === "idle" && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-800">Есть несохранённый черновик</p>
              <p className="text-[11px] text-amber-600">Сохранён в {formatTime(draftInfo.ts)}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={discardDraft}
                className="text-[11px] text-amber-600 hover:text-amber-800 transition-colors"
              >
                Удалить
              </button>
              <Button size="sm" onClick={restoreDraft} className="h-6 text-[11px] px-2.5 gap-1">
                <RotateCcw className="w-3 h-3" />
                Восстановить
              </Button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* Idle / Recording */}
          {(phase === "idle" || phase === "recording") && (
            <div className="flex flex-col items-center justify-center gap-6 py-10 px-6">
              {phase === "idle" && (
                <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                  Нажмите кнопку и продиктуйте состояние зубов. Например:
                  <span className="block mt-2 italic text-xs bg-slate-50 border border-border/40 rounded-lg px-3 py-2 text-foreground/70 leading-relaxed">
                    «Шестнадцатый — кариес. Двадцать первый — коронка. Сорок шестой требует удаления»
                  </span>
                </p>
              )}

              {phase === "recording" && (
                <div className="flex flex-col items-center gap-5 w-full">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-24 h-24 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "1.4s" }} />
                    <span className="absolute w-20 h-20 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: "1.8s" }} />
                    <div className="relative w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg">
                      <Mic className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-lg font-mono font-bold tabular-nums text-foreground">
                      {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}
                    </p>
                    <p className="text-xs text-muted-foreground">Говорите чётко, затем нажмите «Готово»</p>
                  </div>
                  <div className="flex items-end gap-[3px] h-7">
                    {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 1, 0.6, 0.4, 0.75, 0.9].map((h, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-primary"
                        style={{ height: `${h * 100}%`, animation: `soundbar 0.9s ease-in-out ${(i * 0.07).toFixed(2)}s infinite alternate` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                {phase === "idle" && (
                  <Button onClick={startRecording} className="gap-2 px-6">
                    <Mic className="w-4 h-4" />
                    Начать запись
                  </Button>
                )}
                {phase === "recording" && (
                  <Button onClick={stopRecording} className="gap-2 px-8 py-5 text-base font-semibold shadow-md">
                    <Check className="w-5 h-5" />
                    Готово
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">ИИ обрабатывает запись...</p>
                <p className="text-xs text-muted-foreground mt-1">Транскрибирование и анализ диагнозов</p>
              </div>
            </div>
          )}

          {/* Review */}
          {phase === "review" && (
            <div className="p-4 space-y-3">
              {/* Transcript */}
              {transcript && (
                <>
                  <button
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-border/40 rounded-xl text-left hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-xs font-medium text-muted-foreground">Расшифровка речи</span>
                    {transcriptOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {transcriptOpen && (
                    <p className="text-xs text-muted-foreground bg-slate-50 border border-border/40 rounded-xl px-3 py-2 leading-relaxed italic">
                      «{transcript}»
                    </p>
                  )}
                </>
              )}

              {entries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Не удалось распознать диагнозы. Попробуйте снова.</p>
                  <Button variant="outline" onClick={() => setPhase("idle")} className="gap-2">
                    <Mic className="w-3.5 h-3.5" />
                    Записать снова
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground px-1">
                    Проверьте диагнозы и выберите услуги из прейскуранта:
                  </p>

                  <div className="space-y-2">
                    {entries.map((entry, idx) => {
                      const cfg = CONDITION_CONFIG[entry.condition as ToothCondition];
                      const isExpanded = expandedFdi === entry.fdi;
                      const selectedCount = selectedServiceIds[entry.fdi]?.size ?? 0;
                      const hasSuggestions = (entry.suggestedTemplates?.length ?? 0) > 0;

                      return (
                        <div
                          key={idx}
                          className="border border-border/50 rounded-xl bg-white hover:border-primary/30 transition-colors overflow-hidden"
                        >
                          {/* Tooth header */}
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {cfg && (
                                  <span
                                    className="w-3 h-3 rounded border shrink-0"
                                    style={{ background: cfg.crownFill, borderColor: cfg.stroke }}
                                  />
                                )}
                                <span className="text-xs font-bold text-foreground">Зуб {entry.fdi}</span>
                              </div>
                              <button
                                onClick={() => removeEntry(idx)}
                                className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Диагноз</label>
                                <select
                                  value={entry.condition}
                                  onChange={(e) => {
                                    updateEntry(idx, { condition: e.target.value });
                                    setBrowseCategory(null);
                                  }}
                                  className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                  {CONDITION_VALUES.map((c) => (
                                    <option key={c} value={c}>{CONDITION_CONFIG[c]?.label ?? c}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Базовая цена</label>
                                <div className="w-full text-xs border border-border/50 rounded-lg px-2 py-1.5 bg-slate-50 text-foreground/70">
                                  {entry.price > 0 ? `${entry.price.toLocaleString("ru-KZ")} ₸` : "—"}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Примечания</label>
                              <input
                                type="text"
                                value={entry.notes}
                                onChange={(e) => updateEntry(idx, { notes: e.target.value })}
                                placeholder="Дополнительные заметки..."
                                className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                              />
                            </div>

                            {/* Services expand toggle */}
                            <button
                              onClick={() => {
                                setExpandedFdi(isExpanded ? null : entry.fdi);
                                setBrowseCategory(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                                isExpanded
                                  ? "bg-primary/5 border-primary/30"
                                  : "bg-slate-50 border-border/50 hover:bg-slate-100",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Stethoscope className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-foreground">
                                  Услуги из прейскуранта
                                </span>
                                {!isExpanded && hasSuggestions && (
                                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                    {entry.suggestedTemplates!.length} от ИИ
                                  </span>
                                )}
                                {selectedCount > 0 && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                                    ✓ {selectedCount}
                                  </span>
                                )}
                              </div>
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                : <Plus className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </div>

                          {/* Expanded service panel */}
                          {isExpanded && (
                            <div className="border-t border-border/40 bg-slate-50/60 px-3 py-3">
                              <ServicePanel entry={entry} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setPhase("idle")}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Записать снова
                  </button>
                </>
              )}
            </div>
          )}

          {/* Applying */}
          {phase === "applying" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Применяем диагнозы и услуги...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && entries.length > 0 && (
          <div className="shrink-0 border-t border-border/50 bg-gray-50/50 px-5 py-4 space-y-2">
            {/* Cost summary */}
            {totalSelectedServices > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {totalSelectedServices} {plural(totalSelectedServices, "услуга", "услуги", "услуг")} из прейскуранта
                </span>
                <span className="font-bold text-primary">
                  {totalServiceCost.toLocaleString("ru-KZ")} ₸
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {entries.length} {plural(entries.length, "зуб", "зуба", "зубов")}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} size="sm">
                  Отмена
                </Button>
                <Button onClick={() => void applyAll()} size="sm" className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Применить
                  {totalSelectedServices > 0 && ` + ${totalSelectedServices} услуг`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
