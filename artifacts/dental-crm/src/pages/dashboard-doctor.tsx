import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetDoctorAnalytics,
  getGetDoctorAnalyticsQueryKey,
  useListPatients,
  useListProcedures,
} from "@workspace/api-client-react";
import {
  Users, Calendar, Activity, TrendingUp, RefreshCw,
  Stethoscope, ChevronRight, Clock, BarChart3, ArrowUpRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-white to-blue-50/50 p-8 rounded-3xl border border-primary/10 shadow-lg">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-48 h-48 bg-blue-200/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col gap-6">
          {/* Top row with content */}
          <div className="flex items-start justify-between gap-6">
            {/* Left side - text content */}
            <div className="flex-1 min-w-0">
              <h2 className="text-4xl font-display font-bold text-foreground leading-tight">
                {t("dashboard.welcomeBack", { name: user?.name.split(" ")[0] })}
              </h2>
              <p className="text-muted-foreground mt-2 text-lg leading-relaxed">
                {t("doctorDashboard.subtitle", { clinic: clinic?.name })}
              </p>
            </div>
            
            {/* Right side - refresh button */}
            <button
              onClick={() => refetch()}
              className="flex-shrink-0 p-3 bg-white border border-border/50 rounded-xl text-muted-foreground hover:bg-slate-50 hover:text-primary transition-all hover:shadow-md"
              title="Обновить"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom row with action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate("/doctor-analytics")}
              className="flex items-center justify-center gap-3 px-6 py-3 bg-white border border-border/50 text-foreground font-semibold rounded-2xl hover:bg-slate-50 hover:shadow-md transition-all group"
            >
              <BarChart3 className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              <span>{t("doctorDashboard.myAnalytics")}</span>
            </button>
            <button
              onClick={() => navigate("/procedures")}
              className="flex items-center justify-center gap-3 px-8 py-3 bg-gradient-to-r from-primary to-blue-600 text-white font-semibold rounded-2xl shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 transition-all group"
            >
              <Stethoscope className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <span>{t("doctorDashboard.myProcedures")}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Salary Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {t("doctorDashboard.salary")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{t("doctorDashboard.salaryDescription")}</p>
          </div>
        </div>

        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          {t("common.noData")}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <div className="max-w-sm">
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
      </div>
    </div>
  );
}
