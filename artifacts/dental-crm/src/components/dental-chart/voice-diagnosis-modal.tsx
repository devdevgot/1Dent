import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Mic, X, Loader2, Check, Trash2, ChevronDown, ChevronRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListProcedureTemplates,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { requestMicrophoneAccess } from "@/lib/device-permissions";
import { useIsSlashTablet } from "@/hooks/use-slash-tablet";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import { CONDITION_CONFIG } from "./fdi-chart";
import type { ToothCondition } from "@workspace/api-client-react";
import { matchVoiceServices } from "@/lib/voice-service-matching";
import { VoiceRecordingIndicator } from "./voice-recording-indicator";

const AUTH_TOKEN_KEY = "auth_token";
const MIN_RECORDING_MS = 1_500;
const MIN_AUDIO_BYTES = 2_000;
// Long exams (20-30 teeth) can take up to ~110s on the server (two STT model
// attempts at 55s each) plus upload time — keep the client budget above that.
const UPLOAD_TIMEOUT_MS = 150_000;
const APPLY_TIMEOUT_MS = 60_000;
const VOICE_AUDIO_BITS_PER_SECOND = 32_000;

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
  // missing tooth → show implantation options first (bridge/denture via orthopedics also relevant)
  missing: "implantation",
};

export type SuggestedTemplate = { id: string; name: string; defaultPrice: number };

export type VoiceDiagnosisEntry = {
  fdi: number;
  condition: string;
  notes: string;
  diagnosisText?: string;
  spokenProcedure?: string;
  price: number;
  mkb10Code?: string;
  suggestedTemplates?: SuggestedTemplate[];
  bestMatchId?: string;
};

type VoiceDraft = {
  timestamp: number;
  transcript: string;
  entries: VoiceDiagnosisEntry[];
  selectedServiceIds: Record<number, string>;
};

type Phase = "idle" | "recording" | "processing" | "review" | "applying";

export type VoiceDiagnosisApplyResult = {
  entries: VoiceDiagnosisEntry[];
  servicesByTooth: Map<number, ProcedureTemplate[]>;
  appliedFdis: number[];
};

interface Props {
  patientId: string;
  activePlanId?: string;
  onClose: () => void;
  onApplied?: (result: VoiceDiagnosisApplyResult) => void;
  initialRestoreDraft?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatVoiceApiError(err: unknown, status?: number, serverMessage?: string): string {
  const raw = serverMessage ?? (err instanceof Error ? err.message : "");
  if (err instanceof Error && err.name === "AbortError") {
    return "Превышено время ожидания. Попробуйте ещё раз или продиктуйте 10–12 зубов за одну запись.";
  }
  if (
    status === 502
    || status === 504
    || raw.includes("Application failed to respond")
    || raw.includes("Gateway Timeout")
  ) {
    return "Сервер не успел обработать длинную запись. Повторите или разделите осмотр на две записи по 10–12 зубов.";
  }
  if (raw) return raw.replace(/^HTTP \d+[^:]*:\s*/, "");
  return "Ошибка при обработке голоса";
}

async function voiceApiFetch<T>(
  url: string,
  init: RequestInit,
  timeoutMs = UPLOAD_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      message?: string;
      data?: T;
    };
    if (!res.ok) {
      throw new Error(formatVoiceApiError(null, res.status, json.error ?? json.message));
    }
    return json as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Сервер не успел")) throw err;
    if (err instanceof Error && err.message.startsWith("Превышено время")) throw err;
    throw new Error(formatVoiceApiError(err));
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

function normalizeDraftSelections(
  raw: Record<number, string | string[]>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      if (v[0]) out[Number(k)] = v[0];
    } else if (v) {
      out[Number(k)] = v;
    }
  }
  return out;
}

