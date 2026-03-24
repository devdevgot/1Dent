import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetDoctorAnalytics,
  getGetDoctorAnalyticsQueryKey,
  useListPatients,
  useListProcedures,
} from "@workspace/api-client-react";
import {
  Users, Calendar, Activity, TrendingUp, RefreshCw,
  Stethoscope, ChevronRight, Clock, BarChart3,
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

export default function DoctorDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: analyticsData, isLoading, refetch } = useGetDoctorAnalytics({
    query: { queryKey: getGetDoctorAnalyticsQueryKey() },
  });
  const { data: patientsData } = useListPatients();
  const { data: proceduresData } = useListProcedures();

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const patients = patientsData?.data?.patients ?? [];
  const procedures = proceduresData?.data?.procedures ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayProcedures = procedures.filter((p) => {
    if (p.status === "scheduled" && p.scheduledAt) {
      const d = new Date(p.scheduledAt);
      return d >= today && d <= todayEnd;
    }
    return false;
  }).sort((a, b) => {
    const da = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
    const db = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
    return da - db;
  });

  const fmt = (n: unknown) => {
    const num = Number(n ?? 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const fmtMoney = (n: unknown) => {
    const num = Number(n ?? 0);
    return `₸ ${num.toLocaleString("ru-KZ")}`;
  };

  const cards = [
    { titleKey: "dashboard.myPatients",    value: fmt(analytics.myPatientsCount),        icon: Users,      delay: 0 },
    { titleKey: "dashboard.scheduledToday",value: fmt(analytics.scheduledToday),          icon: Calendar,   delay: 0.05 },
    { titleKey: "dashboard.monthlyProcs",  value: fmt(analytics.myProceduresThisMonth),   icon: Activity,   delay: 0.1 },
    { titleKey: "dashboard.revenue",       value: fmtMoney(analytics.myRevenueThisMonth), icon: TrendingUp, delay: 0.15 },
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
            {t("doctorDashboard.subtitle", { clinic: clinic?.name })}
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
            onClick={() => navigate("/doctor-analytics")}
            className="px-5 py-2.5 bg-slate-100 text-foreground font-semibold rounded-xl hover:bg-slate-200 transition-colors"
          >
            {t("doctorDashboard.myAnalytics")}
          </button>
          <button
            onClick={() => navigate("/procedures")}
            className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            {t("doctorDashboard.myProcedures")}
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Procedures */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {t("doctorDashboard.todayProcedures")}
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-1">
                {todayProcedures.length}
              </span>
            </h3>
            <button
              onClick={() => navigate("/procedures")}
              className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {todayProcedures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">{t("doctorDashboard.noToday")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {todayProcedures.slice(0, 6).map((proc, i) => {
                const patient = patients.find((p) => p.id === proc.patientId);
                const timeStr = proc.scheduledAt
                  ? new Date(proc.scheduledAt).toLocaleTimeString("ru-KZ", { hour: "2-digit", minute: "2-digit" })
                  : "—";
                return (
                  <motion.div
                    key={proc.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-4 py-3"
                  >
                    <div className="w-12 text-center flex-none">
                      <span className="text-sm font-bold text-primary">{timeStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{proc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {patient?.name ?? proc.patientId}
                      </p>
                    </div>
                    {proc.price > 0 && (
                      <span className="text-xs font-semibold text-muted-foreground flex-none">
                        ₸ {proc.price.toLocaleString("ru-KZ")}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* My Patients + Quick Actions */}
        <div className="space-y-4">
          {/* My Patients Panel */}
          <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold font-display flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {t("dashboard.myPatients")}
              </h3>
              <button
                onClick={() => navigate("/patients")}
                className="text-sm text-primary font-semibold hover:underline"
              >
                {t("dashboard.viewAll")}
              </button>
            </div>
            {patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("doctorDashboard.noPatients")}</p>
            ) : (
              <div className="space-y-2">
                {patients.slice(0, 5).map((patient) => (
                  <div key={patient.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-none">
                      {patient.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">{t(`status.${patient.status}`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
            <h3 className="text-base font-bold font-display mb-4">{t("dashboard.quickActions")}</h3>
            <div className="space-y-2">
              {[
                { label: t("nav.myAnalytics"), icon: BarChart3,   path: "/doctor-analytics", highlight: true },
                { label: t("nav.patients"),    icon: Users,       path: "/patients" },
                { label: t("nav.procedures"),  icon: Stethoscope, path: "/procedures" },
                { label: t("nav.chat"),        icon: Activity,    path: "/chat" },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group ${
                    item.highlight
                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                      : "hover:bg-slate-50 border-transparent hover:border-border"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center group-hover:text-white transition-colors ${
                    item.highlight
                      ? "bg-primary text-white"
                      : "bg-primary/10 text-primary group-hover:bg-primary"
                  }`}>
                    <item.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={`font-medium text-sm ${item.highlight ? "text-primary font-semibold" : "text-foreground"}`}>
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>

          {/* Monthly KPI */}
          {!isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-2xl border border-border/50 p-5 shadow-sm"
            >
              <h3 className="text-base font-bold font-display mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {t("doctorDashboard.myKpiTitle")}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("doctorDashboard.thisMonth")}</span>
                  <span className="text-sm font-bold text-foreground">{fmt(analytics.myProceduresThisMonth)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("doctorDashboard.myRevenue")}</span>
                  <span className="text-sm font-bold text-foreground">{fmtMoney(analytics.myRevenueThisMonth)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
