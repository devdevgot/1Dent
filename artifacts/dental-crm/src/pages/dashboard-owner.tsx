import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  ChevronRight, UserCog, Users, Bell, X, ChevronLeft,
  Activity, Stethoscope, Send, Banknote, QrCode, CreditCard,
  Clock, Wallet, CalendarDays, SlidersHorizontal, UserPlus, Layers,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

// ─── DEMO MODE ──────────────────────────────────────────────────────────────
// Чтобы убрать фейковые данные — поменяй на false
const USE_MOCK_DATA = true;

const MOCK_ANALYTICS = {
  revenueThisMonth: 4_850_000,
  newPatientsThisMonth: 38,
  completedProceduresThisMonth: 127,
  totalPatients: 1_240,
  redAlertCount: 2,
  revenueByPaymentMethod: [
    { method: "kaspi_transfer", label: "Kaspi перевод", amount: 1_940_000, percent: 40, color: "#4B7BEC" },
    { method: "cash",           label: "Наличка",        amount:   970_000, percent: 20, color: "#26de81" },
    { method: "kaspi_qr",       label: "Kaspi QR",       amount:   727_500, percent: 15, color: "#fd9644" },
    { method: "terminal",       label: "Терминал",        amount:   485_000, percent: 10, color: "#2d3436" },
    { method: "kaspi_red",      label: "Kaspi RED",       amount:   484_500, percent: 10, color: "#fc5c65" },
    { method: "debt",           label: "В долг",          amount:   243_000, percent:  5, color: "#a29bfe" },
  ],
};