function rematchEntryServices(
  entry: VoiceDiagnosisEntry,
  transcript: string,
  templates: ProcedureTemplate[],
): VoiceDiagnosisEntry {
  const category = CONDITION_TO_CATEGORY[entry.condition];
  const { suggestions, bestMatchId } = matchVoiceServices({
    transcript,
    condition: entry.condition,
    diagnosisText: entry.diagnosisText,
    notes: entry.notes,
    spokenProcedure: entry.spokenProcedure,
    fdi: entry.fdi,
    templates,
    category,
  });
  const best = suggestions.find((s) => s.id === bestMatchId);
  return {
    ...entry,
    suggestedTemplates: suggestions,
    bestMatchId,
    price: best?.defaultPrice ?? entry.price,
  };
}

export function VoiceDiagnosisModal({ patientId, activePlanId, onClose, onApplied, initialRestoreDraft }: Props) {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [entries, setEntries] = useState<VoiceDiagnosisEntry[]>([]);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [recordingAudioCtx, setRecordingAudioCtx] = useState<AudioContext | null>(null);
  const [processingStep, setProcessingStep] = useState<"transcribing" | "parsing">("transcribing");
  const [processingSeconds, setProcessingSeconds] = useState(0);
  const [applySummary, setApplySummary] = useState<{ teeth: number; services: number } | null>(null);

  // Per-tooth: one selected service from relevant transcript matches
  const [selectedServiceIds, setSelectedServiceIds] = useState<Record<number, string>>({});

  // Draft state
  const DRAFT_KEY = `1dent:voice-draft:${patientId}`;
  const [draftInfo, setDraftInfo] = useState<{ ts: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const processingAbortRef = useRef<AbortController | null>(null);

  // Fetch all procedure templates for the service picker
  const { data: allTemplatesData } = useListProcedureTemplates(undefined, {
    query: { queryKey: ["procedure-templates-all"], staleTime: 60_000 },
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
        if (initialRestoreDraft) {
          setTranscript(draft.transcript);
          setEntries(draft.entries);
          setSelectedServiceIds(normalizeDraftSelections(draft.selectedServiceIds));
          setPhase("review");
        } else {
          setDraftInfo({ ts: draft.timestamp });
        }
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [DRAFT_KEY, initialRestoreDraft]);

  const saveDraft = useCallback(() => {
    if (entries.length === 0) return;
    const draft: VoiceDraft = {
      timestamp: Date.now(),
      transcript,
      entries,
      selectedServiceIds,
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
      setSelectedServiceIds(normalizeDraftSelections(draft.selectedServiceIds as Record<number, string | string[]>));
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
    if (phase !== "recording") {
      setRecordingSeconds(0);
      recordingStartedAtRef.current = null;
      return;
    }
    recordingStartedAtRef.current = Date.now();
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "processing") {
      setProcessingSeconds(0);
      return;
    }
    setProcessingSeconds(0);
    const id = setInterval(() => setProcessingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const clearRecordingAudio = useCallback(() => {
    setRecordingStream(null);
    setRecordingAudioCtx((prev) => {
      if (prev && prev.state !== "closed") void prev.close();
      return null;
    });
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setParseWarning(null);
    try {
      const stream = await requestMicrophoneAccess({ keepStream: true });
      if (!stream) {
        setError("Нет доступа к микрофону");
        return;
      }
      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      streamRef.current = stream;
      setRecordingStream(stream);
      setRecordingAudioCtx(audioCtx);
      const pickMimeType = () => {
        const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
        for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t;
        return "";
      };
      const mimeType = pickMimeType();
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: VOICE_AUDIO_BITS_PER_SECOND,
      };
      if (mimeType) recorderOptions.mimeType = mimeType;
      let mr: MediaRecorder;
      try {
        mr = new MediaRecorder(stream, recorderOptions);
      } catch {
        mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      }
      const actualMime = mr.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        clearRecordingAudio();
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
  }, [toast, clearRecordingAudio]);

  const stopRecording = useCallback(() => {
    const elapsed = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : 0;
    if (elapsed < MIN_RECORDING_MS) {
      toast({
        title: "Слишком короткая запись",
        description: "Говорите дольше — минимум 2 секунды",
        variant: "destructive",
      });
      return;
    }
    setPhase("processing");
    mediaRecorderRef.current?.stop();
  }, [toast]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    processingAbortRef.current?.abort();
    setRecordingStream(null);
    setRecordingAudioCtx((prev) => {
      if (prev && prev.state !== "closed") void prev.close();
      return null;
    });
  }, []);

  const getAudioExt = (mime: string) => {
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("mpeg")) return "mp4";
    return "webm";
  };

  const cancelProcessing = useCallback(() => {
    processingAbortRef.current?.abort();
    processingAbortRef.current = null;
    setError("Обработка отменена");
    setPhase("idle");
  }, []);

  const sendAudio = async (blob: Blob, mimeType: string) => {
    if (blob.size < MIN_AUDIO_BYTES) {
      setError("Запись слишком короткая. Поднесите микрофон ближе и говорите дольше.");
      setPhase("idle");
      return;
    }

    const ext = getAudioExt(mimeType);
    const file = new File([blob], `recording.${ext}`, { type: mimeType });
    const formData = new FormData();
    formData.append("audio", file);
    const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
    const baseUrl = getBaseUrl();
    const authHeaders = { Authorization: `Bearer ${token}` };

    const abort = new AbortController();
    processingAbortRef.current = abort;
    setProcessingStep("transcribing");

    try {
      const transcribeJson = await voiceApiFetch<{
        success: boolean;
        data: { transcript: string };
      }>(`${baseUrl}/api/patients/${patientId}/teeth/voice-diagnose/transcribe`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      }, UPLOAD_TIMEOUT_MS, abort.signal);

      const nextTranscript = transcribeJson.data?.transcript ?? "";
      if (!nextTranscript.trim()) {
        throw new Error("Не удалось распознать речь. Попробуйте записать снова.");
      }

      setTranscript(nextTranscript);
      setProcessingStep("parsing");

      const parseJson = await voiceApiFetch<{
        success: boolean;
        data: { transcript: string; diagnoses: VoiceDiagnosisEntry[]; parseWarning?: string };
      }>(`${baseUrl}/api/patients/${patientId}/teeth/voice-diagnose/parse`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: nextTranscript }),
      }, UPLOAD_TIMEOUT_MS, abort.signal);

      const diagEntries = parseJson.data?.diagnoses ?? [];
      setTranscript(parseJson.data?.transcript ?? nextTranscript);
      setEntries(diagEntries);
      setParseWarning(parseJson.data?.parseWarning ?? null);
      const autoSelected: Record<number, string> = {};
      for (const d of diagEntries) {
        if (d.bestMatchId) autoSelected[d.fdi] = d.bestMatchId;
      }
      setSelectedServiceIds(autoSelected);
      setPhase("review");
    } catch (err) {
      if (abort.signal.aborted) {
        setError("Обработка отменена");
        setPhase("idle");
        return;
      }
      setError(formatVoiceApiError(err));
      setPhase("idle");
    } finally {
      if (processingAbortRef.current === abort) {
        processingAbortRef.current = null;
      }
    }
  };

  // ── Entry editing ────────────────────────────────────────────────────────────

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

  const setServiceForTooth = (fdi: number, serviceId: string) => {
    setSelectedServiceIds((prev) => ({ ...prev, [fdi]: serviceId }));
  };

  const getServicePrice = useCallback((entry: VoiceDiagnosisEntry, serviceId?: string) => {
    const resolved =
      serviceId !== undefined
        ? serviceId
        : entry.fdi in selectedServiceIds
          ? selectedServiceIds[entry.fdi]
          : (entry.bestMatchId ?? "");
    if (!resolved) return entry.price;
    const id = resolved;
    const fromSuggestions = entry.suggestedTemplates?.find((s) => s.id === id);
    if (fromSuggestions) return fromSuggestions.defaultPrice;
    const tpl = allTemplates.find((t) => t.id === id);
    return tpl?.defaultPrice ?? entry.price;
  }, [selectedServiceIds, allTemplates]);

  const totalSelectedServices = useMemo(
    () => Object.values(selectedServiceIds).filter(Boolean).length,
    [selectedServiceIds],
  );

  const totalServiceCost = useMemo(() => {
    let sum = 0;
    for (const entry of entries) {
      const id = entry.fdi in selectedServiceIds
        ? selectedServiceIds[entry.fdi]
        : (entry.bestMatchId ?? "");
      if (id) sum += getServicePrice(entry, id);
    }
    return sum;
  }, [entries, selectedServiceIds, getServicePrice]);

  // ── Apply ────────────────────────────────────────────────────────────────────

  const applyAll = async () => {
    if (entries.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast({
        title: "Нет сети",
        description: "Голосовую диагностику можно применить только онлайн",
        variant: "destructive",
      });
      return;
    }

    const serviceJobs = Object.entries(selectedServiceIds)
      .filter(([, id]) => Boolean(id))
      .map(([fdiStr, id]) => ({ fdi: Number(fdiStr), templateId: id! }));

    setApplySummary({ teeth: entries.length, services: serviceJobs.length });
    setPhase("applying");

    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
      const baseUrl = getBaseUrl();
      const payload = {
        entries: entries.map((e) => ({
          fdi: e.fdi,
          condition: e.condition,
          notes: e.notes || undefined,
          mkb10Code: e.mkb10Code || undefined,
        })),
        services: serviceJobs,
        activePlanId: activePlanId || undefined,
      };

      const applyJson = await voiceApiFetch<{
        success: boolean;
        data: {
          appliedTeeth: number;
          appliedServices: number;
          appliedFdis: number[];
          errors: Array<{ fdi: number; kind: string; message: string }>;
        };
      }>(`${baseUrl}/api/patients/${patientId}/teeth/voice-diagnose/apply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }, APPLY_TIMEOUT_MS);

      const result = applyJson.data;
      const appliedTeeth = result?.appliedTeeth ?? 0;
      const appliedServices = result?.appliedServices ?? 0;
      const appliedFdis = result?.appliedFdis ?? [];
      const applyErrors = result?.errors ?? [];

      const toothErrors = applyErrors
        .filter((e) => e.kind === "tooth")
        .map((e) => `Зуб ${e.fdi}`);
      const serviceErrors = applyErrors
        .filter((e) => e.kind === "service")
        .map((e) => `Услуга (зуб ${e.fdi})`);
      // planItem failures are non-critical (same as before) — mention only if nothing else failed
      const planErrors = applyErrors
        .filter((e) => e.kind === "planItem")
        .map((e) => `План (зуб ${e.fdi})`);

      const parts: string[] = [];
      if (appliedTeeth > 0) parts.push(`${appliedTeeth} ${plural(appliedTeeth, "зуб", "зуба", "зубов")}`);
      if (appliedServices > 0) parts.push(`${appliedServices} ${plural(appliedServices, "услуга", "услуги", "услуг")} добавлено`);

      const criticalErrors = [...toothErrors, ...serviceErrors];
      if (criticalErrors.length === 0) {
        clearDraft();
        toast({
          title: `Диагностика применена: ${parts.join(", ") || "готово"}`,
          description: planErrors.length > 0 ? `План: ${planErrors.join(", ")}` : undefined,
        });
      } else {
        // Keep the draft so the doctor can reopen the modal and re-apply
        // (tooth saves are idempotent upserts).
        saveDraft();
        toast({
          title: `Применено частично: ${parts.join(", ") || "0"}`,
          description: `Ошибки: ${[...criticalErrors, ...planErrors].join(", ")}`,
          variant: "destructive",
        });
      }

      const servicesByTooth = new Map<number, ProcedureTemplate[]>();
      for (const [fdiStr, id] of Object.entries(selectedServiceIds)) {
        if (!id) continue;
        const fdi = Number(fdiStr);
        const tpl = allTemplates.find((t) => t.id === id);
        if (tpl) servicesByTooth.set(fdi, [tpl]);
      }

      onApplied?.({ entries, servicesByTooth, appliedFdis });
      onClose();
    } catch (err) {
      setPhase("review");
      toast({
        title: "Ошибка при применении",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setApplySummary(null);
    }
  };

  const handleConditionChange = (idx: number, entry: VoiceDiagnosisEntry, condition: string) => {
    const updated = rematchEntryServices({ ...entry, condition }, transcript, allTemplates);
    setEntries((prev) => prev.map((item, i) => (i === idx ? updated : item)));
    setServiceForTooth(entry.fdi, updated.bestMatchId ?? "");
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const isTablet = useIsSlashTablet();

  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex justify-center bg-black/20 overflow-hidden",
      isTablet ? "items-center p-6" : "items-end sm:items-center sm:p-4",
    )}>
      <div
        className={cn(
          "bg-white border border-[#e8e3d9] shadow-lg w-full min-w-0 flex flex-col overflow-hidden min-h-0",
          isTablet
            ? "max-w-4xl rounded-2xl"
            : "rounded-t-2xl sm:rounded-2xl max-w-[100vw] sm:max-w-3xl",
        )}
        style={{
          height: "min(92dvh, calc(100dvh - env(safe-area-inset-bottom, 0px)))",
          maxHeight: "min(92dvh, calc(100dvh - env(safe-area-inset-bottom, 0px)))",
        }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e8e3d9] shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#0f172a]">Голосовая диагностика</h2>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">Русский, казахский, узбекский, кыргызский, английский</p>
          </div>
          <div className="flex items-center gap-2">
            {phase === "review" && (
              <span className="text-[10px] text-emerald-600">Черновик сохранён</span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "recording" || phase === "applying"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748b] transition-colors hover:bg-[#f1ede4] hover:text-[#0f172a] disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Draft restore banner */}
        {draftInfo && phase === "idle" && (
          <div className="mx-4 mt-3 rounded-xl border border-[#e8e3d9] bg-[#faf8f4] px-3 py-2.5 flex items-center gap-3">
            <Clock className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#0f172a]">Есть несохранённый черновик</p>
              <p className="text-[11px] text-[#94a3b8]">Сохранён в {formatTime(draftInfo.ts)}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={discardDraft}
                className="text-[11px] text-[#64748b] hover:text-[#0f172a] transition-colors"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={restoreDraft}
                className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Восстановить
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar overscroll-contain">

          {/* Idle / Recording */}
          {(phase === "idle" || phase === "recording") && (
            <div className="flex flex-col items-center justify-center gap-8 py-12 px-6">
              {phase === "idle" && (
                <div className="text-center max-w-xs space-y-3">
                  <p className="text-sm text-[#64748b] leading-relaxed">
                    Нажмите кнопку и продиктуйте состояние зубов на любом языке
                  </p>
                  <p className="text-xs text-[#94a3b8] italic leading-relaxed">
                    «16-шы — кариес, пломба» · «O'n oltinchi — karies» · «Sixteen — cavity, crown»
                  </p>
                </div>
              )}

              {phase === "recording" && (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm">
                  <div className="flex items-center gap-2 text-[#64748b]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary/40 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}
                      :
                      {String(recordingSeconds % 60).padStart(2, "0")}
                    </span>
                  </div>

                  <VoiceRecordingIndicator
                    stream={recordingStream}
                    audioContext={recordingAudioCtx}
                    active={phase === "recording"}
                  />

                  <p className="text-xs text-[#94a3b8] text-center">
                    Говорите чётко, затем нажмите «Готово»
                  </p>
                </div>
              )}

              {error && (
                <div className="w-full max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                {phase === "idle" && (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
                  >
                    <Mic className="w-4 h-4" />
                    Начать запись
                  </button>
                )}
                {phase === "recording" && (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
                  >
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                    Готово
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-[#0f172a]">
                  {processingStep === "transcribing" ? "Расшифровка речи…" : "Анализ диагнозов…"}
                </p>
                <p className="text-xs text-[#94a3b8]">
                  {processingStep === "transcribing"
                    ? "Многоязычное распознавание (RU · KK · UZ · KY · EN)"
                    : "Определение зубов FDI и услуг"}
                </p>
                <p className="text-xs text-[#94a3b8] tabular-nums">
                  {String(Math.floor(processingSeconds / 60)).padStart(2, "0")}
                  :
                  {String(processingSeconds % 60).padStart(2, "0")}
                </p>
                {processingSeconds >= 30 && (
                  <p className="text-xs text-[#64748b] max-w-xs leading-relaxed">
                    Длинная запись, обработка может занять до 2 минут
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={cancelProcessing}>
                Отменить
              </Button>
            </div>
          )}

          {/* Review */}
          {phase === "review" && (
            <div className="p-4 space-y-3 min-w-0">
              {parseWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                  {parseWarning}
                </div>
              )}
              {/* Transcript */}
              {transcript && (
                <>
                  <button
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[#faf8f4] border border-[#e8e3d9]/40 rounded-xl text-left hover:bg-[#f1ede4] transition-colors"
                  >
                    <span className="text-xs font-medium text-[#64748b]">Расшифровка (как сказано)</span>
                    {transcriptOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-[#64748b]" />
                      : <ChevronRight className="w-3.5 h-3.5 text-[#64748b]" />}
                  </button>
                  {transcriptOpen && (
                    <p className="text-xs text-[#64748b] bg-[#faf8f4] border border-[#e8e3d9]/40 rounded-xl px-3 py-2 leading-relaxed italic">
                      «{transcript}»
                    </p>
                  )}
                </>
              )}

              {entries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-[#64748b]">Не удалось распознать диагнозы. Попробуйте снова.</p>
                  <Button variant="outline" onClick={() => setPhase("idle")} className="gap-2">
                    <Mic className="w-3.5 h-3.5" />
                    Записать снова
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#64748b] px-1">
                    Проверьте диагнозы. Услуги подбираются по словам врача о процедуре и диагнозе.
                  </p>

                  <div className="border border-[#e8e3d9]/50 rounded-xl overflow-hidden w-full max-w-full isolate">
                    <div className="table-h-scroll w-full max-w-full touch-pan-x overscroll-x-contain">
                      <table className="text-xs w-full table-fixed min-w-[680px]">
                        <colgroup>
                          <col style={{ width: "72px" }} />
                          <col style={{ width: "200px" }} />
                          <col style={{ width: "280px" }} />
                          <col style={{ width: "88px" }} />
                          <col style={{ width: "52px" }} />
                        </colgroup>
                        <thead>
                          <tr className="bg-[#faf8f4] border-b border-[#e8e3d9]/50 text-[10px] uppercase tracking-wide text-[#64748b]">
                            <th className="text-left font-semibold px-3 py-2">Зуб</th>
                            <th className="text-left font-semibold px-3 py-2">Диагноз</th>
                            <th className="text-left font-semibold px-3 py-2">Услуга</th>
                            <th className="text-right font-semibold px-3 py-2">Цена</th>
                            <th className="text-center font-semibold px-2 py-2">Удалить</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--ds-border)]/40">
                          {entries.map((entry, idx) => {
                            const cfg = CONDITION_CONFIG[entry.condition as ToothCondition];
                            const selectedId =
                              entry.fdi in selectedServiceIds
                                ? selectedServiceIds[entry.fdi]
                                : (entry.bestMatchId ?? "");
                            const rowPrice = getServicePrice(entry, selectedId);
                            const suggestions = entry.suggestedTemplates ?? [];

                            return (
                              <tr key={entry.fdi} className="bg-white hover:bg-[#faf8f4]/60">
                                <td className="px-3 py-2.5 align-top">
                                  <div className="flex items-center gap-1.5">
                                    {cfg && (
                                      <span
                                        className="w-2.5 h-2.5 rounded border shrink-0"
                                        style={{ background: cfg.crownFill, borderColor: cfg.stroke }}
                                      />
                                    )}
                                    <span className="font-bold">{entry.fdi}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 align-top space-y-1.5">
                                  <select
                                    value={entry.condition}
                                    onChange={(e) => handleConditionChange(idx, entry, e.target.value)}
                                    className="w-full text-xs border border-[#e8e3d9] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    {CONDITION_VALUES.map((c) => (
                                      <option key={c} value={c}>{CONDITION_CONFIG[c]?.label ?? c}</option>
                                    ))}
                                  </select>
                                  {(entry.diagnosisText || entry.spokenProcedure) && (
                                    <p className="text-[10px] text-[#64748b] leading-snug">
                                      {entry.diagnosisText}
                                      {entry.spokenProcedure && entry.spokenProcedure !== entry.diagnosisText && (
                                        <span className="block italic">«{entry.spokenProcedure}»</span>
                                      )}
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  {suggestions.length > 0 ? (
                                    <select
                                      value={selectedId}
                                      onChange={(e) => setServiceForTooth(entry.fdi, e.target.value)}
                                      className="w-full text-xs border border-[#e8e3d9] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    >
                                      <option value="">— не выбрано —</option>
                                      {suggestions.map((tpl) => (
                                        <option key={tpl.id} value={tpl.id}>
                                          {tpl.name}
                                          {tpl.id === entry.bestMatchId ? " ★" : ""}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <p className="text-[11px] text-[#64748b] py-1.5">
                                      Нет совпадений в расшифровке
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 align-top text-right font-semibold text-primary tabular-nums whitespace-nowrap">
                                  {rowPrice > 0 ? `${rowPrice.toLocaleString("ru-KZ")} ₸` : "—"}
                                </td>
                                <td className="px-2 py-2.5 align-top text-center w-[52px]">
                                  <button
                                    type="button"
                                    onClick={() => removeEntry(idx)}
                                    title="Удалить"
                                    aria-label="Удалить"
                                    className="inline-flex items-center justify-center p-1.5 rounded-lg text-[#64748b] hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    onClick={() => setPhase("idle")}
                    className="text-xs text-[#64748b] hover:text-[#0f172a] underline underline-offset-2 transition-colors"
                  >
                    Записать снова
                  </button>
                </>
              )}
            </div>
          )}

          {/* Applying */}
          {phase === "applying" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14 px-6">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-center">
                {applySummary
                  ? `Сохраняем ${applySummary.teeth} ${plural(applySummary.teeth, "зуб", "зуба", "зубов")}${
                      applySummary.services > 0
                        ? ` и ${applySummary.services} ${plural(applySummary.services, "услугу", "услуги", "услуг")}`
                        : ""
                    }…`
                  : "Применяем диагнозы и услуги…"}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && entries.length > 0 && (
          <div className="shrink-0 border-t border-[#e8e3d9] bg-white px-5 py-4 space-y-2">
            {/* Cost summary */}
            {totalSelectedServices > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">
                  {totalSelectedServices} {plural(totalSelectedServices, "услуга", "услуги", "услуг")} из прейскуранта
                </span>
                <span className="font-bold text-primary">
                  {totalServiceCost.toLocaleString("ru-KZ")} ₸
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#64748b]">
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
