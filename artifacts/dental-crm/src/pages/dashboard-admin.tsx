import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetAdminAnalytics,
  getGetAdminAnalyticsQueryKey,
  useListProcedures,
  useListPatients,
} from "@workspace/api-client-react";
import {
  Users, Calendar, AlertTriangle, Star,
  KanbanSquare, Stethoscope, ChevronRight, RefreshCw,
  Clock, Package,
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

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: analyticsData, isLoading, refetch } = useGetAdminAnalytics({
    query: { queryKey: getGetAdminAnalyticsQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();
  const { data: patientsData } = useListPatients();

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const procedures = proceduresData?.data?.procedures ?? [];
  const patients = patientsData?.data?.patients ?? [];

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

  const redAlertCount = Number(analytics.redAlertCount ?? 0);

  const cards = [
    { titleKey: "dashboard.totalPatients",  value: String(analytics.totalPatients ?? 0),    icon: Users,         delay: 0 },
    { titleKey: "dashboard.scheduledToday", value: String(analytics.scheduledToday ?? 0),   icon: Calendar,      delay: 0.05 },
    { titleKey: "dashboard.newToday",       value: String(analytics.newPatientsToday ?? 0), icon: Star,          delay: 0.1 },
    { titleKey: "dashboard.redAlerts",      value: String(analytics.redAlertCount ?? 0),    icon: AlertTriangle, delay: 0.15 },
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
            {t("adminDashboard.subtitle", { clinic: clinic?.name })}
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
            onClick={() => navigate("/kanban")}
            className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
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
              <StatCard key={i} titleKey={c.titleKey} value={c.value} icon={c.icon} delay={c.delay} />
            ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {t("adminDashboard.todaySchedule")}
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
              <p className="text-muted-foreground font-medium">{t("adminDashboard.noSchedule")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {todayProcedures.slice(0, 8).map((proc, i) => {
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
                        {proc.doctorName && ` · ${proc.doctorName}`}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex-none">
                      {t("adminDashboard.scheduled")}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h3 className="text-lg font-bold font-display mb-5">{t("dashboard.quickActions")}</h3>
          <div className="space-y-3">
            {[
              { label: t("nav.kanban"),     icon: KanbanSquare, path: "/kanban",     desc: t("adminDashboard.kanbanDesc") },
              { label: t("nav.procedures"), icon: Stethoscope,  path: "/procedures", desc: t("adminDashboard.proceduresDesc") },
              { label: t("nav.patients"),   icon: Users,        path: "/patients",   desc: t("adminDashboard.patientsDesc") },
              { label: t("nav.inventory"),  icon: Package,      path: "/inventory",  desc: t("adminDashboard.inventoryDesc") },
              { label: t("nav.users"),      icon: Users,        path: "/users",      desc: t("adminDashboard.usersDesc") },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-border transition-all text-left group"
              >
                <div className="w-9 h-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors flex-none">
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
