import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  ArrowLeft, Users, TrendingUp, DollarSign, Activity,
  CalendarDays, UserCheck, Gauge,
} from "lucide-react";
import {
  useGetDoctorKpis,
  useGetDoctorDetailedAnalytics,
  usePatchUserCapacity,
  type DoctorKpi,
  type DoctorDetailedAnalytics,
  type DoctorDetailedAnalyticsRevenueByMonthItem,
  type DoctorDetailedAnalyticsProceduresByNameItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDoctorKpisQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

const STATUS_LABEL_KEYS: Record<string, string> = {
  new_request: "status.new_request",
  initial_consultation: "status.initial_consultation",
  diagnostics: "status.diagnostics",
  treatment_assigned: "status.treatment_assigned",
  treatment_in_progress: "status.treatment_in_progress",
  post_op_monitoring: "status.post_op_monitoring",
  completed: "status.completed",
};

export default function StaffDetailPage() {
  const { t } = useTranslation();
  const { doctorId } = useParams<{ doctorId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: kpiData, isLoading: kpiLoading } = useGetDoctorKpis();
  const { data: analyticsData, isLoading: analyticsLoading } = useGetDoctorDetailedAnalytics(doctorId ?? "");
  const { mutateAsync: patchCapacity, isPending: savingCapacity } = usePatchUserCapacity();

  const doctors: DoctorKpi[] = kpiData?.data?.kpis ?? [];
  const doctor = doctors.find((d) => d.doctorId === doctorId);
  const analytics: DoctorDetailedAnalytics | undefined = analyticsData?.data?.analytics;

  const [capacityInput, setCapacityInput] = useState<number | "">(20);
  const canEditCapacity = user?.role === "owner" || user?.role === "admin";

  // Sync capacity input when doctor data loads
  useEffect(() => {
    if (doctor) {
      setCapacityInput(doctor.maxSlotsPerDay ?? 20);
    }
  }, [doctor?.maxSlotsPerDay, doctor?.doctorId]);

  const handleSaveCapacity = async () => {
    if (!doctorId || capacityInput === "") return;
    await patchCapacity({ id: doctorId, data: { maxPatientsPerDay: Number(capacityInput) } });
    await queryClient.invalidateQueries({ queryKey: getGetDoctorKpisQueryKey() });
  };

  const getInitials = (name: string) =>
    name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (kpiLoading) {
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

  const rev = Number(doctor.revenueTotal) || 0;
  const proc = Number(doctor.proceduresCount) || 0;
  const pat = Number(doctor.patientsCount) || 0;
  const avgChk = Number(doctor.averageCheck) || 0;
  const nps = Number(doctor.nps) || 0;

  const revenueByMonth: DoctorDetailedAnalyticsRevenueByMonthItem[] = analytics?.revenueByMonth ?? [];
  const proceduresByName: DoctorDetailedAnalyticsProceduresByNameItem[] = analytics?.proceduresByName ?? [];
  const patientsByStatus = analytics?.patientsByStatus ?? {};
  const totalProcedures = Number(analytics?.totalProcedures ?? proc);

  const patientStatusData = Object.entries(patientsByStatus)
    .map(([key, value]) => ({
      name: t(STATUS_LABEL_KEYS[key] ?? key),
      value: Number(value),
    }))
    .filter((e) => e.value > 0);

  const kpiCards = [
    {
      label: t("staff.patientsScheduled"),
      value: pat,
      sub: `${pat} ${t("staff.patients")}`,
      subColor: "text-emerald-600",
      icon: CalendarDays,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      label: t("staff.revenue"),
      value: `₸${rev >= 1_000_000 ? (rev / 1_000_000).toFixed(1) + "M" : Math.floor(rev / 1000) + "K"}`,
      sub: rev > 0 ? `₸${Math.floor(rev / (pat || 1)).toLocaleString()} ${t("staff.perPatient")}` : "₸0",
      subColor: "text-emerald-600",
      icon: DollarSign,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
    {
      label: t("staff.avgCheck"),
      value: avgChk > 0 ? `₸${Math.floor(avgChk).toLocaleString()}` : "₸0",
      sub: `${proc} ${t("staff.procedures")}`,
      subColor: "text-emerald-600",
      icon: TrendingUp,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: t("staff.procedures"),
      value: totalProcedures,
      sub: t("staff.completed"),
      subColor: "text-muted-foreground",
      icon: Activity,
      iconBg: "bg-pink-100",
      iconColor: "text-pink-600",
    },
    {
      label: t("staff.nps"),
      value: nps,
      sub: nps >= 70 ? "Отлично" : nps >= 50 ? "Хорошо" : "Улучшить",
      subColor: nps >= 70 ? "text-emerald-600" : nps >= 50 ? "text-amber-600" : "text-red-600",
      icon: UserCheck,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
    },
    {
      label: t("staff.patients"),
      value: pat,
      sub: `${patientStatusData.length} ${t("staff.completed")}`,
      subColor: "text-muted-foreground",
      icon: Users,
      iconBg: "bg-sky-100",
      iconColor: "text-sky-600",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f7f8fc]">
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/staff")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
            {getInitials(doctor.doctorName)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{doctor.doctorName}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("staff.doctor")}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">

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

          {/* ─── Score + Capacity block ─── */}
          <div className="bg-white rounded-xl border border-border/50 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-[#98cc1c]/10 flex items-center justify-center shrink-0">
                <Gauge className="h-4 w-4 text-[#98cc1c]" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Рейтинг и ёмкость</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Рейтинг врача</span>
                  <span className="text-sm font-bold text-foreground">{doctor.score ?? 0}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{ width: `${doctor.score ?? 0}%`, backgroundColor: "#98cc1c" }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Выручка 35% · Процедуры 30% · Чек 20% · Конверсия 15%
                </p>
              </div>

              {/* Capacity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Слоты сегодня</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    (doctor.slotsUsedToday ?? 0) >= (doctor.maxSlotsPerDay ?? 20)
                      ? "bg-red-100 text-red-600"
                      : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {doctor.slotsUsedToday ?? 0} / {doctor.maxSlotsPerDay ?? 20}
                  </span>
                </div>
                {canEditCapacity ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={capacityInput}
                      onChange={(e) => setCapacityInput(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-20 border border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-xs text-muted-foreground">пациентов/день</span>
                    <button
                      onClick={handleSaveCapacity}
                      disabled={savingCapacity || capacityInput === ""}
                      className="ml-auto px-3 py-1.5 rounded-lg bg-[#98cc1c] text-white text-xs font-semibold disabled:opacity-50 hover:bg-[#7eb015] transition-colors"
                    >
                      {savingCapacity ? "..." : "Сохранить"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-foreground mt-1">
                    Лимит: {doctor.maxSlotsPerDay ?? 20} пациентов/день
                  </p>
                )}
              </div>
            </div>
          </div>

          {analyticsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.revenueTrend")}</h3>
                  {revenueByMonth.length === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">{t("common.noData")}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={revenueByMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v: number) => `₸${Math.floor(v / 1000)}K`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [`₸${v.toLocaleString()}`, t("staff.revenue")]} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name={t("staff.revenue")}
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ fill: "#3b82f6", r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.procedureCount")}</h3>
                  {proceduresByName.length === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">{t("common.noData")}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={proceduresByName} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-6">{t("staff.patientStatus")}</h3>
                {patientStatusData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">{t("common.noData")}</div>
                ) : (
                  <div className="flex flex-col lg:flex-row items-center gap-6">
                    <ResponsiveContainer width="100%" height={240}>
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
                            padding: "8px 12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full lg:w-64 grid grid-cols-2 gap-2">
                      {patientStatusData.map((item, index) => (
                        <div key={item.name} className="text-center p-3 bg-gray-50 rounded-lg border border-border/20">
                          <div className="w-4 h-4 rounded-full mx-auto mb-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <p className="text-xs text-muted-foreground leading-tight">{item.name}</p>
                          <p className="text-lg font-bold text-foreground mt-1">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-4">{t("staff.proceduresByStatus")}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(
                    [
                      { key: "completed",   label: t("procedure.status.completed"),   bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
                      { key: "in_progress", label: t("procedure.status.in_progress"), bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700" },
                      { key: "scheduled",   label: t("procedure.status.scheduled"),   bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700" },
                      { key: "cancelled",   label: t("procedure.status.cancelled"),   bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700" },
                    ] as const
                  ).map(({ key, label, bg, border, text }) => (
                    <div key={key} className={`rounded-xl border ${border} ${bg} p-4 text-center`}>
                      <p className={`text-2xl font-bold ${text}`}>
                        {Number(analytics?.proceduresByStatus?.[key] ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{label}</p>
                    </div>
                  ))}
                </div>

                {nps > 0 && (
                  <div className="mt-6 pt-5 border-t border-border/30">
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
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
