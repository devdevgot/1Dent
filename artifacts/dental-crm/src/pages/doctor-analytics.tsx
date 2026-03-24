import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  useGetDoctorDetailedAnalyticsMe,
  type DoctorDetailedAnalytics,
  type DoctorDetailedAnalyticsRevenueByMonthItem,
  type DoctorDetailedAnalyticsProceduresByNameItem,
} from "@workspace/api-client-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

const STATUS_LABEL_KEYS: Record<string, string> = {
  new_request: "status.new_request",
  initial_consultation: "status.initial_consultation",
  diagnostics: "status.diagnostics",
  treatment_assigned: "status.treatment_assigned",
  treatment_in_progress: "status.treatment_in_progress",
  post_op_monitoring: "status.post_op_monitoring",
  completed: "status.completed",
};

export default function DoctorAnalyticsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useGetDoctorDetailedAnalyticsMe();
  const analytics: DoctorDetailedAnalytics | undefined = data?.data?.analytics;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalRevenue = Number(analytics?.totalRevenue ?? 0);
  const totalPatients = Number(analytics?.totalPatients ?? 0);
  const totalProcedures = Number(analytics?.totalProcedures ?? 0);
  const averageCheck = Number(analytics?.averageCheck ?? 0);
  const scheduledToday = Number(analytics?.scheduledToday ?? 0);

  const revenueByMonth: DoctorDetailedAnalyticsRevenueByMonthItem[] = analytics?.revenueByMonth ?? [];
  const proceduresByName: DoctorDetailedAnalyticsProceduresByNameItem[] = analytics?.proceduresByName ?? [];
  const patientsByStatus = analytics?.patientsByStatus ?? {};
  const rawProceduresByStatus = analytics?.proceduresByStatus ?? {};

  const patientStatusData = Object.entries(patientsByStatus)
    .map(([key, value]) => ({
      name: t(STATUS_LABEL_KEYS[key] ?? key),
      value: Number(value),
    }))
    .filter((e) => e.value > 0);

  const procedureStatusChartData = [
    { name: t("procedure.status.completed"),   count: Number(rawProceduresByStatus.completed   ?? 0) },
    { name: t("procedure.status.in_progress"), count: Number(rawProceduresByStatus.in_progress ?? 0) },
    { name: t("procedure.status.scheduled"),   count: Number(rawProceduresByStatus.scheduled   ?? 0) },
    { name: t("procedure.status.cancelled"),   count: Number(rawProceduresByStatus.cancelled   ?? 0) },
  ].filter((e) => e.count > 0);

  const kpiCards = [
    {
      label: t("doctorAnalytics.patientsScheduled"),
      value: scheduledToday,
      sub: t("doctorAnalytics.thisMonth"),
      subColor: "text-blue-600",
    },
    {
      label: t("doctorAnalytics.patientsRemaining"),
      value: totalPatients,
      sub: `${totalProcedures} ${t("doctorAnalytics.completedProcedures")}`,
      subColor: "text-emerald-600",
    },
    {
      label: t("doctorAnalytics.revenue"),
      value: totalRevenue >= 1_000_000
        ? `₸${(totalRevenue / 1_000_000).toFixed(1)}M`
        : `₸${Math.floor(totalRevenue / 1000)}K`,
      sub: `${totalProcedures} ${t("doctorAnalytics.completedProcedures")}`,
      subColor: "text-emerald-600",
    },
    {
      label: t("doctorAnalytics.averageCheck"),
      value: `₸${Math.floor(averageCheck).toLocaleString()}`,
      sub: t("doctorAnalytics.thisMonth"),
      subColor: "text-emerald-600",
    },
    {
      label: t("doctorAnalytics.completedProcedures"),
      value: totalProcedures,
      sub: t("doctorAnalytics.thisMonth"),
      subColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("doctorAnalytics.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("doctorAnalytics.subtitle")}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {kpiCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <p className="text-xs text-muted-foreground font-medium mb-2">{card.label}</p>
                <p className="text-3xl font-bold text-foreground">{card.value}</p>
                <p className={`text-xs mt-2 ${card.subColor}`}>{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.revenueTrend")}</h3>
              {revenueByMonth.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  {t("common.noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `₸${Math.floor(v / 1000)}K`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`₸${v.toLocaleString()}`, t("doctorAnalytics.revenue")]} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: "#10b981", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.procedureTypes")}</h3>
              {proceduresByName.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  {t("common.noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={proceduresByName}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} name={t("doctorAnalytics.patients")} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.patientStatus")}</h3>
              {patientStatusData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  {t("common.noData")}
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={patientStatusData}
                        cx="50%" cy="50%"
                        innerRadius={60} outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {patientStatusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1.5">
                    {patientStatusData.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{item.name}</span>
                        <span className="text-xs font-semibold text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.proceduresByStatus")}</h3>
              {procedureStatusChartData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  {t("common.noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={procedureStatusChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} name={t("doctorAnalytics.completedProcedures")} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
