import { useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { useGetAnalytics, useGetDoctorKpis, getGetDoctorKpisQueryKey } from "@workspace/api-client-react";
import {
  Users, Calendar, Activity, TrendingUp, AlertTriangle,
  Star, ChevronRight, RefreshCw, Stethoscope,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

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
      className="dash-stat-card group"
    >
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="dash-stat-icon">
          <Icon className="w-5 h-5" />
        </div>
        {trend && trendUp !== null && trendUp !== undefined && (
          <span
            className={`dash-badge text-body ${trendUp ? "dash-badge-success" : "dash-badge-danger"}`}
          >
            {trend}
          </span>
        )}
      </div>
      <h3 className="dash-stat-label relative z-10">{t(titleKey)}</h3>
      <div className="dash-stat-value relative z-10">{value}</div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="dash-stat-card">
      <div className="flex justify-between items-start mb-4">
        <div className="dash-skeleton w-11 h-11 rounded-xl" />
        <div className="dash-skeleton w-16 h-6 rounded-full" />
      </div>
      <div className="dash-skeleton w-24 h-4 rounded mb-2" />
      <div className="dash-skeleton w-20 h-8 rounded" />
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = SITE.dashboardTitles.default;
  }, []);

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
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner dash-stack">
        <div className="dash-page-header">
          <div>
            <h2 className="dash-page-title">
              {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
            </h2>
            <p className="dash-page-subtitle">
              {t("dashboard.subtitle", { clinic: clinic?.name })}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              aria-label={t("common.refresh", "Обновить")}
              onClick={() => refetch()}
              className="dash-btn-icon"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/kanban")}
              className="dash-btn dash-btn-primary"
            >
              {t("dashboard.newPatient")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {isOwnerOrAdmin && kpiLoading ? (
            <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated space-y-3">
              <div className="dash-skeleton w-40 h-5 rounded" />
              {[0, 1, 2, 3].map((i) => <div key={i} className="dash-skeleton h-10 rounded-xl" />)}
            </div>
          ) : isOwnerOrAdmin && kpis.length > 0 ? (
            <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated">
              <div className="flex items-center justify-between mb-6">
                <h3 className="dash-section-title">
                  <Stethoscope className="w-5 h-5 text-[var(--ds-primary)]" />
                  {t("dashboard.doctorKpi")}
                </h3>
                <button
                  type="button"
                  onClick={() => navigate("/procedures")}
                  className="dash-link"
                >
                  {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-sm">
                  <thead>
                    <tr>
                      <th>{t("dashboard.doctor")}</th>
                      <th className="text-right">{t("dashboard.patients")}</th>
                      <th className="text-right">{t("dashboard.procedures")}</th>
                      <th className="text-right">{t("dashboard.revenue")}</th>
                      <th className="text-right">{t("dashboard.avgCheck")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ds-border)]/40">
                    {kpis.map((kpi, i) => (
                      <motion.tr
                        key={kpi.doctorId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] flex items-center justify-center text-[var(--ds-primary)] font-bold text-xs">
                              {kpi.doctorName.charAt(0)}
                            </div>
                            <span className="font-medium text-[var(--text)]">{kpi.doctorName}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-[var(--text)]">{kpi.patientsCount}</td>
                        <td className="py-3 text-right text-[var(--text)]">{kpi.proceduresCount}</td>
                        <td className="py-3 text-right font-semibold text-[var(--text)]">
                          ₸ {Number(kpi.revenueTotal).toLocaleString("ru-KZ")}
                        </td>
                        <td className="py-3 text-right text-[var(--text-secondary)]">
                          ₸ {Number(kpi.averageCheck ?? 0).toLocaleString("ru-KZ")}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated min-h-[300px] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center text-[var(--text-subtle)] mb-4">
                <Activity className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text)]">{t("dashboard.activityFeedTitle")}</h3>
              <p className="text-[var(--text-secondary)] max-w-sm mt-2">{t("dashboard.activityFeedDesc")}</p>
              <button
                type="button"
                onClick={() => navigate("/procedures")}
                className="dash-btn dash-btn-primary mt-4"
              >
                {t("dashboard.goToProcedures")}
              </button>
            </div>
          )}

          <div className="dash-card dash-card-padded dash-card-elevated">
            <h3 className="dash-section-title mb-5">{t("dashboard.quickActions")}</h3>
            <div className="space-y-2">
              {[
                { label: t("dashboard.openKanban"),     icon: Calendar, path: "/kanban" },
                { label: t("dashboard.openDentalChart"), icon: Activity,  path: "/dental-chart" },
                { label: t("dashboard.openProcedures"), icon: Stethoscope, path: "/procedures" },
              ].map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="dash-quick-action group"
                >
                  <div className="dash-quick-action-icon">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-body text-[var(--text)]">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
