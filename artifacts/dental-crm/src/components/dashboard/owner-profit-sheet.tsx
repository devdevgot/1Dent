import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { X, CalendarDays, Wallet } from "lucide-react";
import { format } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PeriodPills } from "@/components/layout/period-pills";
import { RevenueEmptyState } from "@/components/dashboard/revenue-empty-state";
import { fetchBranchScopedJson } from "@/lib/branch-scoped-fetch";
import { cn } from "@/lib/utils";
import {
  ChannelIcon,
  DonutChart,
  LIST_PERIOD_PRESETS,
  PAYMENT_COLORS,
  PAYMENT_ICONS,
  PAYMENT_METHOD_LABELS,
  fmtDateRange,
  fmtRevenue,
  getPresetRange,
  type FilterPreset,
  type PaymentStat,
} from "@/components/dashboard/owner-dashboard-shared";

type OwnerProfitSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string | null;
  branchName: string;
  filterPreset: FilterPreset;
};

const CONDITION_LABELS: Record<string, string> = {
  cavity: "Кариес",
  root_canal: "Пульпит / Каналы",
  crown: "Коронки",
  implant: "Имплантация",
  extraction_needed: "Удаление",
  treated: "Повторное лечение",
  missing: "Протезирование",
};

const CONDITION_COLORS: Record<string, string> = {
  cavity: "#F5A623",
  root_canal: "#D0021B",
  crown: "#F8E71C",
  implant: "#2F9E99",
  extraction_needed: "#8B0000",
  treated: "#4A90E2",
  missing: "#9B59B6",
};

const CONDITION_ORDER = [
  "cavity", "root_canal", "extraction_needed", "crown", "implant", "treated", "missing",
];

