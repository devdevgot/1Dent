import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetDoctorAnalytics,
  getGetDoctorAnalyticsQueryKey,
  useListProcedures,
  useGetMySalary,
} from "@workspace/api-client-react";
import type { Procedure } from "@workspace/api-client-react";
import {
  ChevronRight, X, ChevronLeft,
  Banknote, QrCode, CreditCard,
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const DOW_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}


export default function DoctorDashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [, navigate] = useLocation();

  // ── Date filter state ──
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
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

  const { data: analyticsData, isLoading } = useGetDoctorAnalytics({
    query: { queryKey: getGetDoctorAnalyticsQueryKey() },
  });

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;

  type PaymentStat = { method: string; label: string; amount: number; percent: number; color: string };

  const analytics = {
    myRevenueThisMonth:       Number(rawAnalytics.myRevenueThisMonth ?? 0),
    myProceduresThisMonth:    Number(rawAnalytics.myProceduresThisMonth ?? 0),
    myPatientsCount:          Number(rawAnalytics.myPatientsCount ?? 0),
    scheduledToday:           Number(rawAnalytics.scheduledToday ?? 0),
    redAlertCount:            Number(rawAnalytics.redAlertCount ?? 0),
    revenueByPaymentMethod:   (rawAnalytics.revenueByPaymentMethod ?? []) as PaymentStat[],
  };

  const revenueThisMonth   = analytics.myRevenueThisMonth;
  const myProcedures       = analytics.myProceduresThisMonth;
  const myPatients         = analytics.myPatientsCount;
  const scheduledToday     = analytics.scheduledToday;
  const redAlertCount      = analytics.redAlertCount;

  // ── My salary ──
  const { data: salaryData } = useGetMySalary();

  // ── Schedule widget data ──
  const { data: proceduresData } = useListProcedures();
  const upcomingAppointments = useMemo(() => {
    const allProcs = (proceduresData?.data?.procedures ?? []) as Procedure[];
    const mine = user?.id ? allProcs.filter(p => p.doctorId === user.id) : allProcs;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    return mine
      .filter(p => p.scheduledAt && p.status === "scheduled" && new Date(p.scheduledAt) >= todayStart)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [proceduresData, user?.id]);

  // Group by date key, max 3 days
  const scheduleByDay = useMemo(() => {
    const map = new Map<string, Procedure[]>();
    upcomingAppointments.forEach(p => {
      if (!p.scheduledAt) return;
      const key = toDateKey(new Date(p.scheduledAt));
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return Array.from(map.entries()).slice(0, 3);
  }, [upcomingAppointments]);

  const activeDayKey = selectedDayKey && scheduleByDay.some(([k]) => k === selectedDayKey)
    ? selectedDayKey
    : scheduleByDay[0]?.[0] ?? toDateKey(new Date());
  const activeDayProcs = scheduleByDay.find(([k]) => k === activeDayKey)?.[1] ?? [];

  // salary helpers
  const mySalary = salaryData?.data;
  const salaryTypeLabel = mySalary
    ? mySalary.salaryType === "fixed"
      ? t("payroll.fixed", "Оклад")
      : mySalary.salaryType === "commission"
        ? t("payroll.commission", "Процент")
        : t("payroll.fixedPlusCommission", "Оклад + %")
    : null;

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

      {/* ─── My Revenue + Salary Card ─── */}
      <div className="mx-4 mt-3 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 pt-4 pb-4">
          {/* PRIMARY: Salary */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("payroll.mySalary", "Моя зарплата")}
                  {mySalary?.period && (
                    <span className="ml-1.5 font-normal normal-case text-gray-400">
                      {t("employees.since", "за")} {new Date(mySalary.period.year, mySalary.period.month - 1).toLocaleDateString("ru", { month: "long", year: "numeric" })}
                    </span>
                  )}
                </p>
                {mySalary && (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                    mySalary.status === "paid"     ? "bg-emerald-100 text-emerald-700" :
                    mySalary.status === "approved" ? "bg-blue-100 text-blue-700" :
                                                     "bg-amber-100 text-amber-700",
                  )}>
                    {mySalary.status === "paid"     ? t("payroll.statusPaid", "Выплачено") :
                     mySalary.status === "approved" ? t("payroll.statusApproved", "Утверждено") :
                                                      t("payroll.statusPending", "Предварительно")}
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="h-9 w-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : !mySalary ? (
                <p className="text-sm text-gray-400 italic">{t("payroll.noSettings", "Настройки зарплаты не заданы")}</p>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-900 tracking-tight leading-none">
                    {fmtRevenue(mySalary.calculatedSalary)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {mySalary.salaryType === "fixed" && `${t("payroll.fixed", "Оклад")}: ${fmtRevenue(mySalary.fixedAmount)}`}
                    {mySalary.salaryType === "commission" && `${mySalary.commissionPercent}% ${t("payroll.ofRevenue", "от выручки")}`}
                    {mySalary.salaryType === "fixed_plus_commission" && `${fmtRevenue(mySalary.fixedAmount)} + ${mySalary.commissionPercent}%`}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => navigate("/payroll/my")}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl mt-1"
              style={{ backgroundColor: "#98cc1c22", color: "#98cc1c" }}
            >
              {t("payroll.history", "История")}
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 my-3" />

          {/* SECONDARY: Revenue + analytics link */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                {t("dashboard.myRevenue", "Выручка")}
              </p>
              <p className="text-base font-semibold text-gray-700">
                {isLoading ? "—" : fmtRevenue(revenueThisMonth)}
              </p>
            </div>
            <button
              onClick={() => navigate("/doctor-analytics")}
              className="flex items-center gap-0.5 text-xs font-semibold"
              style={{ color: "#98cc1c" }}
            >
              {t("dashboard.details", "Подробнее")} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Schedule Widget ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#98cc1c22" }}>
              <Calendar className="w-4 h-4" style={{ color: "#98cc1c" }} />
            </div>
            <span className="text-sm font-bold text-gray-800">Предстоящие записи</span>
          </div>
          <button
            onClick={() => navigate(`/schedule/${activeDayKey}`)}
            className="flex items-center gap-0.5 text-xs font-semibold"
            style={{ color: "#98cc1c" }}
          >
            Все <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Day tabs */}
        <div className="flex gap-2 px-4 pb-3">
          {scheduleByDay.map(([dateKey]) => {
            const d = new Date(dateKey + "T00:00:00");
            const isToday = toDateKey(new Date()) === dateKey;
            const isActive = dateKey === activeDayKey;
            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDayKey(dateKey)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 rounded-2xl transition-all",
                  isActive ? "text-white shadow-sm" : "bg-gray-50 text-gray-500",
                )}
                style={isActive ? { backgroundColor: "#98cc1c" } : undefined}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
                  {isToday ? "Сегодня" : DOW_SHORT[d.getDay()]}
                </span>
                <span className="text-xl font-bold leading-tight">{d.getDate()}</span>
                <span className="text-[10px] leading-none opacity-75">{MONTHS_RU[d.getMonth()]}</span>
                {scheduleByDay.find(([k]) => k === dateKey)?.[1].length ? (
                  <span className={cn(
                    "mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-white/30 text-white" : "bg-primary/10 text-primary",
                  )}>
                    {scheduleByDay.find(([k]) => k === dateKey)![1].length} зап.
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Appointments for selected day */}
        <div className="px-4 pb-4 space-y-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeDayKey}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              {activeDayProcs.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">Нет записей на этот день</p>
              ) : (
                activeDayProcs.map((proc, i) => {
                  const time = proc.scheduledAt
                    ? new Date(proc.scheduledAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
                    : "";
                  const c = { bg: "#eff6ff", border: "#bfdbfe", dot: "#2563eb" };
                  return (
                    <motion.div
                      key={proc.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => navigate(`/schedule/${activeDayKey}`)}
                      className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 border cursor-pointer active:scale-[0.98] transition-transform"
                      style={{ backgroundColor: c.bg, borderColor: c.border }}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.dot + "22" }}>
                        <Clock className="w-3.5 h-3.5" style={{ color: c.dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{proc.name}</p>
                        {time && <p className="text-[10px] font-medium mt-0.5" style={{ color: c.dot }}>{time}</p>}
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2 py-1 rounded-xl shrink-0"
                        style={{ backgroundColor: c.dot + "18", color: c.dot }}
                      >
                        {time}
                      </span>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
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
