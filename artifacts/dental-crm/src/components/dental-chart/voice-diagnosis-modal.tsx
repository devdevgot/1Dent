import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, X, Loader2, Check, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateTooth, getListTeethQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/lib/base-url";
import { CONDITION_CONFIG } from "./fdi-chart";
import type { ToothCondition } from "@workspace/api-client-react";

const AUTH_TOKEN_KEY = "auth_token";

const CONDITION_VALUES: ToothCondition[] = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
];

export type VoiceDiagnosisEntry = {
  fdi: number;
  condition: string;
  notes: string;
  price: number;
  mkb10Code?: string;
};

type Phase = "idle" | "recording" | "processing" | "review" | "applying";

interface Props {
  patientId: string;
  onClose: () => void;
  onApplied?: () => void;
}

export function VoiceDiagnosisModal({ patientId, onClose, onApplied }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateToothMutation = useUpdateTooth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [entries, setEntries] = useState<VoiceDiagnosisEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (phase !== "recording") {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pickMimeType = (): string => {
        const candidates = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/mp4;codecs=mp4a.40.2",
          "audio/ogg;codecs=opus",
          "audio/ogg",
        ];
        for (const t of candidates) {
          if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return "";
      };
      const mimeType = pickMimeType();

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const actualMime = mr.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        await sendAudio(blob, actualMime);
      };

      mr.start(250);
      setPhase("recording");
    } catch (err) {
      const msg = "Не удалось получить доступ к микрофону. Проверьте разрешения браузера.";
      setError(msg);
      toast({ title: "Нет доступа к микрофону", description: msg, variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    setPhase("processing");
    mediaRecorderRef.current?.stop();
  }, []);

  const getAudioExt = (mime: string): string => {
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
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при обработке голоса");
      setPhase("idle");
    }
  };

  const updateEntry = (idx: number, patch: Partial<VoiceDiagnosisEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyAll = async () => {
    if (entries.length === 0) return;
    setPhase("applying");
    let applied = 0;
    const errors: string[] = [];

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
        applied++;
      } catch {
        errors.push(`Зуб ${entry.fdi}`);
      }
    }

    await qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });

    if (errors.length === 0) {
      toast({
        title: `Диагностика применена: ${applied} ${plural(applied, "зуб", "зуба", "зубов")} обновлено`,
      });
    } else {
      toast({
        title: `Применено ${applied} из ${entries.length}`,
        description: `Ошибка: ${errors.join(", ")}`,
        variant: "destructive",
      });
    }

    onApplied?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-foreground">Голосовая диагностика</h2>
              <p className="text-[11px] text-muted-foreground">Диктуйте состояние зубов на русском</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "recording" || phase === "applying"}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Idle / Recording phase */}
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
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
                    <div className="relative w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                      <Mic className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-medium text-red-600 animate-pulse">Запись идёт...</p>
                    <p className="text-lg font-mono font-bold text-red-700 tabular-nums">
                      {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">Говорите чётко, затем нажмите «Стоп»</p>
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
                  <Button onClick={stopRecording} variant="destructive" className="gap-2 px-6">
                    <MicOff className="w-4 h-4" />
                    Стоп
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Processing phase */}
          {phase === "processing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Транскрибирование...</p>
                <p className="text-xs text-muted-foreground mt-1">Whisper обрабатывает аудио</p>
              </div>
            </div>
          )}

          {/* Review phase */}
          {phase === "review" && (
            <div className="p-4 space-y-3">
              {/* Transcript collapsible */}
              {transcript && (
                <button
                  onClick={() => setTranscriptOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-border/40 rounded-xl text-left hover:bg-slate-100 transition-colors"
                >
                  <span className="text-xs font-medium text-muted-foreground">Расшифровка речи</span>
                  {transcriptOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
              {transcriptOpen && transcript && (
                <p className="text-xs text-muted-foreground bg-slate-50 border border-border/40 rounded-xl px-3 py-2 leading-relaxed italic">
                  «{transcript}»
                </p>
              )}

              {entries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Не удалось распознать диагнозы. Попробуйте снова.
                  </p>
                  <Button variant="outline" onClick={() => setPhase("idle")} className="gap-2">
                    <Mic className="w-3.5 h-3.5" />
                    Записать снова
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground px-1">
                    Проверьте и отредактируйте диагнозы перед применением:
                  </p>
                  <div className="space-y-2">
                    {entries.map((entry, idx) => {
                      const cfg = CONDITION_CONFIG[entry.condition as ToothCondition];
                      return (
                        <div
                          key={idx}
                          className="border border-border/50 rounded-xl p-3 space-y-2 bg-white hover:border-primary/30 transition-colors"
                        >
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
                            {/* Condition select */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                Диагноз
                              </label>
                              <select
                                value={entry.condition}
                                onChange={(e) => updateEntry(idx, { condition: e.target.value })}
                                className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                {CONDITION_VALUES.map((c) => (
                                  <option key={c} value={c}>
                                    {CONDITION_CONFIG[c]?.label ?? c}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Price — read-only reference; clinic prices managed in Settings */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                Ориентировочная цена
                              </label>
                              <div className="w-full text-xs border border-border/50 rounded-lg px-2 py-1.5 bg-slate-50 text-foreground/70">
                                {entry.price > 0 ? `${entry.price.toLocaleString("ru-KZ")} ₸` : "—"}
                              </div>
                            </div>
                          </div>

                          {/* Notes */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Примечания
                            </label>
                            <input
                              type="text"
                              value={entry.notes}
                              onChange={(e) => updateEntry(idx, { notes: e.target.value })}
                              placeholder="Дополнительные заметки..."
                              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                            />
                          </div>
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

          {/* Applying phase */}
          {phase === "applying" && (
            <div className="flex flex-col items-center justify-center gap-4 py-14">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Применяем диагнозы...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && entries.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border/50 bg-gray-50/50">
            <span className="text-xs text-muted-foreground">
              {entries.length} {plural(entries.length, "зуб", "зуба", "зубов")}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} size="sm">
                Отмена
              </Button>
              <Button onClick={applyAll} size="sm" className="gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Применить все
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
