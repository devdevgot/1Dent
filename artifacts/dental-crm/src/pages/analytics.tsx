import { useTranslation } from "react-i18next";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Zap, AlertCircle, CheckCircle } from "lucide-react";
import { useGetAnalytics } from "@workspace/api-client-react";
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

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { data: analyticsRes } = useGetAnalytics();
  const analytics = analyticsRes?.data?.analytics as any;

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
      <div className="shrink-0 px-6 py-4 border-b border-border/50 bg-white">
        <h1 className="text-2xl font-bold text-foreground">{t("analytics.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
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
        </div>
      </div>
    </div>
  );
}
