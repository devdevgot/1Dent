import { useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  RefreshCw, ChevronRight, Bell, Settings, UserCog, Users,
  Activity, Stethoscope, Send, Banknote, QrCode, CreditCard,
  Clock, Wallet, CalendarDays, SlidersHorizontal, UserPlus, Layers,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

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

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const kpis = kpiData?.data?.kpis ?? [];

  const revenueThisMonth  = Number(analytics.revenueThisMonth ?? 0);
  const newPatientsThisMonth = Number(analytics.newPatientsThisMonth ?? 0);
  const completedProcedures  = Number(analytics.completedProceduresThisMonth ?? 0);
  const totalPatients        = Number(analytics.totalPatients ?? 0);
  const redAlertCount        = Number(analytics.redAlertCount ?? 0);

  type PaymentStat = { method: string; label: string; amount: number; percent: number; color: string };
  const revenueByPayment = ((analytics.revenueByPaymentMethod ?? []) as PaymentStat[]);

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

      {/* ─── Header ─── */}
      <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <button className="flex items-center gap-1.5" onClick={() => navigate("/settings")}>
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Stethoscope className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">{clinic?.name ?? "Клиника"}</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 rotate-90" />
          </button>
          <button
            onClick={() => refetch()}
            className="w-9 h-9 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Doctor circles ─── */}
      {kpis.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-3">
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

      {/* ─── Red Alert Banner ─── */}
      <AnimatePresence>
        {redAlertCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-4"
          >
            <button
              onClick={() => navigate("/kanban")}
              className="w-full bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-3 text-left"
            >
              <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-700">
                  {t("dashboard.redAlertTitle", { count: redAlertCount })}
                </p>
                <p className="text-xs text-red-500">{t("dashboard.redAlertDesc")}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Date row ─── */}
      <div className="mx-4 mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <CalendarDays className="w-4 h-4 text-primary" />
          <span className="capitalize">{todayLabel()}</span>
        </div>
        <button className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          Сегодня
        </button>
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
    </div>
  );
}
