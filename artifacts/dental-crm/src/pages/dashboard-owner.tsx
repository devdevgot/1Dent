import { useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import {
  AlertTriangle, RefreshCw, ChevronRight, Stethoscope,
  Users, TrendingUp, Activity, Bell, Settings, UserCog,
  UserPlus, Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import type { PatientStatus } from "@workspace/api-client-react";

const STATUS_COLORS: Record<PatientStatus, string> = {
  new_request:           "#94a3b8",
  initial_consultation:  "#60a5fa",
  diagnostics:           "#facc15",
  treatment_assigned:    "#fb923c",
  treatment_in_progress: "#a78bfa",
  post_op_monitoring:    "#f472b6",
  completed:             "#34d399",
};

const fmtMoney = (n: number) =>
  `₸ ${n.toLocaleString("ru-KZ")}`;

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

const RADIAN = Math.PI / 180;

function CenterLabel({
  viewBox,
  value,
  label,
}: {
  viewBox?: { cx?: number; cy?: number };
  value: string;
  label: string;
}) {
  const { cx = 0, cy = 0 } = viewBox ?? {};
  return (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#1e293b" className="font-bold" fontSize={22} fontWeight={700}>
        {value}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize={11}>
        {label}
      </text>
    </>
  );
}

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const kpis = kpiData?.data?.kpis ?? [];

  const patientsByStatus = (analytics.patientsByStatus ?? {}) as Record<string, number>;
  const totalPatients = Number(analytics.totalPatients ?? 0);
  const newPatientsThisMonth = Number(analytics.newPatientsThisMonth ?? 0);
  const revenueThisMonth = Number(analytics.revenueThisMonth ?? 0);
  const completedProcedures = Number(analytics.completedProceduresThisMonth ?? 0);
  const redAlertCount = Number(analytics.redAlertCount ?? 0);

  const donutData = KANBAN_COLUMNS
    .map((col) => ({
      id: col.id as PatientStatus,
      label: col.label,
      value: patientsByStatus[col.id] ?? 0,
      color: STATUS_COLORS[col.id],
    }))
    .filter((d) => d.value > 0);

  const today = new Date().toLocaleDateString("ru", {
    weekday: "long", day: "numeric", month: "long",
  });

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-full bg-[#f7f8fc] pb-8">
      {/* ─── Header ─── */}
      <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-gray-900">{clinic?.name ?? "Клиника"}</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <p className="text-xs text-gray-400 capitalize">{today}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="w-9 h-9 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => navigate("/users")}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-lg font-bold text-gray-900 mt-3">
          {t("dashboard.welcomeBack", { name: firstName })} 👋
        </p>
      </div>

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

      {/* ─── Donut Chart Card ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : totalPatients === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-gray-300">
            <Users className="w-12 h-12 mb-2" />
            <p className="text-sm">{t("ownerDashboard.noDoctors")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-500">{t("dashboard.totalPatients")}</h2>
              <button
                onClick={() => navigate("/patients")}
                className="text-xs text-primary font-semibold flex items-center gap-0.5"
              >
                {t("dashboard.viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={activeIndex !== null ? 100 : 96}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={800}
                  onMouseEnter={(_, idx) => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {donutData.map((entry, idx) => (
                    <Cell
                      key={entry.id}
                      fill={entry.color}
                      opacity={activeIndex === null || activeIndex === idx ? 1 : 0.45}
                      style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                    />
                  ))}
                  <CenterLabel
                    value={String(activeIndex !== null ? donutData[activeIndex]?.value ?? totalPatients : totalPatients)}
                    label={activeIndex !== null ? (donutData[activeIndex]?.label ?? "") : t("dashboard.totalPatients")}
                  />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as typeof donutData[0];
                    const pct = totalPatients > 0 ? Math.round((d.value / totalPatients) * 100) : 0;
                    return (
                      <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-3 py-2 text-sm">
                        <p className="font-bold text-gray-900">{d.label}</p>
                        <p className="text-gray-500">{d.value} пац. · {pct}%</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Status breakdown list */}
        {!isLoading && donutData.length > 0 && (
          <div className="mt-1 space-y-2.5">
            {donutData.map((d, idx) => {
              const pct = totalPatients > 0 ? Math.round((d.value / totalPatients) * 100) : 0;
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
                    style={{ backgroundColor: d.color }}
                  >
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">{d.label}</span>
                      <span className="text-sm font-bold text-gray-900 ml-2 shrink-0">{d.value}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: idx * 0.04 + 0.2, duration: 0.5 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
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
            value: isLoading ? "—" : fmtMoney(revenueThisMonth),
            sub: t("dashboard.monthly"),
            color: "bg-emerald-50 text-emerald-600",
            accent: "#34d399",
          },
          {
            icon: Activity,
            label: t("dashboard.monthlyProcedures"),
            value: isLoading ? "—" : String(completedProcedures),
            sub: t("dashboard.monthly"),
            color: "bg-violet-50 text-violet-600",
            accent: "#a78bfa",
          },
          {
            icon: UserPlus,
            label: t("dashboard.newPatients"),
            value: isLoading ? "—" : String(newPatientsThisMonth),
            sub: t("dashboard.monthly"),
            color: "bg-blue-50 text-blue-600",
            accent: "#60a5fa",
          },
          {
            icon: Layers,
            label: t("dashboard.totalPatients"),
            value: isLoading ? "—" : String(totalPatients),
            sub: t("dashboard.allTime"),
            color: "bg-orange-50 text-orange-600",
            accent: "#fb923c",
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
              <item.icon className="w-4.5 h-4.5" />
            </div>
            <p className="text-2xl font-bold text-gray-900 leading-none">{item.value}</p>
            <p className="text-xs text-gray-500 mt-1.5 font-medium">{item.label}</p>
            <p className="text-[11px] text-gray-300 mt-0.5">{item.sub}</p>
          </motion.div>
        ))}
        </div>
      </div>

      {/* ─── Doctor KPIs ─── */}
      {kpis.length > 0 && (
        <div className="mx-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Stethoscope className="w-4 h-4 text-primary" />
              {t("dashboard.doctorKpi")}
            </h3>
            <button
              onClick={() => navigate("/analytics")}
              className="text-xs text-primary font-semibold flex items-center gap-0.5"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar -mx-4 px-4">
            {kpis.map((kpi, i) => {
              const initials = kpi.doctorName.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
              const bgColors = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500"];
              const bg = bgColors[i % bgColors.length];
              return (
                <motion.div
                  key={kpi.doctorId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm shrink-0 w-44"
                >
                  <div className={`w-10 h-10 ${bg} rounded-2xl flex items-center justify-center text-white font-bold text-sm mb-3`}>
                    {initials}
                  </div>
                  <p className="text-sm font-bold text-gray-900 truncate">{kpi.doctorName}</p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">
                    {kpi.patientsCount} {t("dashboard.patients")} · {kpi.proceduresCount} {t("dashboard.procedures")}
                  </p>
                  <div className="border-t border-gray-50 pt-3">
                    <p className="text-xs text-gray-400">{t("dashboard.revenue")}</p>
                    <p className="text-base font-bold text-gray-900">
                      {fmtShort(Number(kpi.revenueTotal))} ₸
                    </p>
                  </div>
                  {Number(kpi.averageCheck) > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-gray-400">{t("dashboard.avgCheck")}</p>
                      <p className="text-sm font-semibold text-gray-700">
                        {fmtShort(Number(kpi.averageCheck))} ₸
                      </p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

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
