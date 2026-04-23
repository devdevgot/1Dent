import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Zap, AlertCircle, CheckCircle, Radio, BarChart3, ChevronLeft, Repeat2, Heart, ClipboardCheck, Crown } from "lucide-react";
import { useGetAnalytics, useGetChannelStats, getGetChannelStatsQueryKey, useGetPatientMetrics, type ChannelStat } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#6366f1"];

const PATIENT_STATUS_LABELS: Record<string, string> = {
  new_request: "Новый запрос",
  initial_consultation: "Первичный осмотр",
  diagnostics: "Диагностика",
  treatment_assigned: "Назначено лечение",
  treatment_in_progress: "Лечение в процессе",
  post_op_monitoring: "Пост-оп наблюдение",
  completed: "Завершено",
};

type Period = "week" | "month" | "quarter";

function getPeriodDates(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = now.toISOString().split("T")[0]!;
  const from = new Date(now);
  if (period === "week") from.setDate(from.getDate() - 7);
  else if (period === "month") from.setMonth(from.getMonth() - 1);
  else from.setMonth(from.getMonth() - 3);
  return { dateFrom: from.toISOString().split("T")[0]!, dateTo };
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { data: analyticsRes } = useGetAnalytics();
  const analytics = analyticsRes?.data?.analytics as any;

  const [channelPeriod, setChannelPeriod] = useState<Period>("month");
  const periodDates = getPeriodDates(channelPeriod);

  const [retentionPeriod, setRetentionPeriod] = useState<Period>("month");
  const retentionDates = getPeriodDates(retentionPeriod);

  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";

  const { data: channelStatsRes } = useGetChannelStats(
    { dateFrom: periodDates.dateFrom, dateTo: periodDates.dateTo },
    {
      query: {
        queryKey: getGetChannelStatsQueryKey({ dateFrom: periodDates.dateFrom, dateTo: periodDates.dateTo }),
        enabled: isOwnerOrAdmin,
      },
    }
  );
  const channelStats: ChannelStat[] = channelStatsRes?.data?.stats ?? [];

  const pmEnabled = isOwnerOrAdmin || user?.role === "doctor" || user?.role === "accountant";
  const { data: patientMetricsRes, isLoading: pmLoading, isFetching: pmFetching } = useGetPatientMetrics(
    { dateFrom: retentionDates.dateFrom, dateTo: retentionDates.dateTo },
    { query: { enabled: pmEnabled } },
  );
  const pm = patientMetricsRes?.data;

  const statusData = analytics && "patientsByStatus" in analytics && analytics.patientsByStatus
    ? Object.entries(analytics.patientsByStatus).map(([status, count]: [string, unknown]) => ({
        name: PATIENT_STATUS_LABELS[status] || status,
        value: count,
      }))
    : [];

  const doctorKpis = (analytics && "doctorKpis" in analytics) ? (analytics.doctorKpis as any[]) : [];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-4 border-b border-gray-100 bg-white flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">{t("analytics.title")}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{t("analytics.subtitle")}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          {/* KPI Cards Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Patients */}
            {(analytics && "totalPatients" in analytics) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("analytics.totalPatients")}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{String((analytics as any).totalPatients)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>
            )}

            {/* New Patients */}
            {(analytics && (("newPatientsThisMonth" in analytics && (analytics as any).newPatientsThisMonth !== undefined) || ("newPatientsToday" in analytics && (analytics as any).newPatientsToday !== undefined))) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {user?.role === "doctor" ? t("analytics.myPatients") : t("analytics.newPatients")}
                    </p>
                    <p className="text-3xl font-bold text-foreground mt-2">
                      {String((analytics as any).newPatientsThisMonth ?? (analytics as any).newPatientsToday ?? 0)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Revenue */}
            {(analytics && (("revenueThisMonth" in analytics && (analytics as any).revenueThisMonth !== undefined) || ("myRevenueThisMonth" in analytics && (analytics as any).myRevenueThisMonth !== undefined))) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {user?.role === "doctor" ? t("analytics.myRevenue") : t("analytics.revenue")}
                    </p>
                    <p className="text-3xl font-bold text-foreground mt-2">
                      ₸{(((analytics as any).revenueThisMonth ?? (analytics as any).myRevenueThisMonth) ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Completed Procedures / Alerts */}
            {(analytics && "completedProceduresThisMonth" in analytics) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("analytics.completedProcedures")}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{String((analytics as any).completedProceduresThisMonth)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-violet-600" />
                  </div>
                </div>
              </div>
            )}

            {(analytics && "redAlertCount" in analytics) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("analytics.redAlerts")}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{String((analytics as any).redAlertCount)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </div>
            )}

            {(analytics && "myProceduresThisMonth" in analytics) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("analytics.myProcedures")}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{String((analytics as any).myProceduresThisMonth)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-cyan-600" />
                  </div>
                </div>
              </div>
            )}

            {(analytics && "scheduledToday" in analytics) && (
              <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("analytics.scheduledToday")}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{String((analytics as any).scheduledToday)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Charts Row */}
          {statusData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Patient Status Distribution - Pie Chart */}
              <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t("analytics.patientsByStatus")}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {statusData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                      <span className="text-xs font-semibold text-foreground ml-auto">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Patient Status Distribution - Bar Chart */}
              <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t("analytics.distribution")}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Doctor KPIs Table */}
          {doctorKpis.length > 0 && (
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("analytics.doctorKpis")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.doctorName")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.patients")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.procedures")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.revenue")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.avgCheck")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-4">{t("analytics.nps")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorKpis.map((doctor) => (
                      <tr key={doctor.doctorId} className="border-b border-border/30 hover:bg-muted/50 transition-colors">
                        <td className="text-sm text-foreground py-3 px-4 font-medium">{doctor.doctorName}</td>
                        <td className="text-sm text-foreground py-3 px-4 text-right">{doctor.patientsCount}</td>
                        <td className="text-sm text-foreground py-3 px-4 text-right">{doctor.proceduresCount}</td>
                        <td className="text-sm text-foreground py-3 px-4 text-right">₸{doctor.revenueTotal.toLocaleString()}</td>
                        <td className="text-sm text-foreground py-3 px-4 text-right">₸{Math.round(doctor.averageCheck).toLocaleString()}</td>
                        <td className="text-sm text-foreground py-3 px-4 text-right font-medium">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            doctor.nps >= 70 ? "bg-emerald-100 text-emerald-700" :
                            doctor.nps >= 50 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {doctor.nps}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Patient Retention, LTV, Treatment Plan Conversion */}
          {pmEnabled && (
            <div className="space-y-4">
              {/* Section header with period dropdown */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{t("analytics.retentionSection")}</h3>
                </div>
                <select
                  value={retentionPeriod}
                  onChange={(e) => setRetentionPeriod(e.target.value as Period)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-700"
                >
                  <option value="week">{t("channel.week")}</option>
                  <option value="month">{t("channel.month")}</option>
                  <option value="quarter">{t("channel.quarter")}</option>
                </select>
              </div>

              {/* 3 KPI cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Retention rate */}
                <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{t("analytics.retentionRate")}</p>
                      {pmLoading || pmFetching ? (
                        <div className="h-9 w-20 bg-muted animate-pulse rounded mt-2" />
                      ) : (
                        <p className="text-3xl font-bold text-foreground mt-2">{pm?.retentionRate ?? 0}%</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{t("analytics.retentionRateDesc")}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 ml-3">
                      <Repeat2 className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </div>

                {/* Average LTV */}
                <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{t("analytics.avgLtv")}</p>
                      {pmLoading || pmFetching ? (
                        <div className="h-9 w-28 bg-muted animate-pulse rounded mt-2" />
                      ) : (
                        <p className="text-3xl font-bold text-foreground mt-2">₸{(pm?.avgLtv ?? 0).toLocaleString()}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{t("analytics.avgLtvDesc")}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 ml-3">
                      <TrendingUp className="h-5 w-5 text-violet-600" />
                    </div>
                  </div>
                </div>

                {/* Treatment Plan Conversion */}
                <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{t("analytics.treatmentConversion")}</p>
                      {pmLoading || pmFetching ? (
                        <div className="h-9 w-20 bg-muted animate-pulse rounded mt-2" />
                      ) : (
                        <p className="text-3xl font-bold text-foreground mt-2">{pm?.treatmentPlanConversion ?? 0}%</p>
                      )}
                      {!pmLoading && !pmFetching && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {pm?.treatmentPlanAccepted ?? 0} / {pm?.treatmentPlanTotal ?? 0} {t("analytics.treatmentConversionDesc")}
                        </p>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 ml-3">
                      <ClipboardCheck className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cohort retention table */}
              {pmLoading ? (
                <div className="bg-white rounded-xl border border-border/50 p-5 shadow-sm">
                  <div className="h-4 w-48 bg-muted animate-pulse rounded mb-4" />
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-4 mb-3">
                      <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-10 bg-muted animate-pulse rounded ml-auto" />
                      <div className="h-3 w-12 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-12 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-14 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : pm && pm.retentionCohorts.some((c) => c.newPatients > 0) ? (
                <div className="bg-white rounded-xl border border-border/50 p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-foreground mb-3">{t("analytics.cohortTitle")}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left font-semibold text-muted-foreground py-2 px-3">{t("analytics.cohortMonth")}</th>
                          <th className="text-right font-semibold text-muted-foreground py-2 px-3">{t("analytics.cohortNewPatients")}</th>
                          <th className="text-right font-semibold text-muted-foreground py-2 px-3">{t("analytics.cohortReturn3m")}</th>
                          <th className="text-right font-semibold text-muted-foreground py-2 px-3">{t("analytics.cohortReturn6m")}</th>
                          <th className="text-right font-semibold text-muted-foreground py-2 px-3">{t("analytics.cohortReturn12m")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pm.retentionCohorts.map((cohort) => (
                          <tr key={cohort.month} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-medium text-foreground">{cohort.month}</td>
                            <td className="py-2 px-3 text-right text-foreground">{cohort.newPatients}</td>
                            <td className="py-2 px-3 text-right">
                              {cohort.newPatients > 0 ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${
                                  cohort.returnedIn3m / cohort.newPatients >= 0.5 ? "bg-emerald-100 text-emerald-700" :
                                  cohort.returnedIn3m > 0 ? "bg-amber-100 text-amber-700" : "text-muted-foreground"
                                }`}>
                                  {cohort.returnedIn3m > 0
                                    ? `${cohort.returnedIn3m} (${Math.round((cohort.returnedIn3m / cohort.newPatients) * 100)}%)`
                                    : "—"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {cohort.newPatients > 0 ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${
                                  cohort.returnedIn6m / cohort.newPatients >= 0.5 ? "bg-emerald-100 text-emerald-700" :
                                  cohort.returnedIn6m > 0 ? "bg-amber-100 text-amber-700" : "text-muted-foreground"
                                }`}>
                                  {cohort.returnedIn6m > 0
                                    ? `${cohort.returnedIn6m} (${Math.round((cohort.returnedIn6m / cohort.newPatients) * 100)}%)`
                                    : "—"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {cohort.newPatients > 0 ? (
                                <span className={`px-1.5 py-0.5 rounded font-medium ${
                                  cohort.returnedIn12m / cohort.newPatients >= 0.5 ? "bg-emerald-100 text-emerald-700" :
                                  cohort.returnedIn12m > 0 ? "bg-amber-100 text-amber-700" : "text-muted-foreground"
                                }`}>
                                  {cohort.returnedIn12m > 0
                                    ? `${cohort.returnedIn12m} (${Math.round((cohort.returnedIn12m / cohort.newPatients) * 100)}%)`
                                    : "—"}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Top patients by LTV — owner/admin only */}
              {isOwnerOrAdmin && (
                <div className="bg-white rounded-xl border border-border/50 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <h4 className="text-sm font-semibold text-foreground">{t("analytics.topByLtv")}</h4>
                  </div>
                  {pmLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-muted animate-pulse shrink-0" />
                          <div className="h-3 flex-1 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                        </div>
                      ))}
                    </div>
                  ) : pm && pm.topPatientsByLtv.length > 0 ? (
                    <div className="space-y-2">
                      {pm.topPatientsByLtv.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            idx === 0 ? "bg-amber-100 text-amber-700" :
                            idx === 1 ? "bg-slate-100 text-slate-600" :
                            idx === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                          }`}>{idx + 1}</span>
                          <span className="text-sm text-foreground font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.procedureCount} {t("analytics.procedures")}</span>
                          <span className="text-sm font-semibold text-foreground">₸{p.totalSpent.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("analytics.noData", "—")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Channel Analytics — owner/admin only */}
          {isOwnerOrAdmin && (
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{t("channelAnalytics.title")}</h3>
                </div>
                <div className="flex items-center gap-1">
                  {(["week", "month", "quarter"] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setChannelPeriod(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        channelPeriod === p
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t(`channelAnalytics.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              {channelStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("channelAnalytics.noData")}</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie chart */}
                  <div>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={channelStats.map((s) => ({ name: s.channelName, value: s.patientCount }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {channelStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1">
                      {channelStats.map((s, i) => (
                        <div key={s.channelId} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-muted-foreground truncate">{s.channelName}</span>
                          <span className="text-xs font-semibold text-foreground ml-auto">{s.patientCount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left text-xs font-semibold text-muted-foreground py-2 px-3">{t("channelAnalytics.channel")}</th>
                          <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Клики</th>
                          <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">{t("channelAnalytics.patients")}</th>
                          <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">{t("channelAnalytics.conversion")}</th>
                          <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">{t("channelAnalytics.revenue")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelStats.map((s) => {
                          const clickToLead = s.clickCount > 0
                            ? Math.round((s.patientCount / s.clickCount) * 100)
                            : null;
                          return (
                            <tr key={s.channelId} className="border-b border-border/30 hover:bg-muted/50 transition-colors">
                              <td className="text-xs text-foreground py-2 px-3 font-medium">{s.channelName}</td>
                              <td className="text-xs text-foreground py-2 px-3 text-right">
                                <span className="font-mono">{s.clickCount}</span>
                                {clickToLead !== null && (
                                  <span className="ml-1 text-muted-foreground">({clickToLead}%→)</span>
                                )}
                              </td>
                              <td className="text-xs text-foreground py-2 px-3 text-right">{s.patientCount}</td>
                              <td className="text-xs py-2 px-3 text-right">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  s.conversionRate >= 50 ? "bg-emerald-100 text-emerald-700" :
                                  s.conversionRate >= 25 ? "bg-amber-100 text-amber-700" :
                                  "bg-red-100 text-red-700"
                                }`}>
                                  {s.conversionRate}%
                                </span>
                              </td>
                              <td className="text-xs text-foreground py-2 px-3 text-right">₸{s.totalRevenue.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
