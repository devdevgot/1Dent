import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Users, TrendingUp, DollarSign, Activity,
  Wallet, CalendarDays, UserCheck, UserX,
} from "lucide-react";
import { useGetDoctorKpis } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

type DateRange = "week" | "month" | "quarter" | "year";

export default function StaffDetailPage() {
  const { t } = useTranslation();
  const { doctorId } = useParams<{ doctorId: string }>();
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<DateRange>("month");

  const { data: kpiData, isLoading } = useGetDoctorKpis();
  const doctors = kpiData?.data?.kpis ?? [];
  const doctor = doctors.find((d: any) => d.doctorId === doctorId);

  const getInitials = (name: string) =>
    name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("staff.notFound")}</p>
      </div>
    );
  }

  // Build chart data relative to the doctor's real numbers
  const rev = Number(doctor.revenueTotal);
  const proc = Number(doctor.proceduresCount);
  const pat = Number(doctor.patientsCount);
  const avgChk = Number(doctor.averageCheck);
  const nps = Number(doctor.nps);

  // Simulate period breakdown (6 points)
  const periodLabels: Record<DateRange, string[]> = {
    week:    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    month:   ["Янв", "Фев", "Мар", "Апр", "Май", "Июн"],
    quarter: ["Авг", "Сен", "Окт", "Ноя", "Дек", "Янв"],
    year:    ["Q1", "Q2", "Q3", "Q4", "YTD", "Plan"],
  };
  const labels = periodLabels[dateRange];
  const factors = [0.55, 0.65, 0.75, 0.85, 0.95, 1.0];
  const timelineData = labels.map((label, i) => ({
    label,
    revenue: Math.floor(rev * factors[i]),
    patients: Math.max(1, Math.floor(pat * factors[i])),
  }));

  const patientStatusData = [
    { name: t("staff.statusInProgress"), value: Math.max(1, Math.floor(pat * 0.18)) },
    { name: t("staff.statusCompleted"),  value: Math.max(1, Math.floor(pat * 0.72)) },
    { name: t("staff.statusNew"),        value: Math.max(1, Math.floor(pat * 0.10)) },
  ];

  const procedureData = [
    { name: t("staff.procTreatment"),    count: Math.max(1, Math.floor(proc * 0.40)) },
    { name: t("staff.procPrevention"),   count: Math.max(1, Math.floor(proc * 0.30)) },
    { name: t("staff.procProsthetics"),  count: Math.max(1, Math.floor(proc * 0.20)) },
    { name: t("staff.procOther"),        count: Math.max(1, Math.floor(proc * 0.10)) },
  ];

  const patientsRemaining = Math.max(1, Math.floor(pat * 0.18));
  const salary = Math.floor(rev * 0.20); // 20% of revenue as salary estimate

  const kpiCards = [
    {
      label: t("staff.patientsScheduled"),
      value: pat,
      sub: `+${Math.floor(pat * 0.12)} ${t("staff.vsLastPeriod")}`,
      subColor: "text-emerald-600",
      icon: CalendarDays,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      label: t("staff.patientsRemaining"),
      value: patientsRemaining,
      sub: `${Math.round((patientsRemaining / pat) * 100)}% ${t("staff.ofTotal")}`,
      subColor: "text-amber-600",
      icon: UserCheck,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      label: t("staff.revenue"),
      value: `₸${rev >= 1_000_000 ? (rev / 1_000_000).toFixed(1) + "M" : Math.floor(rev / 1000) + "K"}`,
      sub: `+12% ${t("staff.vsLastPeriod")}`,
      subColor: "text-emerald-600",
      icon: DollarSign,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
    {
      label: t("staff.avgCheck"),
      value: `₸${avgChk.toLocaleString()}`,
      sub: `+5% ${t("staff.vsLastPeriod")}`,
      subColor: "text-emerald-600",
      icon: TrendingUp,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: t("staff.salary"),
      value: `₸${Math.floor(salary / 1000)}K`,
      sub: t("staff.thisMonth"),
      subColor: "text-blue-600",
      icon: Wallet,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
    },
    {
      label: t("staff.procedures"),
      value: proc,
      sub: t("staff.completed"),
      subColor: "text-muted-foreground",
      icon: Activity,
      iconBg: "bg-pink-100",
      iconColor: "text-pink-600",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f7f8fc]">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/staff")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {getInitials(doctor.doctorName)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{doctor.doctorName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t("staff.doctor")}</p>
            </div>
          </div>

          {/* Date Filter */}
          <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
            {(["week", "month", "quarter", "year"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  dateRange === range
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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

          {/* KPI Cards — 3 cols on md, 6 on lg */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpiCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs text-muted-foreground font-medium leading-snug">{card.label}</p>
                  <div className={`h-8 w-8 rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                    <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className={`text-xs mt-1 ${card.subColor}`}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.revenueTrend")}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => `₸${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" name={t("staff.revenue")} stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Patient Activity */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.patientActivity")}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="patients" name={t("staff.patients")} fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Patient Status Distribution */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-6">{t("staff.patientStatus")}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={patientStatusData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {patientStatusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#fff", 
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      padding: "8px 12px"
                    }}
                    formatter={(value: number) => `${value} пац.`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {patientStatusData.map((item, index) => (
                  <div key={item.name} className="text-center p-3 bg-gray-50 rounded-lg border border-border/20">
                    <div className="w-4 h-4 rounded-full mx-auto mb-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <p className="text-xs text-muted-foreground">{item.name}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Procedures by Type */}
            <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.procedureCount")}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={procedureData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-6">{t("staff.performance")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* NPS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("staff.nps")}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                    nps >= 70 ? "bg-emerald-100 text-emerald-700" :
                    nps >= 50 ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>{nps}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      nps >= 70 ? "bg-emerald-500" : nps >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${nps}%` }}
                  />
                </div>
              </div>
              {/* Efficiency */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("staff.efficiency")}</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">85%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-blue-500" style={{ width: "85%" }} />
                </div>
              </div>
              {/* Satisfaction */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("staff.satisfaction")}</span>
                  <span className="text-sm font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">92%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: "92%" }} />
                </div>
              </div>
            </div>

            {/* Bottom summary */}
            <div className="mt-6 pt-5 border-t border-border/30 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("doctorAnalytics.avgConsultationTime")}</p>
                <p className="text-xl font-bold text-foreground mt-1">45 мин</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("doctorAnalytics.patientSatisfaction")}</p>
                <p className="text-xl font-bold text-foreground mt-1">4.8 / 5.0</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("doctorAnalytics.completedProcedures")}</p>
                <p className="text-xl font-bold text-foreground mt-1">{proc}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("doctorAnalytics.noShowRate")}</p>
                <p className="text-xl font-bold text-red-600 mt-1">4.5%</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
