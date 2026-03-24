import { useParams, useLocation } from "wouter";
import { ArrowLeft, Users, TrendingUp, DollarSign, Activity } from "lucide-react";
import { useGetDoctorKpis, useGetDoctorAnalytics } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

export default function StaffDetailPage() {
  const { t } = useTranslation();
  const { doctorId } = useParams<{ doctorId: string }>();
  const [, setLocation] = useLocation();
  const { data: kpiData } = useGetDoctorKpis();
  const { data: analyticsData } = useGetDoctorAnalytics();

  const doctors = kpiData?.data?.kpis ?? [];
  const doctor = doctors.find((d: any) => d.doctorId === doctorId);
  const analytics = analyticsData?.data?.analytics as any;

  if (!doctor) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("staff.notFound")}</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  // Mock data for patient distribution
  const patientStatusData = [
    { name: "В процессе", value: 5 },
    { name: "Завершено", value: 12 },
    { name: "Новые", value: 3 },
  ];

  // Mock monthly revenue chart
  const revenueData = [
    { month: "Янв", revenue: Math.floor(doctor.revenueTotal * 0.6) },
    { month: "Фев", revenue: Math.floor(doctor.revenueTotal * 0.7) },
    { month: "Мар", revenue: Math.floor(doctor.revenueTotal * 0.8) },
    { month: "Апр", revenue: Math.floor(doctor.revenueTotal * 0.9) },
    { month: "Май", revenue: Math.floor(doctor.revenueTotal * 0.95) },
    { month: "Июн", revenue: doctor.revenueTotal },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/staff")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {getInitials(doctor.doctorName)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{doctor.doctorName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("staff.doctor")}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("staff.patients")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{doctor.patientsCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("staff.procedures")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{doctor.proceduresCount}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("staff.revenue")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">₸{(doctor.revenueTotal / 1000).toFixed(0)}K</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("staff.avgCheck")}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">₸{Math.round(doctor.averageCheck).toLocaleString()}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.revenueTrend")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Patient Status Distribution */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.patientStatus")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={patientStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {patientStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {patientStatusData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-xs text-muted-foreground flex-1">{item.name}</span>
                    <span className="text-xs font-semibold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Procedures by Type */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.procedureCount")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[
                    { name: "Лечение", count: Math.floor(doctor.proceduresCount * 0.4) },
                    { name: "Профилактика", count: Math.floor(doctor.proceduresCount * 0.3) },
                    { name: "Протезирование", count: Math.floor(doctor.proceduresCount * 0.2) },
                    { name: "Прочее", count: Math.floor(doctor.proceduresCount * 0.1) },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Performance Metrics */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.performance")}</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("staff.nps")}</span>
                    <span className="text-sm font-bold text-foreground">{doctor.nps}/100</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        doctor.nps >= 70 ? "bg-emerald-500" :
                        doctor.nps >= 50 ? "bg-amber-500" :
                        "bg-red-500"
                      }`}
                      style={{ width: `${doctor.nps}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("staff.efficiency")}</span>
                    <span className="text-sm font-bold text-foreground">85%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: "85%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("staff.satisfaction")}</span>
                    <span className="text-sm font-bold text-foreground">92%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: "92%" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
