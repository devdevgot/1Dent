import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetDoctorAnalytics,
  getGetDoctorAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  ChevronRight, Bell, X, ChevronLeft,
  Activity, Stethoscope, Banknote, QrCode, CreditCard,
  Clock, Wallet, Calendar, CalendarDays, SlidersHorizontal, Users,
  TrendingUp, BarChart3, Send, UserPlus,
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

function fmtRevenue(n: number) {
  return n.toLocaleString("ru-KZ") + " ₸";
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
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

// ─── DATE FILTER ─────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const USE_MOCK_DATA = false;

const MOCK_ANALYTICS = {
  myRevenueThisMonth: 1_820_000,
  myProceduresThisMonth: 42,
  myPatientsCount: 31,
  scheduledToday: 8,
  redAlertCount: 1,
  revenueByPaymentMethod: [
    { method: "kaspi_transfer", label: "Kaspi перевод", amount: 728_000,  percent: 40, color: "#4B7BEC" },
    { method: "cash",           label: "Наличка",        amount: 364_000,  percent: 20, color: "#26de81" },
    { method: "kaspi_qr",       label: "Kaspi QR",       amount: 273_000,  percent: 15, color: "#fd9644" },
    { method: "terminal",       label: "Терминал",        amount: 182_000,  percent: 10, color: "#2d3436" },
    { method: "kaspi_red",      label: "Kaspi RED",       amount: 182_000,  percent: 10, color: "#fc5c65" },
    { method: "debt",           label: "В долг",          amount:  91_000,  percent:  5, color: "#a29bfe" },
  ],
};
// ─────────────────────────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // ── Date filter state ──
  const [filterOpen, setFilterOpen]       = useState(false);
  const [showCustom, setShowCustom]       = useState(false);
  const [filterPreset, setFilterPreset]   = useState<FilterPreset>("month");
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

  const filterLabel    = FILTER_PRESETS.find(p => p.key === filterPreset)?.label ?? "Месяц";
  const dateRangeLabel = fmtDateRange(dateRange.from, dateRange.to);

  const { data: analyticsData, isLoading: apiLoading } = useGetDoctorAnalytics({
    query: { queryKey: getGetDoctorAnalyticsQueryKey() },
  });
  const isLoading = USE_MOCK_DATA ? false : apiLoading;

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;

  const realAnalytics = USE_MOCK_DATA ? MOCK_ANALYTICS : {
    myRevenueThisMonth:       Number(rawAnalytics.myRevenueThisMonth ?? 0),
    myProceduresThisMonth:    Number(rawAnalytics.myProceduresThisMonth ?? 0),
    myPatientsCount:          Number(rawAnalytics.myPatientsCount ?? 0),
    scheduledToday:           Number(rawAnalytics.scheduledToday ?? 0),
    redAlertCount:            Number(rawAnalytics.redAlertCount ?? 0),
    revenueByPaymentMethod:   (rawAnalytics.revenueByPaymentMethod ?? []) as typeof MOCK_ANALYTICS.revenueByPaymentMethod,
  };

  const hasRealRevenue = realAnalytics.myRevenueThisMonth > 0 || realAnalytics.revenueByPaymentMethod.length > 0;
  const analytics = hasRealRevenue ? realAnalytics : {
    ...realAnalytics,
    myRevenueThisMonth:     MOCK_ANALYTICS.myRevenueThisMonth,
    revenueByPaymentMethod: MOCK_ANALYTICS.revenueByPaymentMethod,
  };

  const revenueThisMonth   = analytics.myRevenueThisMonth;
  const myProcedures       = analytics.myProceduresThisMonth;
  const myPatients         = analytics.myPatientsCount;
  const scheduledToday     = analytics.scheduledToday;
  const redAlertCount      = analytics.redAlertCount;

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

      {/* ─── White top strip: date row ─── */}
      <div className="bg-white border-b border-gray-100">
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
      </div>

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
                onClick={() => navigate("/doctor-analytics")}
              >
                {centerLabel} <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ─── Quick Actions ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t("dashboard.quickActions")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t("nav.patients"),    icon: Users,       path: "/patients",         color: "bg-blue-50 text-blue-600" },
            { label: t("nav.schedule"),    icon: Calendar,    path: "/schedule",         color: "bg-violet-50 text-violet-600" },
            { label: t("nav.myAnalytics"), icon: BarChart3,   path: "/doctor-analytics", color: "bg-emerald-50 text-emerald-600" },
            { label: t("nav.chat"),        icon: UserPlus,    path: "/chat",             color: "bg-amber-50 text-amber-600" },
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
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h2 className="text-base font-bold text-gray-900">Фильтр по дате</h2>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

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
                        pendingPreset === p.key ? "border-primary bg-primary" : "border-gray-300",
                      )}>
                        {pendingPreset === p.key && (
                          <span className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

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
                    onClick={() => { setFilterOpen(false); setShowCustom(false); }}
                    className="w-full py-3.5 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100"
                  >
                    Отмена
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
                className="px-5"
              >
                <div className="flex items-center gap-3 pt-4 pb-2">
                  <button
                    onClick={() => setShowCustom(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-bold text-gray-900">Выбрать период</h2>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">С</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">По</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      setFilterPreset("custom");
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
                    style={{ backgroundColor: "#98cc1c" }}
                  >
                    Применить
                  </button>
                  <button
                    onClick={() => setShowCustom(false)}
                    className="w-full py-3.5 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100"
                  >
                    Назад
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
