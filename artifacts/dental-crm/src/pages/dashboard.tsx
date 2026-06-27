import { useAuthStore } from "@/hooks/use-auth";
import { useGetAnalytics, useGetDoctorKpis, getGetDoctorKpisQueryKey } from "@workspace/api-client-react";
import {
  Users, Calendar, Activity, TrendingUp, AlertTriangle,
  Star, ChevronRight, RefreshCw, Stethoscope,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

function StatCard({
  titleKey,
  value,
  icon: Icon,
  trend,
  trendUp,
  delay = 0,
}: {
  titleKey: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean | null;
  delay?: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md hover:shadow-lg transition-shadow group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-[#1f75fe]/5 rounded-full blur-2xl group-hover:bg-[#1f75fe]/10 transition-colors" />
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-[#f1ede4] text-[#1f75fe] rounded-xl ring-1 ring-[#e8e3d9]/50">
          <Icon className="w-6 h-6" />
        </div>
        {trend && trendUp !== null && trendUp !== undefined && (
          <span
            className={`text-sm font-bold px-2.5 py-1 rounded-full ${trendUp ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"}`}
          >
            {trend}
          </span>
        )}
      </div>
      <h3 className="text-[#64748b] font-medium text-sm mb-1">{t(titleKey)}</h3>
      <div className="text-3xl font-display font-bold text-[#0f172a]">{value}</div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 bg-[#f1ede4] rounded-xl" />
        <div className="w-16 h-6 bg-[#f1ede4] rounded-full" />
      </div>
      <div className="w-24 h-4 bg-[#f1ede4] rounded mb-2" />
      <div className="w-20 h-8 bg-[#f1ede4] rounded" />
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: analyticsData, isLoading, refetch } = useGetAnalytics();
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";
  const { data: kpiData, isLoading: kpiLoading } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey(), enabled: isOwnerOrAdmin },
  });

  const role = user?.role ?? "doctor";
  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;

  const fmt = (n: unknown) => {
    const num = Number(n ?? 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const fmtMoney = (n: unknown) => {
    const num = Number(n ?? 0);
    return `₸ ${num.toLocaleString("ru-KZ")}`;
  };

  const kpis = kpiData?.data?.kpis ?? [];

  const redAlertCount = Number(analytics.redAlertCount ?? 0);

  const getCards = () => {
    if (role === "doctor") {
      return [
        { titleKey: "dashboard.myPatients",    value: fmt(analytics.myPatientsCount),       icon: Users,       delay: 0 },
        { titleKey: "dashboard.scheduledToday", value: fmt(analytics.scheduledToday),         icon: Calendar,    delay: 0.05 },
        { titleKey: "dashboard.monthlyProcs",  value: fmt(analytics.myProceduresThisMonth),  icon: Activity,    delay: 0.1 },
        { titleKey: "dashboard.revenue",       value: fmtMoney(analytics.myRevenueThisMonth),icon: TrendingUp,  delay: 0.15 },
      ];
    }
    if (role === "accountant") {
      return [
        { titleKey: "dashboard.totalPatients",    value: fmt(analytics.totalPatients),            icon: Users,      delay: 0 },
        { titleKey: "dashboard.revenue",          value: fmtMoney(analytics.revenueThisMonth),     icon: TrendingUp, delay: 0.05 },
        { titleKey: "dashboard.monthlyProcedures",value: fmt(analytics.completedProceduresThisMonth), icon: Activity, delay: 0.1 },
        { titleKey: "dashboard.newPatients",      value: fmt(analytics.newPatientsThisMonth),       icon: Star,       delay: 0.15 },
      ];
    }
    if (role === "warehouse" || role === "admin") {
      return [
        { titleKey: "dashboard.totalPatients",  value: fmt(analytics.totalPatients),    icon: Users,         delay: 0 },
        { titleKey: "dashboard.scheduledToday", value: fmt(analytics.scheduledToday),   icon: Calendar,      delay: 0.05 },
        { titleKey: "dashboard.newToday",       value: fmt(analytics.newPatientsToday), icon: Star,          delay: 0.1 },
        { titleKey: "dashboard.redAlerts",      value: fmt(analytics.redAlertCount),    icon: AlertTriangle, delay: 0.15 },
      ];
    }
    return [
      { titleKey: "dashboard.totalPatients",     value: fmt(analytics.totalPatients),               icon: Users,      delay: 0 },
      { titleKey: "dashboard.newPatients",       value: fmt(analytics.newPatientsThisMonth),         icon: Star,       delay: 0.05 },
      { titleKey: "dashboard.monthlyProcedures", value: fmt(analytics.completedProceduresThisMonth), icon: Activity,   delay: 0.1 },
      { titleKey: "dashboard.revenue",           value: fmtMoney(analytics.revenueThisMonth),        icon: TrendingUp, delay: 0.15 },
    ];
  };

  const cards = getCards();

  return (
    <div className="space-y-4 p-4 pb-8 bg-[#faf8f4] font-manrope">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md">
        <div>
          <h2 className="text-3xl font-display font-bold text-[#0f172a]">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="text-[#64748b] mt-1 text-lg">
            {t("dashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="p-2.5 border border-[#e8e3d9] rounded-xl text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate("/kanban")}
            className="px-5 py-2.5 bg-[#1f75fe] text-white font-semibold rounded-full hover:scale-105 hover:bg-[#1a65e8] transition-all"
          >
            {t("dashboard.newPatient")}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <StatCard
                key={i}
                titleKey={c.titleKey}
                value={c.value}
                icon={c.icon}
                delay={c.delay}
              />
            ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor KPI Table — owner/admin only */}
        {isOwnerOrAdmin && kpiLoading ? (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md space-y-3">
            <div className="w-40 h-5 bg-[#f1ede4] rounded animate-pulse" />
            {[0,1,2,3].map(i => <div key={i} className="h-10 bg-[#f1ede4] rounded-xl animate-pulse" />)}
          </div>
        ) : isOwnerOrAdmin && kpis.length > 0 ? (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-[#1f75fe]" />
                {t("dashboard.doctorKpi")}
              </h3>
              <button
                onClick={() => navigate("/procedures")}
                className="text-sm text-[#1f75fe] font-semibold flex items-center gap-1 hover:underline"
              >
                {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e3d9]">
                    <th className="text-left pb-3 uppercase text-xs font-semibold text-[#64748b]">{t("dashboard.doctor")}</th>
                    <th className="text-right pb-3 uppercase text-xs font-semibold text-[#64748b]">{t("dashboard.patients")}</th>
                    <th className="text-right pb-3 uppercase text-xs font-semibold text-[#64748b]">{t("dashboard.procedures")}</th>
                    <th className="text-right pb-3 uppercase text-xs font-semibold text-[#64748b]">{t("dashboard.revenue")}</th>
                    <th className="text-right pb-3 uppercase text-xs font-semibold text-[#64748b]">{t("dashboard.avgCheck")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e3d9]/30">
                  {kpis.map((kpi, i) => (
                    <motion.tr
                      key={kpi.doctorId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="hover:bg-[#faf8f4] transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center text-[#1f75fe] font-bold text-xs">
                            {kpi.doctorName.charAt(0)}
                          </div>
                          <span className="font-medium text-[#0f172a]">{kpi.doctorName}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-[#0f172a]">{kpi.patientsCount}</td>
                      <td className="py-3 text-right text-[#0f172a]">{kpi.proceduresCount}</td>
                      <td className="py-3 text-right font-semibold text-[#0f172a]">
                        ₸ {Number(kpi.revenueTotal).toLocaleString("ru-KZ")}
                      </td>
                      <td className="py-3 text-right text-[#64748b]">
                        ₸ {Number(kpi.averageCheck ?? 0).toLocaleString("ru-KZ")}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md min-h-[300px] flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-[#f1ede4] rounded-2xl flex items-center justify-center text-[#64748b] mb-4">
              <Activity className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-xl font-bold font-display text-[#0f172a]">{t("dashboard.activityFeedTitle")}</h3>
            <p className="text-[#64748b] max-w-sm mt-2">{t("dashboard.activityFeedDesc")}</p>
            <button
              onClick={() => navigate("/procedures")}
              className="mt-4 px-4 py-2 bg-[#1f75fe] text-white text-sm font-semibold rounded-full hover:scale-105 hover:bg-[#1a65e8] transition-all"
            >
              {t("dashboard.goToProcedures")}
            </button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <h3 className="text-lg font-bold font-display mb-5 text-[#0f172a]">{t("dashboard.quickActions")}</h3>
          <div className="space-y-3">
            {[
              { label: t("dashboard.openKanban"),     icon: Calendar, path: "/kanban" },
              { label: t("dashboard.openDentalChart"), icon: Activity,  path: "/dental-chart" },
              { label: t("dashboard.openProcedures"), icon: Stethoscope, path: "/procedures" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#f1ede4] border border-transparent hover:border-[#e8e3d9] transition-all text-left group"
              >
                <div className="w-9 h-9 bg-[#1f75fe]/10 text-[#1f75fe] rounded-lg flex items-center justify-center group-hover:bg-[#1f75fe] group-hover:text-white transition-colors">
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="font-medium text-sm text-[#0f172a]">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-[#64748b] ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
