import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import {
  Users, Activity, TrendingUp, AlertTriangle,
  Stethoscope, ChevronRight, RefreshCw, Star,
  UserCog,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

function StatCard({
  titleKey,
  value,
  icon: Icon,
  delay = 0,
  accentClass = "",
}: {
  titleKey: string;
  value: string | number;
  icon: React.ElementType;
  delay?: number;
  accentClass?: string;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-card p-6 rounded-2xl border border-border/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ring-1 ring-border/50 ${accentClass || "bg-slate-50 text-primary"}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-muted-foreground font-medium text-sm mb-1">{t(titleKey)}</h3>
      <div className="text-3xl font-display font-bold text-foreground">{value}</div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card p-6 rounded-2xl border border-border/50 animate-pulse">
      <div className="w-12 h-12 bg-slate-200 rounded-xl mb-4" />
      <div className="w-24 h-4 bg-slate-200 rounded mb-2" />
      <div className="w-20 h-8 bg-slate-200 rounded" />
    </div>
  );
}

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const kpis = kpiData?.data?.kpis ?? [];

  const fmt = (n: unknown) => {
    const num = Number(n ?? 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const fmtMoney = (n: unknown) => {
    const num = Number(n ?? 0);
    return `₸ ${num.toLocaleString("ru-KZ")}`;
  };

  const redAlertCount = Number(analytics.redAlertCount ?? 0);

  const cards = [
    { titleKey: "dashboard.totalPatients",     value: fmt(analytics.totalPatients),               icon: Users,      delay: 0 },
    { titleKey: "dashboard.newPatients",       value: fmt(analytics.newPatientsThisMonth),         icon: Star,       delay: 0.05 },
    { titleKey: "dashboard.monthlyProcedures", value: fmt(analytics.completedProceduresThisMonth), icon: Activity,   delay: 0.1 },
    { titleKey: "dashboard.revenue",           value: fmtMoney(analytics.revenueThisMonth),        icon: TrendingUp, delay: 0.15 },
  ];

  return (
    <div className="space-y-4 p-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">
            {t("dashboard.welcomeBack", { name: user?.name.split(" ")[0] })}
          </h2>
          <p className="text-muted-foreground mt-1 text-lg">
            {t("dashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="p-2.5 border border-border rounded-xl text-muted-foreground hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate("/users")}
            className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
          >
            <UserCog className="w-4 h-4" />
            {t("ownerDashboard.manageStaff")}
          </button>
        </div>
      </div>

      {/* Red Alert Banner */}
      {redAlertCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-destructive/10 border-2 border-destructive/20 rounded-2xl p-5 flex items-start sm:items-center gap-4"
        >
          <div className="bg-destructive text-white p-2.5 rounded-xl shrink-0 shadow-lg shadow-destructive/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-destructive">
              {t("dashboard.redAlertTitle", { count: redAlertCount })}
            </h3>
            <p className="text-destructive/80 font-medium mt-0.5">{t("dashboard.redAlertDesc")}</p>
          </div>
          <button
            onClick={() => navigate("/kanban")}
            className="mt-3 sm:mt-0 sm:ml-auto px-4 py-2 bg-white text-destructive font-bold rounded-lg border border-destructive/20 hover:bg-destructive hover:text-white transition-colors"
          >
            {t("dashboard.redAlertReview")}
          </button>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <StatCard key={i} titleKey={c.titleKey} value={c.value} icon={c.icon} delay={c.delay} />
            ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor KPI Table */}
        {kpis.length > 0 ? (
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-primary" />
                {t("dashboard.doctorKpi")}
              </h3>
              <button
                onClick={() => navigate("/analytics")}
                className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline"
              >
                {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left pb-3 font-semibold text-muted-foreground">{t("dashboard.doctor")}</th>
                    <th className="text-right pb-3 font-semibold text-muted-foreground">{t("dashboard.patients")}</th>
                    <th className="text-right pb-3 font-semibold text-muted-foreground">{t("dashboard.procedures")}</th>
                    <th className="text-right pb-3 font-semibold text-muted-foreground">{t("dashboard.revenue")}</th>
                    <th className="text-right pb-3 font-semibold text-muted-foreground">{t("dashboard.avgCheck")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {kpis.map((kpi, i) => (
                    <motion.tr
                      key={kpi.doctorId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {kpi.doctorName.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{kpi.doctorName}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-foreground">{kpi.patientsCount}</td>
                      <td className="py-3 text-right text-foreground">{kpi.proceduresCount}</td>
                      <td className="py-3 text-right font-semibold text-foreground">
                        ₸ {Number(kpi.revenueTotal).toLocaleString("ru-KZ")}
                      </td>
                      <td className="py-3 text-right text-muted-foreground">
                        ₸ {Number(kpi.averageCheck ?? 0).toLocaleString("ru-KZ")}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm min-h-[300px] flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-muted-foreground mb-4">
              <Stethoscope className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-xl font-bold font-display">{t("ownerDashboard.noDoctors")}</h3>
            <p className="text-muted-foreground max-w-sm mt-2">{t("ownerDashboard.noDoctorsDesc")}</p>
            <button
              onClick={() => navigate("/users")}
              className="mt-4 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/20"
            >
              {t("ownerDashboard.addStaff")}
            </button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h3 className="text-lg font-bold font-display mb-5">{t("dashboard.quickActions")}</h3>
          <div className="space-y-3">
            {[
              { label: t("ownerDashboard.manageStaff"), icon: UserCog,    path: "/users" },
              { label: t("nav.analytics"),              icon: TrendingUp,  path: "/analytics" },
              { label: t("nav.inventory"),              icon: Activity,    path: "/inventory" },
              { label: t("dashboard.openProcedures"),   icon: Stethoscope, path: "/procedures" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-border transition-all text-left group"
              >
                <div className="w-9 h-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="font-medium text-sm text-foreground">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
