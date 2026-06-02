import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  useListProcedures,
  useListPatients,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import {
  UserCog, Users, Bell, X, ChevronLeft,
  Stethoscope, Send, Banknote, QrCode, CreditCard,
  Clock, Wallet, CalendarDays, SlidersHorizontal, UserPlus, Layers,
  TrendingUp,
} from "lucide-react";
import { TasksBlock } from "@/components/dashboard/tasks-block";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  kaspi_transfer: Send,
  cash:           Banknote,
  kaspi_qr:       QrCode,
  terminal:       CreditCard,
  kaspi_red:      Wallet,
  debt:           Clock,
};

const DOCTOR_BG = [
  "#4B7BEC", "#26de81", "#fd9644", "#a29bfe", "#fc5c65", "#45aaf2",
];

function fmtRevenue(n: number) {
  return n.toLocaleString("ru-KZ") + " ₸";
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function todayLabel() {
  return new Date().toLocaleDateString("ru", {
    day: "numeric", month: "long", weekday: "short",
  });
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
type PaymentStat = { method: string; label: string; amount: number; percent: number; color: string };

function DonutChart({ data, activePeriod }: { data: PaymentStat[]; activePeriod: string }) {
  const SIZE = 260, cx = 130, cy = 130, r = 115, SW = 13;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.amount, 0);
  const GAP = 14;
  const totalPct = data.reduce((s, d) => s + d.percent, 0);

  let cumLen = 0;
  const segs = data.map(d => {
    const segLen = (d.percent / (totalPct || 1)) * circ;
    const dash = Math.max(0, segLen - GAP);
    const offset = circ * 0.25 - cumLen;
    cumLen += segLen;
    return { ...d, dash, offset };
  });

  const isEmpty = data.length === 0 || total === 0;

  return (
    <div style={{ width: SIZE, height: SIZE, position: "relative" }}>
      <svg width={SIZE} height={SIZE}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EBEBEB" strokeWidth={SW} />
        {!isEmpty && segs.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={`${s.dash} ${circ}`}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {isEmpty ? (
          <span style={{ fontSize: 12, color: "#8e8e93" }}>Нет данных</span>
        ) : (
          <>
            <span style={{ fontWeight: 700, fontSize: 25, lineHeight: "32px", color: "#1c1c1e" }}>
              {total.toLocaleString("ru-KZ")} ₸
            </span>
            <span style={{ fontSize: 12, lineHeight: "16px", color: "#8e8e93", marginTop: 2 }}>
              {activePeriod}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DATE FILTER ────────────────────────────────────────────────────────────
type FilterPreset = "today" | "week" | "month" | "6months" | "year" | "custom";

const FILTER_PRESETS: { key: FilterPreset; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "За неделю" },
  { key: "month",   label: "Текущий месяц" },
  { key: "6months", label: "За полгода" },
  { key: "year",    label: "За год" },
  { key: "custom",  label: "Выбрать период" },
];

function getPresetRange(preset: FilterPreset): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":   return { from: today, to: today };
    case "week":    return { from: new Date(today.getTime() - 6 * 86400000), to: today };
    case "month":   return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "6months": return { from: new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), to: today };
    case "year":    return { from: new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), to: today };
    default:        return { from: today, to: today };
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

function fmtDateRange(from: Date, to: Date): string {
  if (from.toDateString() === to.toDateString()) {
    return from.toLocaleDateString("ru", { day: "numeric", month: "long", weekday: "short" });
  }
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// ─────────────────────────────────────────────────────────────────────────────


export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();
  // ── Date filter state ──
  const [filterOpen, setFilterOpen]     = useState(false);
  const [showCustom, setShowCustom]     = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("month");
  const [pendingPreset, setPendingPreset] = useState<FilterPreset>("month");
  const today = new Date();
  const [customFrom, setCustomFrom] = useState(toInputValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customTo,   setCustomTo]   = useState(toInputValue(today));

  const dateRange = useMemo(() => {
    if (filterPreset === "custom") {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    return getPresetRange(filterPreset);
  }, [filterPreset, customFrom, customTo]);

  const filterLabel = FILTER_PRESETS.find(p => p.key === filterPreset)?.label ?? "Месяц";
  const dateRangeLabel = fmtDateRange(dateRange.from, dateRange.to);

  const { data: analyticsData, isLoading } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();
  const { data: patientsData } = useListPatients();

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const allPatients   = patientsData?.data?.patients ?? [];

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const rawKpis = kpiData?.data?.kpis ?? [];

  const analytics = {
    revenueThisMonth:               Number(rawAnalytics.revenueThisMonth ?? 0),
    newPatientsThisMonth:           Number(rawAnalytics.newPatientsThisMonth ?? 0),
    completedProceduresThisMonth:   Number(rawAnalytics.completedProceduresThisMonth ?? 0),
    totalPatients:                  Number(rawAnalytics.totalPatients ?? 0),
    redAlertCount:                  Number(rawAnalytics.redAlertCount ?? 0),
    revenueByPaymentMethod:         (rawAnalytics.revenueByPaymentMethod ?? []) as PaymentStat[],
  };

  const kpis = rawKpis;

  const revenueThisMonth       = analytics.revenueThisMonth;
  const newPatientsThisMonth   = analytics.newPatientsThisMonth;
  const completedProcedures    = analytics.completedProceduresThisMonth;
  const totalPatients          = analytics.totalPatients;
  const redAlertCount          = analytics.redAlertCount;

  const revenueByPayment = analytics.revenueByPaymentMethod;


  return (
    <div className="min-h-full bg-[#f7f8fc] pb-8">

      {/* ─── White top strip: doctor leaderboard + date row ─── */}
      <div className="bg-white border-b border-gray-100">
        {/* Doctor leaderboard */}
        {kpis.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Рейтинг врачей</p>
            <div className="flex flex-col gap-1.5">
              {[...kpis].sort((a, b) => b.score - a.score).map((kpi, i) => {
                const initials = kpi.doctorName
                  .split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                const bg = DOCTOR_BG[i % DOCTOR_BG.length];
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                const slotsLeft = (kpi.maxSlotsPerDay ?? 20) - (kpi.slotsUsedToday ?? 0);
                const slotsFull = slotsLeft <= 0;
                return (
                  <motion.button
                    key={kpi.doctorId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate(`/staff/${kpi.doctorId}`)}
                    className="flex items-center gap-2.5 w-full text-left rounded-xl px-2 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-base w-7 text-center shrink-0">{medal}</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                      style={{ backgroundColor: bg }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] font-semibold text-gray-700 truncate pr-2">{kpi.doctorName.split(" ")[0]}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${slotsFull ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                          {kpi.slotsUsedToday ?? 0}/{kpi.maxSlotsPerDay ?? 20}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${kpi.score ?? 0}%`, backgroundColor: "#1f75fe" }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-gray-500 shrink-0 w-8 text-right">{kpi.score ?? 0}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date row */}
        <div className="mx-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="capitalize">{dateRangeLabel}</span>
          </div>
          <button
            onClick={() => { setPendingPreset(filterPreset); setShowCustom(false); setFilterOpen(true); }}
            className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
            {filterLabel}
          </button>
        </div>
      </div>{/* end white top strip */}


      {/* ─── Revenue Donut Card ─── */}
      <div className="mx-4 mt-3 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Ring chart */}
        <div className="pt-4 pb-2 flex justify-center">
          {isLoading ? (
            <div className="w-[260px] h-[260px] flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <DonutChart data={revenueByPayment} activePeriod={filterLabel} />
          )}
        </div>

        {/* ─── Payment method list ─── */}
        {!isLoading && revenueByPayment.length > 0 && (
          <div className="px-5 pb-5 space-y-0 divide-y divide-gray-50">
            {revenueByPayment.map((stat, idx) => {
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
                    <p className="text-sm font-semibold text-gray-800">{stat.label}</p>
                    <p className="text-xs text-gray-400">{stat.percent}%</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">
                    {fmtRevenue(stat.amount)}
                  </span>
                </motion.div>
              );
            })}

            {revenueByPayment.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">Нет данных за этот период</p>
            )}
          </div>
        )}

        {!isLoading && revenueByPayment.length === 0 && revenueThisMonth === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Нет выручки в этом месяце</p>
        )}
      </div>

      <TasksBlock procedures={allProcedures} patients={allPatients} />

      {/* ─── Quick Actions ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t("dashboard.quickActions")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t("ownerDashboard.manageStaff"), icon: UserCog,    path: "/users",      color: "bg-slate-50 text-slate-600" },
            { label: t("nav.patients"),               icon: Users,       path: "/patients",   color: "bg-blue-50 text-blue-600" },
            { label: t("nav.procedures"),             icon: Stethoscope, path: "/procedures", color: "bg-violet-50 text-violet-600" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-2.5 p-3 rounded-2xl border border-gray-100 hover:border-primary/20 hover:bg-primary/5 transition-all text-left group"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.color} group-hover:bg-primary group-hover:text-white transition-colors`}>
                <item.icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-gray-700">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Date Filter Sheet ─── */}
      <Sheet open={filterOpen} onOpenChange={(v) => { setFilterOpen(v); if (!v) setShowCustom(false); }}>
        <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-8 max-h-[85dvh] overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {!showCustom ? (
              <motion.div
                key="presets"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h2 className="text-base font-bold text-gray-900">Фильтр по дате</h2>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Preset list */}
                <div className="mt-2">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => {
                        if (p.key === "custom") {
                          setPendingPreset("custom");
                          setShowCustom(true);
                        } else {
                          setPendingPreset(p.key);
                        }
                      }}
                      className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-0"
                    >
                      <span className={cn(
                        "text-sm font-medium",
                        pendingPreset === p.key ? "text-gray-900 font-semibold" : "text-gray-600",
                      )}>
                        {p.label}
                      </span>
                      <span className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        pendingPreset === p.key
                          ? "border-primary bg-primary"
                          : "border-gray-300",
                      )}>
                        {pendingPreset === p.key && (
                          <span className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-5 mt-4 flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      setFilterPreset(pendingPreset);
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
                    style={{ backgroundColor: "#1f75fe" }}
                  >
                    Применить
                  </button>
                  <button
                    onClick={() => {
                      setPendingPreset("month");
                      setFilterPreset("month");
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-gray-500 bg-gray-100"
                  >
                    Сбросить
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="custom"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18 }}
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-4 pb-4">
                  <button
                    onClick={() => setShowCustom(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-bold text-gray-900 flex-1">Выбрать период</h2>
                  <button
                    onClick={() => { setFilterOpen(false); setShowCustom(false); }}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Date inputs */}
                <div className="px-5 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Начало</p>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo}
                        onChange={e => setCustomFrom(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 rounded-2xl border-2 border-gray-100 text-sm font-semibold text-gray-800 focus:border-primary focus:outline-none bg-gray-50"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Конец</p>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom}
                        max={toInputValue(new Date())}
                        onChange={e => setCustomTo(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 rounded-2xl border-2 border-gray-100 text-sm font-semibold text-gray-800 focus:border-primary focus:outline-none bg-gray-50"
                      />
                    </div>
                  </div>

                  {/* Range preview */}
                  <div className="bg-primary/8 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">
                      {customFrom && customTo
                        ? fmtDateRange(new Date(customFrom), new Date(customTo))
                        : "Выберите даты"}
                    </span>
                  </div>
                </div>

                <div className="px-5 mt-5 flex flex-col gap-2.5">
                  <button
                    disabled={!customFrom || !customTo}
                    onClick={() => {
                      setFilterPreset("custom");
                      setPendingPreset("custom");
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: "#1f75fe" }}
                  >
                    Применить
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>
    </div>
  );
}
