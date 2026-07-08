import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList, ChevronDown, CheckCircle2, Circle, Loader2, Plus, Play, Check,
} from "lucide-react";
import {
  useCompleteTreatmentPlanItem,
  getGetActiveTreatmentPlanQueryKey,
  getListTreatmentPlansQueryKey,
  getListTeethQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fmtTenge, type PlanStage } from "./mock-data";
import {
  clearPlanItemTimer,
  formatElapsed,
  readPlanItemTimers,
  startPlanItemTimer,
} from "./tablet-plan-timers";

export function TabletPlanPanel({
  patientId,
  planId,
  plan,
  progress,
  doneCount,
  total,
  planTotal,
  filterFdi,
  planNumber,
  onPlanUpdated,
}: {
  patientId: string;
  planId?: string;
  plan: PlanStage[];
  progress: number;
  doneCount: number;
  total: number;
  planTotal: number;
  filterFdi: number | null;
  planNumber?: number;
  onPlanUpdated?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(plan.map((s) => s.id)));
  const [activeTimers, setActiveTimers] = useState<Map<string, number>>(new Map());
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pendingItemIds = useMemo(
    () => plan.flatMap((s) => s.items.filter((i) => i.status !== "completed").map((i) => i.id)),
    [plan],
  );

  useEffect(() => {
    setActiveTimers(readPlanItemTimers(pendingItemIds));
  }, [planId, pendingItemIds.join(",")]);

  useEffect(() => {
    if (activeTimers.size === 0) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeTimers.size]);

  void tick;

  const completeMutation = useCompleteTreatmentPlanItem({
    mutation: {
      onSuccess: (_data, vars) => {
        clearPlanItemTimer(vars.itemId);
        setActiveTimers((prev) => {
          const next = new Map(prev);
          next.delete(vars.itemId);
          return next;
        });
        setCompletingId(null);
        void qc.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        void qc.invalidateQueries({ queryKey: getListTreatmentPlansQueryKey(patientId) });
        void qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        toast({ title: "Процедура завершена", description: "План и карта зубов обновлены" });
        onPlanUpdated?.();
      },
      onError: () => {
        setCompletingId(null);
        toast({
          title: "Не удалось завершить",
          description: "Попробуйте ещё раз",
          variant: "destructive",
        });
      },
    },
  });

  const handleStart = useCallback((itemId: string) => {
    startPlanItemTimer(itemId);
    setActiveTimers((prev) => new Map(prev).set(itemId, Date.now()));
  }, []);

  const handleComplete = useCallback((itemId: string) => {
    if (!planId || completingId) return;
    setCompletingId(itemId);
    completeMutation.mutate({ id: patientId, planId, itemId });
  }, [planId, patientId, completingId, completeMutation]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const stages = filterFdi
    ? plan.map((s) => ({ ...s, items: s.items.filter((i) => i.tooth === filterFdi) })).filter((s) => s.items.length)
    : plan;

  const displayStatus = useCallback((item: PlanStage["items"][number]) => {
    if (item.status === "completed") return "completed" as const;
    if (activeTimers.has(item.id)) return "in_progress" as const;
    return item.status;
  }, [activeTimers]);

  if (plan.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-[var(--text-subtle)]">
        <ClipboardList className="h-10 w-10 opacity-40" />
        <p className="text-sm">План лечения ещё не создан</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#f1ede4] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--ds-primary)]" />
            <span className="text-body font-bold text-[var(--text)]">План лечения №{planNumber ?? "—"}</span>
          </div>
          <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-caption font-bold text-[var(--success)]">Активен</span>
        </div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-[var(--text-subtle)]">Выполнено {doneCount} из {total}</span>
          <span className="font-bold text-[var(--text-secondary)]">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full rounded-full bg-[#1f75fe] transition-all" style={{ width: `${progress}%` }} />
        </div>
        {filterFdi && (
          <p className="mt-2 text-caption font-medium text-[var(--ds-primary)]">Показаны позиции по зубу {filterFdi}</p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {stages.length === 0 ? (
          <p className="p-6 text-center text-body text-[var(--text-subtle)]">Нет позиций по выбранному зубу</p>
        ) : (
          <div className="space-y-2">
            {stages.map((stage) => {
              const open = expanded.has(stage.id);
              const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
              return (
                <div key={stage.id} className="overflow-hidden rounded-xl border border-[#f1ede4]">
                  <button
                    type="button"
                    onClick={() => toggle(stage.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-[var(--bg)]"
                    style={{ backgroundColor: open ? stage.bg : undefined }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-body font-bold text-[var(--text)]">{stage.label}</span>
                      <span className="text-caption text-[var(--text-subtle)]">({stage.items.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption font-semibold text-[var(--text-secondary)]">{fmtTenge(stageTotal)}</span>
                      <ChevronDown className={cn("h-4 w-4 text-[var(--text-subtle)] transition-transform", open && "rotate-180")} />
                    </div>
                  </button>
                  {open && (
                    <div className="divide-y divide-[#f1ede4]">
                      {stage.items.map((item) => {
                        const status = displayStatus(item);
                        const timerStart = activeTimers.get(item.id);
                        const isCompleting = completingId === item.id;
                        return (
                          <div key={item.id} className="flex items-center gap-3 px-3 py-3">
                            <StatusIcon status={status} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-body font-medium text-[var(--text)]">{item.title}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-[var(--text-subtle)]">
                                {item.tooth && <span>Зуб {item.tooth}</span>}
                                {timerStart && (
                                  <span className="font-mono font-semibold text-[var(--ds-primary)]">
                                    {formatElapsed(timerStart)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="hidden text-body font-semibold text-[var(--text)] sm:inline">
                              {fmtTenge(item.price)}
                            </span>
                            {status !== "completed" && planId && (
                              <div className="flex shrink-0 gap-2">
                                {status === "pending" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStart(item.id)}
                                    className="flex items-center gap-1.5 rounded-xl bg-[#1f75fe] px-3 py-2 text-caption font-bold text-white transition-colors hover:bg-[var(--primary-hover)] active:scale-[0.98]"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    Начать
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleComplete(item.id)}
                                    disabled={isCompleting}
                                    className="flex items-center gap-1.5 rounded-xl bg-[var(--success)] px-3 py-2 text-caption font-bold text-white transition-colors hover:bg-[#15803d] active:scale-[0.98] disabled:opacity-60"
                                  >
                                    {isCompleting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    Завершить
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[#f1ede4] bg-[var(--bg)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-body font-medium text-[var(--text-secondary)]">Итого по плану</span>
          <span className="text-xl font-extrabold text-[var(--text)]">{fmtTenge(planTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: "completed" | "in_progress" | "pending" }) {
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />;
  if (status === "in_progress") return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--ds-primary)]" />;
  return <Circle className="h-5 w-5 shrink-0 text-[#cbd5e1]" />;
}
