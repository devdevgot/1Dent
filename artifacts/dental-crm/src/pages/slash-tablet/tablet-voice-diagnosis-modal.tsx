import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, Loader2, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlayPanelClass, overlayShellClass } from "@/lib/tablet-overlay-classes";
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
    <div className={overlayShellClass(true)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(overlayPanelClass(true, { tablet: "max-w-2xl" }), "z-10")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f75fe]/10">
              <Mic className="h-5 w-5 text-[var(--ds-primary)]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Голосовая диагностика</h2>
              <p className="text-caption text-[var(--text-secondary)]">{patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "recording" || phase === "processing"}
            className="rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--bg)] disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {(phase === "idle" || phase === "recording") && (
            <div className="flex flex-col items-center gap-6 py-8">
              {phase === "idle" && (
                <>
                  <p className="max-w-md text-center text-body leading-relaxed text-[var(--text-secondary)]">
                    Нажмите кнопку и продиктуйте состояние зубов. Например:
                  </p>
                  <p className="rounded-xl border border-[var(--ds-border)] bg-[var(--bg)] px-4 py-3 text-center text-caption italic leading-relaxed text-[var(--text-secondary)]">
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
                  <p className="font-mono text-2xl font-bold text-[var(--ds-primary)]">{fmt(seconds)}</p>
                  <p className="text-body text-[var(--text-secondary)]">Слушаю…</p>
                </div>
              )}

              <button
                type="button"
                onClick={phase === "idle" ? startRecording : stopRecording}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white transition-colors",
                  phase === "recording" ? "bg-[var(--danger)] hover:bg-[#b91c1c]" : "bg-[#1f75fe] hover:bg-[var(--primary-hover)]",
                )}
              >
                <Mic className="h-5 w-5" />
                {phase === "recording" ? "Остановить запись" : "Начать запись"}
              </button>
            </div>
          )}

          {phase === "processing" && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-[var(--ds-primary)]" />
              <p className="text-body font-medium text-[var(--text-secondary)]">Распознаём и анализируем…</p>
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--bg)] p-3">
                <p className="mb-1 text-caption font-bold uppercase tracking-wide text-[var(--text-subtle)]">Транскрипт</p>
                <p className="text-body leading-relaxed text-[var(--text)]">{transcript}</p>
              </div>

              <p className="text-body font-bold text-[var(--text)]">
                Найдено зубов: {DEMO_ENTRIES.length}
              </p>

              <div className="space-y-2">
                {DEMO_ENTRIES.map((entry) => {
                  const meta = CONDITION_META[entry.condition];
                  return (
                    <div
                      key={entry.fdi}
                      className="flex items-center gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-body font-black"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {entry.fdi}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-[var(--text)]">{meta.label}</p>
                        <p className="text-caption text-[var(--text-secondary)]">{entry.note}</p>
                      </div>
                      <Check className="h-5 w-5 shrink-0 text-[var(--success)]" />
                    </div>
                  );
                })}
              </div>

              <p className="text-caption text-[var(--text-subtle)]">
                Демо-режим: после подключения бэкенда здесь будет реальное распознавание речи.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="flex gap-3 border-t border-[var(--ds-border)] p-4">
            <button
              type="button"
              onClick={() => { setPhase("idle"); setTranscript(""); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--ds-border)] py-3 text-body font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg)]"
            >
              <RotateCcw className="h-4 w-4" /> Заново
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#1f75fe] py-3 text-body font-bold text-white hover:bg-[var(--primary-hover)]"
            >
              <Check className="h-4 w-4" /> Применить к карте
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