export function OwnerProfitSheet({
  open,
  onOpenChange,
  branchId,
  branchName,
  filterPreset,
}: OwnerProfitSheetProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"channels" | "conditions">("channels");
  const [conditionStats, setConditionStats] = useState<
    Array<{ condition: string; label: string; count: number; percent: number; color: string }>
  >([]);

  const dateRange = useMemo(() => {
    const range = getPresetRange(filterPreset);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    return { from: range.from, to };
  }, [filterPreset]);

  const filterLabel = LIST_PERIOD_PRESETS.find((p) => p.key === filterPreset)?.label ?? "Сегодня";
  const dateRangeLabel = fmtDateRange(dateRange.from, dateRange.to);
  const dateFromStr = format(dateRange.from, "yyyy-MM-dd");
  const dateToStr = format(dateRange.to, "yyyy-MM-dd");

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["owner-summary", branchId, dateFromStr, dateToStr],
    queryFn: () => {
      const qs = new URLSearchParams({ dateFrom: dateFromStr, dateTo: dateToStr });
      return fetchBranchScopedJson<{ data?: { analytics?: Record<string, unknown> } }>(
        `/api/analytics/owner/summary?${qs}`,
        branchId,
      );
    },
    enabled: open,
    staleTime: 60_000,
  });

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const completedProcedures = Number(rawAnalytics.completedProceduresThisMonth ?? 0);
  const totalPatients = Number(rawAnalytics.totalPatients ?? 0);
  const isLikelyEmpty =
    !analyticsLoading &&
    Boolean(analyticsData) &&
    totalPatients === 0 &&
    completedProcedures === 0;

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["financial-summary", branchId, dateFromStr, dateToStr],
    queryFn: () => {
      const qs = new URLSearchParams({ dateFrom: dateFromStr, dateTo: dateToStr });
      return fetchBranchScopedJson<{ data?: { netProfit?: number } }>(
        `/api/analytics/financial-summary?${qs}`,
        branchId,
      );
    },
    enabled: open && !isLikelyEmpty && completedProcedures > 0,
    staleTime: 60_000,
  });

  const loadDetailAnalytics = open && detailsOpen && activeTab === "channels" && !isLikelyEmpty;

  const { data: proceduresData } = useQuery({
    queryKey: ["procedures-list", branchId],
    queryFn: () =>
      fetchBranchScopedJson<{ data?: { procedures?: Array<Record<string, unknown>> } }>(
        "/api/procedures",
        branchId,
      ),
    enabled: loadDetailAnalytics,
    staleTime: 60_000,
  });

  const { data: patientsData } = useQuery({
    queryKey: ["patients-list", branchId],
    queryFn: () =>
      fetchBranchScopedJson<{ data?: { patients?: Array<{ id: string; source?: string }> } }>(
        "/api/patients",
        branchId,
      ),
    enabled: loadDetailAnalytics,
    staleTime: 60_000,
  });

  const { data: channelsRes } = useQuery({
    queryKey: ["channels-list", branchId],
    queryFn: () =>
      fetchBranchScopedJson<{ data?: { channels?: Array<{ id: string; name: string; type: string; refCode: string }> } }>(
        "/api/channels",
        branchId,
      ),
    enabled: loadDetailAnalytics,
    staleTime: 60_000,
  });

  const revenueCardLoading =
    analyticsLoading || (!isLikelyEmpty && completedProcedures > 0 && summaryLoading);

  const realIncome =
    summaryData?.data?.netProfit ?? Number(rawAnalytics.revenueThisMonth ?? 0);

  const paymentStats = useMemo(() => {
    const stats = (rawAnalytics.revenueByPaymentMethod ?? []) as PaymentStat[];
    if (stats.length > 0) {
      return stats
        .map((stat) => ({
          method: stat.method,
          label: stat.label || PAYMENT_METHOD_LABELS[stat.method] || stat.method,
          amount: Number(stat.amount) || 0,
          percent: Number(stat.percent) || 0,
          color: stat.color || PAYMENT_COLORS[stat.method] || "#B2BEC3",
        }))
        .filter((stat) => stat.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    }
    return [];
  }, [rawAnalytics.revenueByPaymentMethod]);

  const hasNoRevenueInPeriod =
    !revenueCardLoading &&
    (isLikelyEmpty || (paymentStats.length === 0 && realIncome === 0));

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const allPatients = patientsData?.data?.patients ?? [];
  const channels = channelsRes?.data?.channels ?? [];

  const patientSourceMap = useMemo(
    () => new Map(allPatients.map((p) => [p.id, p.source])),
    [allPatients],
  );

  const channelStats = useMemo(() => {
    const channelAmounts: Record<string, number> = {};
    let total = 0;

    allProcedures.forEach((p) => {
      if (!p.completedAt || p.status !== "completed") return;
      const d = new Date(String(p.completedAt));
      const toWithTime = new Date(dateRange.to);
      toWithTime.setHours(23, 59, 59, 999);
      if (d >= dateRange.from && d <= toWithTime) {
        const patientSource = patientSourceMap.get(String(p.patientId)) || "other";
        const amount = Number(p.price ?? 0);
        total += amount;
        const matchedChannel = channels.find(
          (ch) => ch.refCode === patientSource || patientSource === `ref:${ch.refCode}`,
        );
        if (matchedChannel) {
          channelAmounts[matchedChannel.id] = (channelAmounts[matchedChannel.id] ?? 0) + amount;
        } else {
          channelAmounts[patientSource] = (channelAmounts[patientSource] ?? 0) + amount;
        }
      }
    });

    const list: Array<{ name: string; type: string; amount: number; percent: number }> = [];
    channels.forEach((ch) => {
      const amount = channelAmounts[ch.id] ?? 0;
      if (amount > 0) {
        list.push({
          name: ch.name,
          type: ch.type,
          amount,
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
        });
      }
    });

    const defaultSources = ["instagram", "2gis", "whatsapp", "website", "referral", "walk_in", "other"];
    defaultSources.forEach((src) => {
      const amount = channelAmounts[src] ?? 0;
      if (amount > 0) {
        const translatedName =
          src === "instagram" ? "Instagram" :
          src === "2gis" ? "2GIS" :
          src === "whatsapp" ? "WhatsApp" :
          src === "website" ? "Сайт" :
          src === "referral" ? "Рекомендация" :
          src === "walk_in" ? "Визит в клинику" : "Другое";
        list.push({
          name: translatedName,
          type: src,
          amount,
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
        });
      }
    });

    return list.sort((a, b) => b.amount - a.amount);
  }, [allProcedures, patientSourceMap, channels, dateRange]);

  useEffect(() => {
    if (!open) return;
    if (!detailsOpen || activeTab !== "conditions") return;
    void fetchBranchScopedJson<{ data?: { stats?: Record<string, number> } }>(
      "/api/patients/condition-stats",
      branchId,
    )
      .then((json) => {
        const stats = json.data?.stats;
        if (!stats) return;
        const total = Object.values(stats).reduce((s, v) => s + v, 0);
        const list = CONDITION_ORDER.filter((c) => (stats[c] ?? 0) > 0).map((c) => ({
          condition: c,
          label: CONDITION_LABELS[c] ?? c,
          count: stats[c] ?? 0,
          percent: total > 0 ? Math.round(((stats[c] ?? 0) / total) * 100) : 0,
          color: CONDITION_COLORS[c] ?? "#B2BEC3",
        }));
        setConditionStats(list);
      })
      .catch(() => setConditionStats([]));
  }, [activeTab, detailsOpen, open, branchId]);

  useEffect(() => {
    if (!open) {
      setDetailsOpen(false);
    }
  }, [open]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="dash-sheet rounded-t-3xl p-0 pb-6 gap-0 max-h-[92dvh] overflow-y-auto"
        >
          <div className="sticky top-0 z-10 bg-white border-b border-[#f1ede4] px-5 pt-5 pb-3 rounded-t-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#0f172a] truncate">{branchName}</h2>
                <p className="text-xs font-medium text-[#64748b] mt-0.5">Прибыль и аналитика</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-9 h-9 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-[#0f172a] min-w-0">
              <CalendarDays className="w-4 h-4 text-[#1f75fe] shrink-0" />
              <span className="capitalize truncate">{filterLabel}</span>
              <span className="text-[#94a3b8] font-medium">·</span>
              <span className="capitalize truncate text-[#64748b] font-medium">{dateRangeLabel}</span>
            </div>
          </div>

          <div className={cn("mx-4 mt-4 dash-card", !hasNoRevenueInPeriod && "overflow-hidden")}>
            <div className="pt-4 pb-2 flex justify-center">
              {revenueCardLoading ? (
                <div className="w-[260px] h-[260px] flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : hasNoRevenueInPeriod ? (
                <RevenueEmptyState />
              ) : (
                <DonutChart
                  data={paymentStats}
                  realIncome={realIncome}
                  onDetailsClick={() => setDetailsOpen(true)}
                />
              )}
            </div>

            {!revenueCardLoading && !hasNoRevenueInPeriod && paymentStats.length > 0 && (
              <div className="px-5 pb-5 space-y-0 divide-y divide-[#f1ede4]">
                {paymentStats.map((stat, idx) => {
                  const Icon = PAYMENT_ICONS[stat.method] ?? Wallet;
                  return (
                    <motion.div
                      key={stat.method}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-3 py-3"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: stat.color + "22" }}
                      >
                        <Icon className="w-5 h-5" style={{ color: stat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0f172a]">{stat.label}</p>
                        <p className="text-xs text-[#94a3b8]">{stat.percent}%</p>
                      </div>
                      <span className="text-sm font-bold text-[#0f172a] shrink-0">
                        {fmtRevenue(stat.amount)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Details analytics */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="dash-sheet rounded-t-3xl p-0 pb-8 gap-0 max-h-[85dvh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <h2 className="text-base font-bold text-[#0f172a]">Детальная аналитика</h2>
              <p className="text-xs font-medium text-[#94a3b8] mt-0.5">
                {activeTab === "channels" ? `Период: ${dateRangeLabel}` : "За всё время"}
              </p>
            </div>
            <button type="button" onClick={() => setDetailsOpen(false)} className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <PeriodPills
            value={activeTab}
            options={[
              { value: "channels", label: "Каналы привлечения" },
              { value: "conditions", label: "Виды лечения" },
            ]}
            onChange={(v) => setActiveTab(v as "channels" | "conditions")}
            className="mx-5 mt-2 mb-4"
            size="md"
          />

          <div className="px-5 max-h-[50dvh] overflow-y-auto">
            {activeTab === "channels" ? (
              channelStats.length > 0 ? (
                channelStats.map((stat) => (
                  <div key={stat.name} className="flex items-center gap-3 py-2.5 border-b border-[#f1ede4] last:border-0">
                    <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] flex items-center justify-center shrink-0">
                      <ChannelIcon type={stat.type} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <p className="text-xs font-semibold text-[#0f172a] truncate pr-2">{stat.name}</p>
                        <span className="text-xs font-bold text-[#0f172a] shrink-0">{fmtRevenue(stat.amount)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#f1ede4] rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-[var(--ds-primary)]" style={{ width: `${stat.percent}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[#94a3b8] shrink-0 w-7 text-right">{stat.percent}%</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-xs text-[#94a3b8]">Нет данных по источникам пациентов за этот период</p>
              )
            ) : conditionStats.length > 0 ? (
              conditionStats.map((stat) => (
                <div key={stat.condition} className="flex items-center gap-3 py-2.5 border-b border-[#f1ede4] last:border-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: stat.color + "22" }}>
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: stat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-xs font-semibold text-[#0f172a] truncate pr-2">{stat.label}</p>
                      <span className="text-xs font-bold text-[#0f172a] shrink-0">{stat.count} пац.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#f1ede4] rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full" style={{ width: `${stat.percent}%`, backgroundColor: stat.color }} />
                      </div>
                      <span className="text-xs font-bold text-[#94a3b8] shrink-0 w-7 text-right">{stat.percent}%</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-[#94a3b8]">Нет данных по видам лечения</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
