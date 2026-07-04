import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, Loader2, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONDITION_META, type ToothCondition } from "./mock-data";

type Phase = "idle" | "recording" | "processing" | "review";

/** Демо-результат распознавания (бэкенд подключим позже) */
const DEMO_TRANSCRIPT =
  "Шестнадцатый зуб — пролечен. Двадцать четвёртый — кариес. Тридцать шестой — пульпит, нужны каналы.";

const DEMO_ENTRIES: { fdi: number; condition: ToothCondition; note: string }[] = [
  { fdi: 16, condition: "treated", note: "Пломба в норме" },
  { fdi: 24, condition: "cavity", note: "Поверхностный кариес" },
  { fdi: 36, condition: "root_canal", note: "Пульпит, требуется эндодонтия" },
];

interface Props {
  patientName: string;
  onClose: () => void;
  onApply: (updates: Record<number, ToothCondition>) => void;
}

export function TabletVoiceDiagnosisModal({ patientName, onClose, onApply }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const startRecording = () => {
    setPhase("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    stopTimer();
    setPhase("processing");
    setTimeout(() => {
      setTranscript(DEMO_TRANSCRIPT);
      setPhase("review");
    }, 1400);
  };

  const handleApply = () => {
    const updates: Record<number, ToothCondition> = {};
    DEMO_ENTRIES.forEach((e) => { updates[e.fdi] = e.condition; });
    onApply(updates);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#e8e3d9] bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e3d9] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f75fe]/10">
              <Mic className="h-5 w-5 text-[#1f75fe]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0f172a]">Голосовая диагностика</h2>
              <p className="text-xs text-[#64748b]">{patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "recording" || phase === "processing"}
            className="rounded-xl p-2 text-[#64748b] hover:bg-[#faf8f4] disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {(phase === "idle" || phase === "recording") && (
            <div className="flex flex-col items-center gap-6 py-8">
              {phase === "idle" && (
                <>
                  <p className="max-w-md text-center text-sm leading-relaxed text-[#64748b]">
                    Нажмите кнопку и продиктуйте состояние зубов. Например:
                  </p>
                  <p className="rounded-xl border border-[#e8e3d9] bg-[#faf8f4] px-4 py-3 text-center text-xs italic leading-relaxed text-[#64748b]">
                    «Шестнадцатый — кариес. Двадцать первый — коронка. Тридцать шестой — каналы»
                  </p>
                </>
              )}

              {phase === "recording" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#1f75fe]/20" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#1f75fe] shadow-lg">
                      <Mic className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <p className="font-mono text-2xl font-bold text-[#1f75fe]">{fmt(seconds)}</p>
                  <p className="text-sm text-[#64748b]">Слушаю…</p>
                </div>
              )}

              <button
                type="button"
                onClick={phase === "idle" ? startRecording : stopRecording}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white transition-colors",
                  phase === "recording" ? "bg-[#dc2626] hover:bg-[#b91c1c]" : "bg-[#1f75fe] hover:bg-[#1a65e8]",
                )}
              >
                <Mic className="h-5 w-5" />
                {phase === "recording" ? "Остановить запись" : "Начать запись"}
              </button>
            </div>
          )}

          {phase === "processing" && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-[#1f75fe]" />
              <p className="text-sm font-medium text-[#64748b]">Распознаём и анализируем…</p>
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#e8e3d9] bg-[#faf8f4] p-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#94a3b8]">Транскрипт</p>
                <p className="text-sm leading-relaxed text-[#0f172a]">{transcript}</p>
              </div>

              <p className="text-sm font-bold text-[#0f172a]">
                Найдено зубов: {DEMO_ENTRIES.length}
              </p>

              <div className="space-y-2">
                {DEMO_ENTRIES.map((entry) => {
                  const meta = CONDITION_META[entry.condition];
                  return (
                    <div
                      key={entry.fdi}
                      className="flex items-center gap-3 rounded-xl border border-[#e8e3d9] bg-white p-3"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {entry.fdi}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#0f172a]">{meta.label}</p>
                        <p className="text-xs text-[#64748b]">{entry.note}</p>
                      </div>
                      <Check className="h-5 w-5 shrink-0 text-[#16a34a]" />
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-[#94a3b8]">
                Демо-режим: после подключения бэкенда здесь будет реальное распознавание речи.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="flex gap-3 border-t border-[#e8e3d9] p-4">
            <button
              type="button"
              onClick={() => { setPhase("idle"); setTranscript(""); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#e8e3d9] py-3 text-sm font-semibold text-[#64748b] hover:bg-[#faf8f4]"
            >
              <RotateCcw className="h-4 w-4" /> Заново
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#1f75fe] py-3 text-sm font-bold text-white hover:bg-[#1a65e8]"
            >
              <Check className="h-4 w-4" /> Применить к карте
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
