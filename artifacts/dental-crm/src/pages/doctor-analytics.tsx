import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899"];

export default function DoctorAnalyticsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<"week" | "month" | "quarter" | "year">("month");
  
  // Mock data - will be replaced with API calls
  const stats = {
    patientsScheduled: 28,
    patientsRemaining: 5,
    revenue: 450000,
    averageCheck: 16071,
    salary: 85000,
  };

  const dailyData = [
    { date: "Пн", patients: 4, revenue: 65000 },
    { date: "Вт", patients: 6, revenue: 98000 },
    { date: "Ср", patients: 5, revenue: 82000 },
    { date: "Чт", patients: 7, revenue: 112000 },
    { date: "Пт", patients: 4, revenue: 68000 },
    { date: "Сб", patients: 2, revenue: 25000 },
  ];

  const patientStatusData = [
    { name: "В процессе", value: 5 },
    { name: "Завершено", value: 20 },
    { name: "Отменено", value: 3 },
  ];

  const procedureData = [
    { name: "Лечение", count: 11 },
    { name: "Профилактика", count: 8 },
    { name: "Протезирование", count: 5 },
    { name: "Удаление", count: 4 },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("doctorAnalytics.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("doctorAnalytics.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            {(["week", "month", "quarter", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-foreground hover:bg-gray-200"
                }`}
              >
                {t(`doctorAnalytics.${range}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("doctorAnalytics.patientsScheduled")}</p>
              <p className="text-3xl font-bold text-foreground">{stats.patientsScheduled}</p>
              <p className="text-xs text-emerald-600 mt-2">+3 vs {t(`doctorAnalytics.${dateRange}`)}</p>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("doctorAnalytics.patientsRemaining")}</p>
              <p className="text-3xl font-bold text-foreground">{stats.patientsRemaining}</p>
              <p className="text-xs text-amber-600 mt-2">{Math.round((stats.patientsRemaining / stats.patientsScheduled) * 100)}% {t("doctorAnalytics.ofTotal")}</p>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("doctorAnalytics.revenue")}</p>
              <p className="text-3xl font-bold text-foreground">₸{(stats.revenue / 1000).toFixed(0)}K</p>
              <p className="text-xs text-emerald-600 mt-2">+12% vs {t(`doctorAnalytics.${dateRange}`)}</p>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("doctorAnalytics.averageCheck")}</p>
              <p className="text-3xl font-bold text-foreground">₸{stats.averageCheck.toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-2">+5% vs {t(`doctorAnalytics.${dateRange}`)}</p>
            </div>

            <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-2">{t("doctorAnalytics.salary")}</p>
              <p className="text-3xl font-bold text-foreground">₸{(stats.salary / 1000).toFixed(0)}K</p>
              <p className="text-xs text-blue-600 mt-2">{t("doctorAnalytics.thisMonth")}</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Revenue & Patients */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.dailyActivity")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="patients" fill="#3b82f6" name={t("doctorAnalytics.patients")} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue Trend */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.revenueTrend")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Patient Status */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.patientStatus")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={patientStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
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

            {/* Procedures Distribution */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.procedureTypes")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={procedureData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">{t("doctorAnalytics.summary")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("doctorAnalytics.avgConsultationTime")}</p>
                <p className="text-xl font-bold text-foreground">45 мин</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("doctorAnalytics.patientSatisfaction")}</p>
                <p className="text-xl font-bold text-foreground">4.8/5.0</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("doctorAnalytics.completedProcedures")}</p>
                <p className="text-xl font-bold text-foreground">28</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("doctorAnalytics.noShowRate")}</p>
                <p className="text-xl font-bold text-red-600">4.5%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
