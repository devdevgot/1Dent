import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  getGetOwnerAnalyticsQueryKey,
  useListProcedures,
} from "@workspace/api-client-react";
import {
  TrendingUp, Activity, Users, Star,
  RefreshCw, ChevronRight, Wallet,
  Stethoscope,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

function StatCard({
  titleKey,
  value,
  icon: Icon,
  delay = 0,
}: {
  titleKey: string;
  value: string | number;
  icon: React.ElementType;
  delay?: number;
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
        <div className="p-3 bg-slate-50 text-primary rounded-xl ring-1 ring-border/50">
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

export default function AccountantDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const procedures = proceduresData?.data?.procedures ?? [];

  const completedProcedures = procedures.filter((p) => p.status === "completed");
  const completedNoBilling = completedProcedures.filter((p) => !p.price || p.price === 0);

  const revenueByDoctor = completedProcedures.reduce<Record<string, { name: string; revenue: number; count: number }>>((acc, p) => {
    if (!p.doctorId || !p.doctorName) return acc;
    if (!acc[p.doctorId]) {
      acc[p.doctorId] = { name: p.doctorName, revenue: 0, count: 0 };
    }
    acc[p.doctorId].revenue += p.price ?? 0;
    acc[p.doctorId].count += 1;
    return acc;
  }, {});

  const doctorRevenueList = Object.entries(revenueByDoctor)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = doctorRevenueList.reduce((acc, d) => acc + d.revenue, 0);

  const fmt = (n: unknown) => {
    const num = Number(n ?? 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const fmtMoney = (n: unknown) => {
    const num = Number(n ?? 0);
    return `₸ ${num.toLocaleString("ru-KZ")}`;
  };

  const cards = [
    { titleKey: "dashboard.totalPatients",    value: fmt(analytics.totalPatients),                   icon: Users,      delay: 0 },
    { titleKey: "dashboard.revenue",          value: fmtMoney(analytics.revenueThisMonth),            icon: TrendingUp, delay: 0.05 },
    { titleKey: "dashboard.monthlyProcedures",value: fmt(analytics.completedProceduresThisMonth),     icon: Activity,   delay: 0.1 },
    { titleKey: "dashboard.newPatients",      value: fmt(analytics.newPatientsThisMonth),              icon: Star,       delay: 0.15 },
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
            {t("accountantDashboard.subtitle", { clinic: clinic?.name })}
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
            onClick={() => navigate("/financials")}
            className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            {t("accountantDashboard.financials")}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <StatCard key={i} titleKey={c.titleKey} value={c.value} icon={c.icon} delay={c.delay} />
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by Doctor — computed from procedures (accessible to accountants) */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold font-display flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              {t("accountantDashboard.revenueByDoctor")}
            </h3>
            <button
              onClick={() => navigate("/procedures")}
              className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {doctorRevenueList.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">{t("accountantDashboard.noData")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {doctorRevenueList.map((d, i) => {
                const pct = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-none">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{d.name}</span>
                        <div className="ml-2 flex-none text-right">
                          <span className="text-sm font-semibold text-foreground">
                            ₸ {d.revenue.toLocaleString("ru-KZ")}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">({d.count} {t("dashboard.procedures").toLowerCase()})</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className="bg-primary rounded-full h-1.5 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div className="pt-3 mt-2 border-t border-border/50 flex justify-between items-center">
                <span className="text-sm font-semibold text-muted-foreground">{t("accountantDashboard.totalRevenue")}</span>
                <span className="text-lg font-bold text-foreground">₸ {totalRevenue.toLocaleString("ru-KZ")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Billing Queue */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h3 className="text-lg font-bold font-display mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            {t("accountantDashboard.billingQueue")}
            {completedNoBilling.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">
                {completedNoBilling.length}
              </span>
            )}
          </h3>
          {completedNoBilling.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-emerald-600 font-semibold">{t("accountantDashboard.allBilled")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("accountantDashboard.allBilledDesc")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedNoBilling.slice(0, 6).map((proc) => (
                <div key={proc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-none" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{proc.name}</p>
                    <p className="text-xs text-muted-foreground">{proc.doctorName ?? "—"}</p>
                  </div>
                </div>
              ))}
              {completedNoBilling.length > 6 && (
                <button
                  onClick={() => navigate("/procedures")}
                  className="w-full text-center text-sm text-primary font-semibold mt-2 hover:underline"
                >
                  +{completedNoBilling.length - 6} {t("accountantDashboard.more")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
