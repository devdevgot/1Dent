// ─────────────────────────────────────────────────────────────────────────────
// TabletPlanBoard — полноценный «Шаг 2. Планы лечения» из CRM-карточки
// пациента, перенесённый на планшет. Реюзает TreatmentStagesBoard, который
// включает DnD-этапы, скидки, таймеры, Sheet этапа и PlanItemDetailModal
// (документы перед лечением / ИИ-анализ / снимки).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import {
  ClipboardList, ChevronRight, Plus, Loader2, RotateCcw,
  CheckCircle2, Circle,
} from "lucide-react";
import {
  useListTeeth,
  useGetActiveTreatmentPlan,
  useListTreatmentPlans,
  useCreateTreatmentPlan,
  getGetActiveTreatmentPlanQueryKey,
  getListTreatmentPlansQueryKey,
} from "@workspace/api-client-react";
import type { ToothRecord, TreatmentPlan, TreatmentPlanItem, TreatmentPlanResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TreatmentStagesBoard } from "@/components/dental-chart/treatment-stages-board";

const PLAN_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:       { label: "Черновик",   cls: "bg-slate-50 text-slate-500 border-slate-200" },
  approved:    { label: "Согласован", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "В работе",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:   { label: "Завершён",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled:   { label: "Отменён",    cls: "bg-red-50 text-red-500 border-red-200" },
};

function RingChart({ pct, size = 68 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f75fe" strokeWidth="8"
          strokeDasharray={String(circ)} strokeDashoffset={String(offset)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1f75fe">
        {pct}%
      </text>
    </svg>
  );
}

export function TabletPlanBoard({
  patientId,
  onGoToChart,
}: {
  patientId: string;
  onGoToChart: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [planDetailId, setPlanDetailId] = useState<string | null>(null);

  const { data: teethData, isLoading: teethLoading } = useListTeeth(patientId);
  const teethRecords = teethData?.data?.teeth ?? [];
  const hasDiagnosis = teethRecords.length > 0;

  const { data: planData, isLoading: planLoading, isError: planError } =
    useGetActiveTreatmentPlan(patientId, {
      query: {
        queryKey: getGetActiveTreatmentPlanQueryKey(patientId),
        retry: 1,
      },
    });
  const activePlan: TreatmentPlan | null = planData?.data?.plan ?? null;

  const { data: plansData, isLoading: plansLoading, isError: plansError } =
    useListTreatmentPlans(patientId, {
      query: {
        queryKey: getListTreatmentPlansQueryKey(patientId),
        retry: 1,
      },
    });
  const allPlans: TreatmentPlan[] = plansData?.data?.plans ?? [];
  const pastPlans = allPlans.filter(
    (p: TreatmentPlan) => p.status === "completed" || p.status === "cancelled",
  );

  const loading = teethLoading || (planLoading && !planError) || (plansLoading && !plansError);

  // Auto-open active plan detail (same UX as CRM slide-over)
  useEffect(() => {
    if (activePlan && planDetailId === null && !planLoading && !plansLoading) {
      setPlanDetailId(activePlan.id);
    }
  }, [activePlan?.id, planDetailId, planLoading, plansLoading]);

  // Clear stale detail id when it doesn't belong to the current patient's plans
  useEffect(() => {
    if (!planDetailId || planLoading || plansLoading) return;
    const belongs =
      activePlan?.id === planDetailId ||
      allPlans.some((p: TreatmentPlan) => p.id === planDetailId);
    if (!belongs) setPlanDetailId(null);
  }, [planDetailId, activePlan?.id, allPlans, planLoading, plansLoading]);

  // Same rule as CRM: a repeat plan requires re-diagnosis after the last plan
  const needsRediagnosis = (() => {
    if (!hasDiagnosis || allPlans.length === 0) return false;
    const latestPlanTs = Math.max(...allPlans.map((p: TreatmentPlan) => new Date(p.createdAt).getTime()));
    const latestToothTs = Math.max(...teethRecords.map((t: ToothRecord) => new Date(t.updatedAt).getTime()));
    return latestToothTs <= latestPlanTs;
  })();

  const createPlanMutation = useCreateTreatmentPlan({
    mutation: {
      onSuccess: (res: TreatmentPlanResponse) => {
        const newPlanId = res?.data?.plan?.id;
        void queryClient.invalidateQueries({ queryKey: getGetActiveTreatmentPlanQueryKey(patientId) });
        void queryClient.invalidateQueries({ queryKey: getListTreatmentPlansQueryKey(patientId) });
        if (newPlanId) setPlanDetailId(newPlanId);
        toast({ title: "План лечения создан" });
      },
      onError: (err: unknown) => {
        const apiMsg =
          (err as { data?: { error?: string; message?: string }; message?: string })?.data?.error ??
          (err as { data?: { message?: string } })?.data?.message ??
          (err as { message?: string })?.message;
        const description =
          typeof apiMsg === "string"
            ? apiMsg.replace(/^HTTP \d{3} [^:]+:\s*/, "")
            : undefined;
        toast({ title: "Не удалось создать план лечения", description, variant: "destructive" });
      },
    },
  });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
      </div>
    );
  }

  // ── No diagnosis yet ───────────────────────────────────────────────────────
  if (!hasDiagnosis) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faf8f4]">
          <ClipboardList className="h-7 w-7 text-[#94a3b8]" />
        </div>
        <div>
          <p className="font-semibold text-[#0f172a]">Зубная карта не заполнена</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-[#64748b]">
            Сначала проведите осмотр зубов пациента на вкладке «Карта зубов»
          </p>
        </div>
        <button
          onClick={onGoToChart}
          className="rounded-xl border border-[#e8e3d9] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf8f4]"
        >
          Перейти к зубной карте
        </button>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (planDetailId === null) {
    const apItems: TreatmentPlanItem[] =
      activePlan?.items.filter((i: TreatmentPlanItem) => i.status !== "cancelled") ?? [];
    const apDone = apItems.filter((i) => i.status === "completed").length;
    const apPct = apItems.length > 0 ? Math.round((apDone / apItems.length) * 100) : 0;
    const apPaid = apItems
      .filter((i) => i.status === "completed")
      .reduce((s, i) => s + i.price * (1 - (i.discount ?? 0) / 100), 0);

    return (
      <div className="space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Активный план</p>

        {activePlan ? (
          <button
            onClick={() => setPlanDetailId(activePlan.id)}
            className="w-full overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="h-1 bg-[#1f75fe]" />
            <div className="px-4 py-4">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                    Активный план
                  </p>
                  <p className="text-[15px] font-bold text-[#0f172a]">
                    План #{String(activePlan.planNumber).padStart(4, "0")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                    Создан {new Date(activePlan.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${(PLAN_STATUS_BADGE[activePlan.status] ?? PLAN_STATUS_BADGE.draft)!.cls}`}>
                  {(PLAN_STATUS_BADGE[activePlan.status] ?? PLAN_STATUS_BADGE.draft)!.label}
                </span>
              </div>

              <div className="mb-4 flex items-center gap-4">
                <RingChart pct={apPct} />
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[11px] text-[#94a3b8]">Итого по плану</p>
                  <p className="text-[22px] font-bold leading-none text-[#0f172a]">
                    {activePlan.totalCost.toLocaleString("ru-KZ")} ₸
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                        <span className="text-[11px] text-[#64748b]">Выполнено</span>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600">
                        {apPaid.toLocaleString("ru-KZ")} ₸
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#1f75fe]/30" />
                        <span className="text-[11px] text-[#64748b]">Остаток</span>
                      </div>
                      <span className="text-[11px] font-semibold text-[#64748b]">
                        {(activePlan.totalCost - apPaid).toLocaleString("ru-KZ")} ₸
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-[#e8e3d9] pt-3">
                <div className="flex items-center gap-1 text-[12px] font-semibold text-[#1f75fe]">
                  Открыть план <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </button>
        ) : needsRediagnosis ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <RotateCcw className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Нужна повторная диагностика</p>
              <p className="mt-0.5 text-xs text-amber-600">
                Для создания плана {allPlans.length + 1} проведите повторный осмотр
              </p>
              <button
                onClick={onGoToChart}
                className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2"
              >
                Перейти к зубной карте →
              </button>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#e8e3d9] py-4 text-sm font-medium text-[#94a3b8] transition-colors hover:bg-[#faf8f4]"
            onClick={() => createPlanMutation.mutate({ id: patientId, data: {} })}
            disabled={createPlanMutation.isPending}
          >
            {createPlanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {pastPlans.length > 0 ? `Создать план ${allPlans.length + 1}` : "Составить план из диагностики"}
          </button>
        )}

        {activePlan && (activePlan.status === "completed" || activePlan.status === "in_progress") && !needsRediagnosis && (
          <button
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#e8e3d9] py-3 text-sm font-medium text-[#94a3b8] transition-colors hover:bg-[#faf8f4]"
            onClick={() => createPlanMutation.mutate({ id: patientId, data: {} })}
            disabled={createPlanMutation.isPending}
          >
            {createPlanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Создать план {allPlans.length + 1}
          </button>
        )}

        {/* Архив планов */}
        {pastPlans.length > 0 && (
          <>
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Прошлые планы
            </p>
            <div className="space-y-2">
              {pastPlans.map((p) => {
                const badge = PLAN_STATUS_BADGE[p.status] ?? PLAN_STATUS_BADGE.cancelled!;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlanDetailId(p.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#e8e3d9] bg-white px-4 py-3 text-left transition-colors hover:bg-[#faf8f4]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0f172a]">
                        План #{String(p.planNumber).padStart(4, "0")}
                      </p>
                      <p className="text-[11px] text-[#94a3b8]">
                        {new Date(p.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "short", year: "numeric" })}
                        {" · "}
                        {p.totalCost.toLocaleString("ru-KZ")} ₸
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  const isActive = planDetailId === activePlan?.id;
  const detailPlan = isActive
    ? activePlan
    : allPlans.find((p: TreatmentPlan) => p.id === planDetailId) ?? null;

  if (!detailPlan) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-[#64748b]">План не найден или ещё загружается</p>
        <button
          onClick={() => setPlanDetailId(null)}
          className="rounded-xl border border-[#e8e3d9] bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-[#faf8f4]"
        >
          К списку планов
        </button>
      </div>
    );
  }

  const nc: TreatmentPlanItem[] = detailPlan.items.filter(
    (i: TreatmentPlanItem) => i.status !== "cancelled",
  );
  const done = nc.filter((i) => i.status === "completed").length;
  const pct = nc.length > 0 ? Math.round((done / nc.length) * 100) : 0;
  const paid = nc
    .filter((i) => i.status === "completed")
    .reduce((s, i) => s + i.price * (1 - (i.discount ?? 0) / 100), 0);

  return (
    <div className="space-y-3 p-4">
      {/* Навигация к списку планов (виден когда есть архив или неактивный план) */}
      {(pastPlans.length > 0 || !isActive) && (
        <button
          onClick={() => setPlanDetailId(null)}
          className="text-xs font-semibold text-[#1f75fe] underline-offset-2 hover:underline"
        >
          ← К списку планов
        </button>
      )}

      {/* Financial summary */}
      <div className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white shadow-sm">
        <div className="h-0.5 bg-[#1f75fe]" />
        <div className="px-4 py-4">
          <div className="mb-4 flex items-center gap-4">
            <RingChart pct={pct} />
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-[11px] text-[#94a3b8]">Сумма плана</p>
              <p className="text-[22px] font-bold leading-none text-[#0f172a]">
                {detailPlan.totalCost.toLocaleString("ru-KZ")} ₸
              </p>
              <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                Оплачено {done} из {nc.length} услуг
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-[12px] text-[#64748b]">Выполнено</span>
              </div>
              <span className="text-[13px] font-bold text-emerald-600">
                {paid.toLocaleString("ru-KZ")} ₸
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#1f75fe]/30" />
                <span className="text-[12px] text-[#64748b]">Остаток к оплате</span>
              </div>
              <span className="text-[13px] font-bold text-[#0f172a]">
                {(detailPlan.totalCost - paid).toLocaleString("ru-KZ")} ₸
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Следующий план / повторная диагностика */}
      {isActive && activePlan && (activePlan.status === "completed" || activePlan.status === "in_progress") && (
        needsRediagnosis ? (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50"
            onClick={onGoToChart}
          >
            <RotateCcw className="h-4 w-4" />
            Повторная диагностика
          </button>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1f75fe]/30 py-3 text-sm font-semibold text-[#1f75fe] transition-colors hover:bg-[#1f75fe]/5"
            onClick={() => createPlanMutation.mutate({ id: patientId, data: {} })}
            disabled={createPlanMutation.isPending}
          >
            {createPlanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Следующий план
          </button>
        )
      )}

      {/* Полная CRM-доска этапов: DnD, скидки, таймеры, модал позиции
          (документы / ИИ-анализ / снимки) */}
      {isActive && (
        <TreatmentStagesBoard patientId={patientId} teeth={teethRecords} activePlan={activePlan} />
      )}

      {/* Архивный план — read-only список позиций */}
      {!isActive && (
        <div className="space-y-2">
          {nc.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#94a3b8]">Нет позиций</p>
          ) : (
            nc.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm ${
                  item.status === "completed"
                    ? "border-emerald-100 bg-emerald-50/60"
                    : "border-[#e8e3d9] bg-white"
                }`}
              >
                {item.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-[#e8e3d9]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-medium leading-snug ${item.status === "completed" ? "text-[#94a3b8] line-through" : "text-[#0f172a]"}`}>
                    {item.title}
                  </p>
                  {item.toothFdi != null && (
                    <p className="mt-0.5 text-[11px] text-[#94a3b8]">Зуб №{item.toothFdi}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end text-right">
                  {(item.discount ?? 0) > 0 ? (
                    <>
                      <span className="text-[10px] leading-none text-[#94a3b8] line-through">
                        {item.price.toLocaleString("ru-KZ")} ₸
                      </span>
                      <span className={`mt-0.5 text-[13px] font-bold leading-tight ${item.status === "completed" ? "text-emerald-600" : "text-[#0f172a]"}`}>
                        {(item.price * (1 - (item.discount ?? 0) / 100)).toLocaleString("ru-KZ")} ₸
                      </span>
                    </>
                  ) : (
                    <span className={`text-[13px] font-semibold ${item.status === "completed" ? "text-emerald-600" : "text-[#64748b]"}`}>
                      {item.price.toLocaleString("ru-KZ")} ₸
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
