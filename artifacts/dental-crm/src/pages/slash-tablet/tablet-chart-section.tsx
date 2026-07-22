import { useMemo, useState, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, Stethoscope, Check, X, RotateCcw, Loader2,
} from "lucide-react";
import {
  useUpdateTooth,
  useTriggerDentalAiAnalysis,
  useCompleteDiagnosis,
  getListTeethQueryKey,
  getListPatientsQueryKey,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TabletDentalChart } from "./tablet-dental-chart";
import { lazyNamedWithChunkRecovery } from "@/lib/chunk-reload";
import type { VoiceDiagnosisApplyResult } from "@/components/dental-chart/voice-diagnosis-modal";
const VoiceDiagnosisModal = lazyNamedWithChunkRecovery(
  () => import("@/components/dental-chart/voice-diagnosis-modal"),
  "VoiceDiagnosisModal",
);
import {
  CONDITION_META, type TabletPatient, type ToothCondition,
} from "./mock-data";

const ALL_CONDITIONS = Object.keys(CONDITION_META) as ToothCondition[];

type DiagnosisMap = Map<number, ToothCondition>;

export function TabletChartSection({
  patient,
  patientId,
  activePlanId,
  teeth,
  onTeethChange,
  onDiagnosisSaved,
  planFdis,
  selectedFdi,
  onSelectFdi,
}: {
  patient: TabletPatient;
  patientId: string;
  activePlanId?: string;
  teeth: Record<number, ToothCondition>;
  onTeethChange: (teeth: Record<number, ToothCondition>) => void;
  onDiagnosisSaved?: () => void;
  planFdis: Set<number>;
  selectedFdi: number | null;
  onSelectFdi: (fdi: number | null) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateToothMutation = useUpdateTooth();
  const triggerAnalysisMutation = useTriggerDentalAiAnalysis();
  const completeDiagnosisMutation = useCompleteDiagnosis({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        void qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
      },
    },
  });
  const [isDiagnosisMode, setIsDiagnosisMode] = useState(false);
  const [diagnosisMap, setDiagnosisMap] = useState<DiagnosisMap>(new Map());
  const [diagnosisToothFdi, setDiagnosisToothFdi] = useState<number | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const openVoiceModal = useCallback(() => {
    setShowVoiceModal(true);
  }, []);

  const hasDiagnosis = useMemo(
    () => Object.values(teeth).some((c) => c !== "healthy"),
    [teeth],
  );

  const displayTeeth = useMemo(() => {
    const merged = { ...teeth };
    diagnosisMap.forEach((cond, fdi) => { merged[fdi] = cond; });
    return merged;
  }, [teeth, diagnosisMap]);

  const startDiagnosis = useCallback(() => {
    setIsDiagnosisMode(true);
    setDiagnosisMap(new Map());
    setDiagnosisToothFdi(null);
    onSelectFdi(null);
  }, [onSelectFdi]);

  const cancelDiagnosis = useCallback(() => {
    setIsDiagnosisMode(false);
    setDiagnosisMap(new Map());
    setDiagnosisToothFdi(null);
  }, []);

  const finishDiagnosis = useCallback(async () => {
    if (diagnosisMap.size === 0 || saving) return;
    setSaving(true);
    try {
      await Promise.all(
        Array.from(diagnosisMap.entries()).map(([fdi, condition]) =>
          updateToothMutation.mutateAsync({
            id: patientId,
            toothFdi: fdi,
            data: { condition },
          }),
        ),
      );

      await qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
      void triggerAnalysisMutation.mutateAsync(patientId);
      void completeDiagnosisMutation.mutateAsync(patientId);

      const next = { ...teeth };
      diagnosisMap.forEach((cond, fdi) => { next[fdi] = cond; });
      onTeethChange(next);
      setIsDiagnosisMode(false);
      setDiagnosisMap(new Map());
      setDiagnosisToothFdi(null);
      toast({ title: "Диагностика сохранена" });
      onDiagnosisSaved?.();
    } catch {
      toast({
        title: "Не удалось сохранить диагностику",
        description: "Проверьте подключение и попробуйте снова",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [
    diagnosisMap,
    saving,
    patientId,
    teeth,
    onTeethChange,
    onDiagnosisSaved,
    updateToothMutation,
    qc,
    triggerAnalysisMutation,
    completeDiagnosisMutation,
    toast,
  ]);

  const handleVoiceApplied = useCallback((result: VoiceDiagnosisApplyResult) => {
    const next = { ...teeth };
    for (const entry of result.entries) {
      if (result.appliedFdis.includes(entry.fdi)) {
        next[entry.fdi] = entry.condition as ToothCondition;
      }
    }
    onTeethChange(next);
    setShowVoiceModal(false);
    setIsDiagnosisMode(false);
    setDiagnosisMap(new Map());
    setDiagnosisToothFdi(null);
    onDiagnosisSaved?.();
  }, [teeth, onTeethChange, onDiagnosisSaved]);

  const handleChartSelect = useCallback((fdi: number) => {
    if (isDiagnosisMode) {
      setDiagnosisToothFdi((prev) => (prev === fdi ? null : fdi));
      return;
    }
    onSelectFdi(selectedFdi === fdi ? null : fdi);
  }, [isDiagnosisMode, onSelectFdi, selectedFdi]);

  const setToothCondition = useCallback((fdi: number, cond: ToothCondition) => {
    setDiagnosisMap((prev) => {
      const next = new Map(prev);
      next.set(fdi, cond);
      return next;
    });
  }, []);

  const chartSelectedFdi = isDiagnosisMode ? diagnosisToothFdi : selectedFdi;

  return (
    <div className="relative flex flex-col gap-4">
      {/* Кнопки диагностики */}
      {!isDiagnosisMode && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startDiagnosis}
            className="flex items-center gap-2 rounded-2xl bg-[#1f75fe] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#1a65e8] active:scale-[0.99]"
          >
            <Stethoscope className="h-5 w-5" />
            {hasDiagnosis ? "Повторная диагностика" : "Сделать диагностику"}
          </button>
          <button
            type="button"
            onClick={openVoiceModal}
            className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-[#f1ede4] active:scale-[0.99]"
          >
            <Mic className="h-5 w-5" />
            Голосовая диагностика
          </button>
        </div>
      )}

      {isDiagnosisMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Режим диагностики — выберите зуб и укажите состояние
          </p>
        </div>
      )}

      <TabletDentalChart
        teeth={displayTeeth}
        selectedFdi={chartSelectedFdi}
        planFdis={planFdis}
        onSelect={handleChartSelect}
        big
      />

      {/* Выбор состояния зуба */}
      <AnimatePresence>
        {isDiagnosisMode && diagnosisToothFdi !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl border border-[#e8e3d9] bg-white p-4"
          >
            <p className="mb-3 text-sm font-bold text-[#0f172a]">
              Зуб {diagnosisToothFdi} — выберите диагноз
            </p>
            <div className="grid grid-cols-4 gap-2">
              {ALL_CONDITIONS.map((cond) => {
                const meta = CONDITION_META[cond];
                const active = (diagnosisMap.get(diagnosisToothFdi) ?? teeth[diagnosisToothFdi] ?? "healthy") === cond;
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setToothCondition(diagnosisToothFdi, cond)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-all active:scale-[0.98]",
                      active
                        ? "border-[#1f75fe] bg-[#1f75fe]/8 text-[#1f75fe]"
                        : "border-[#e8e3d9] bg-white text-[#0f172a] hover:border-[#1f75fe]/40",
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: meta.bg, borderColor: meta.color }}
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Панель действий диагностики */}
      <AnimatePresence>
        {isDiagnosisMode && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="mt-2 rounded-2xl border border-[#e8e3d9] bg-white px-4 py-4 shadow-sm"
          >
            <div className="flex items-center justify-center gap-10">
              <ActionCircle label="Отмена" onClick={cancelDiagnosis} variant="muted">
                <X className="h-5 w-5" />
              </ActionCircle>
              <ActionCircle label="Голос" onClick={openVoiceModal} variant="voice">
                <Mic className="h-5 w-5" />
              </ActionCircle>
              <ActionCircle
                label="Завершить"
                onClick={() => void finishDiagnosis()}
                variant="primary"
                disabled={diagnosisMap.size === 0 || saving}
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
              </ActionCircle>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showVoiceModal && (
        <Suspense fallback={null}>
          <VoiceDiagnosisModal
            patientId={patientId}
            activePlanId={activePlanId}
            onClose={() => setShowVoiceModal(false)}
            onApplied={handleVoiceApplied}
          />
        </Suspense>
      )}
    </div>
  );
}

function ActionCircle({
  children, label, onClick, variant, disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: "muted" | "voice" | "primary";
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
          variant === "muted" && "bg-[#f1ede4] text-[#64748b] hover:bg-[#e8e3d9] hover:text-[#0f172a]",
          variant === "voice" && "bg-[#e8f2ff] text-[#1f75fe] hover:bg-[#d6e8ff]",
          variant === "primary" && "bg-[#1f75fe] text-white hover:bg-[#1a65e8]",
        )}
      >
        {children}
      </button>
      <span className="text-[11px] text-[#64748b]">{label}</span>
    </div>
  );
}