const MOCK_KPIS = [
  { doctorId: "d1", doctorName: "Асель Нурланова",   completedProcedures: 42, revenue: 1_820_000, patients: 31 },
  { doctorId: "d2", doctorName: "Берик Сейтов",      completedProcedures: 35, revenue: 1_540_000, patients: 28 },
  { doctorId: "d3", doctorName: "Гульнар Ахметова",  completedProcedures: 28, revenue: 1_020_000, patients: 22 },
  { doctorId: "d4", doctorName: "Данияр Касымов",    completedProcedures: 22, revenue:   470_000, patients: 17 },
];
// ─────────────────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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

  const { data: analyticsData, isLoading: apiLoading } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const isLoading = USE_MOCK_DATA ? false : apiLoading;
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const rawKpis = kpiData?.data?.kpis ?? [];

  const analytics = USE_MOCK_DATA ? MOCK_ANALYTICS : {
    revenueThisMonth:               Number(rawAnalytics.revenueThisMonth ?? 0),
    newPatientsThisMonth:           Number(rawAnalytics.newPatientsThisMonth ?? 0),
    completedProceduresThisMonth:   Number(rawAnalytics.completedProceduresThisMonth ?? 0),
    totalPatients:                  Number(rawAnalytics.totalPatients ?? 0),
    redAlertCount:                  Number(rawAnalytics.redAlertCount ?? 0),
    revenueByPaymentMethod:         (rawAnalytics.revenueByPaymentMethod ?? []) as typeof MOCK_ANALYTICS.revenueByPaymentMethod,
  };

  const kpis = USE_MOCK_DATA ? MOCK_KPIS : rawKpis;

  const revenueThisMonth       = analytics.revenueThisMonth;
  const newPatientsThisMonth   = analytics.newPatientsThisMonth;
  const completedProcedures    = analytics.completedProceduresThisMonth;
  const totalPatients          = analytics.totalPatients;
  const redAlertCount          = analytics.redAlertCount;

  type PaymentStat = { method: string; label: string; amount: number; percent: number; color: string };
  const revenueByPayment = analytics.revenueByPaymentMethod as PaymentStat[];

  const donutData = revenueByPayment.length > 0
    ? revenueByPayment
    : [{ method: "empty", label: "", amount: 1, percent: 100, color: "#e2e8f0" }];

  const centerValue = activeIdx !== null && revenueByPayment[activeIdx]
    ? fmtRevenue(revenueByPayment[activeIdx].amount)
    : fmtRevenue(revenueThisMonth);

  const centerLabel = activeIdx !== null && revenueByPayment[activeIdx]
    ? `${revenueByPayment[activeIdx].percent}%`
    : "Подробнее";

  return (
    <div className="min-h-full bg-[#f7f8fc] pb-8">

      {/* ─── White top strip: doctor circles + date row ─── */}
      <div className="bg-white border-b border-gray-100">
        {/* Doctor circles */}
        {kpis.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-1">
              {kpis.map((kpi, i) => {
                const initials = kpi.doctorName
                  .split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                const bg = DOCTOR_BG[i % DOCTOR_BG.length];
                return (
                  <motion.button
                    key={kpi.doctorId}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => navigate(`/staff/${kpi.doctorId}`)}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm"
                      style={{ backgroundColor: bg }}
                    >
                      {initials}
                    </div>
                    <span className="text-[11px] font-medium text-gray-600 max-w-[56px] truncate text-center leading-tight">
                      {kpi.doctorName.split(" ")[0]}
                    </span>
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
        <div className="relative pt-4 pb-2">
          {isLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={activeIdx !== null ? 108 : 104}
                  paddingAngle={donutData.length > 1 ? 2 : 0}
                  dataKey="amount"
                  startAngle={90}
                  endAngle={-270}
                  animationBegin={0}
                  animationDuration={800}
                  onMouseEnter={(_, idx) => revenueByPayment.length > 0 && setActiveIdx(idx)}
                  onMouseLeave={() => setActiveIdx(null)}
                  strokeWidth={0}
                >
                  {donutData.map((entry, idx) => (
                    <Cell
                      key={entry.method}
                      fill={entry.color}
                      opacity={activeIdx === null || activeIdx === idx ? 1 : 0.4}
                      style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                    />
                  ))}
                </Pie>
                {/* SVG center text rendered via foreignObject trick via absolute overlay */}
              </PieChart>
            </ResponsiveContainer>
          )}

          {/* Center overlay */}
          {!isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-gray-900 leading-none tracking-tight">
                {centerValue}
              </span>
              <button
                className="text-xs text-gray-400 mt-1.5 flex items-center gap-0.5 pointer-events-auto"
                onClick={() => navigate("/analytics")}
              >
                {centerLabel} <ChevronRight className="w-3 h-3" />
              </button>
            </div>
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

      {/* ─── KPI Tiles ─── */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">{t("dashboard.kpiTitle")}</h3>
          <button
            onClick={() => navigate("/analytics")}
            className="text-xs text-primary font-semibold flex items-center gap-0.5"
          >
            {t("dashboard.viewAll")} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: TrendingUp,
              label: t("dashboard.revenue"),
              value: isLoading ? "—" : fmtShort(revenueThisMonth) + " ₸",
              sub: t("dashboard.monthly"),
              color: "bg-emerald-50 text-emerald-600",
            },
            {
              icon: Activity,
              label: t("dashboard.monthlyProcedures"),
              value: isLoading ? "—" : String(completedProcedures),
              sub: t("dashboard.monthly"),
              color: "bg-violet-50 text-violet-600",
            },
            {
              icon: UserPlus,
              label: t("dashboard.newPatients"),
              value: isLoading ? "—" : String(newPatientsThisMonth),
              sub: t("dashboard.monthly"),
              color: "bg-blue-50 text-blue-600",
            },
            {
              icon: Layers,
              label: t("dashboard.totalPatients"),
              value: isLoading ? "—" : String(totalPatients),
              sub: t("dashboard.allTime"),
              color: "bg-orange-50 text-orange-600",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${item.color}`}>
                <item.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{item.value}</p>
              <p className="text-xs text-gray-500 mt-1.5 font-medium">{item.label}</p>
              <p className="text-[11px] text-gray-300 mt-0.5">{item.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t("dashboard.quickActions")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t("ownerDashboard.manageStaff"), icon: UserCog,    path: "/users",      color: "bg-slate-50 text-slate-600" },
            { label: t("nav.patients"),               icon: Users,       path: "/patients",   color: "bg-blue-50 text-blue-600" },
            { label: t("nav.inventory"),              icon: Activity,    path: "/inventory",  color: "bg-amber-50 text-amber-600" },
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
                    style={{ backgroundColor: "#98cc1c" }}
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
                    style={{ backgroundColor: "#98cc1c" }}
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
