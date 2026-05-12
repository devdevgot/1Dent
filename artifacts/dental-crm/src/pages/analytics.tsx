import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Users, DollarSign, Zap, AlertCircle, CheckCircle,
  Radio, ChevronLeft, Repeat2, Heart, ClipboardCheck, Crown,
  CalendarDays, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  useGetAnalytics, useGetChannelStats, getGetChannelStatsQueryKey,
  useGetPatientMetrics, type ChannelStat,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#6366f1"];

type Period = "today" | "week" | "month" | "year" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  today:  "Сегодня",
  week:   "Неделя",
  month:  "Месяц",
  year:   "Год",
  custom: "Период",
};

function getPeriodDates(period: Period, customFrom: string, customTo: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = now.toISOString().split("T")[0]!;
  const from = new Date(now);
  if (period === "today") {
    return { dateFrom: dateTo, dateTo };
  }
  if (period === "week")  from.setDate(from.getDate() - 7);
  else if (period === "month") from.setMonth(from.getMonth() - 1);
  else if (period === "year")  from.setFullYear(from.getFullYear() - 1);
  else if (period === "custom") {
    return { dateFrom: customFrom || dateTo, dateTo: customTo || dateTo };
  }
  return { dateFrom: from.toISOString().split("T")[0]!, dateTo };
}

type StatusLevel = "good" | "normal" | "warn";

function statusConfig(level: StatusLevel) {
  if (level === "good")   return { label: "Хорошо",          bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
  if (level === "warn")   return { label: "Требует внимания", bg: "bg-red-50",     border: "border-red-200",     badge: "bg-red-100 text-red-700",         dot: "bg-red-500"     };
  return                         { label: "Норма",            bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700",     dot: "bg-amber-500"   };
}

interface QACardProps {
  question: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: string;
  level?: StatusLevel;
  icon: React.ReactNode;
  loading?: boolean;
}

function QACard({ question, value, sub, hint, level, icon, loading }: QACardProps) {
  const cfg = level ? statusConfig(level) : null;
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-1.5 ${cfg ? `${cfg.border}` : "border-border/50"}`}>
      {/* Status badge row */}
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-xs font-semibold text-muted-foreground leading-tight">{question}</p>
        {cfg && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        )}
      </div>
      {/* Main value */}
      {loading ? (
        <div className="h-9 w-24 bg-slate-100 animate-pulse rounded-lg mt-1" />
      ) : (
        <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none mt-0.5">{value}</p>
      )}
      {/* Sub line */}
      {!loading && sub && (
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>
      )}
      {/* Hint */}
      {!loading && hint && (
        <p className={`text-xs mt-1 font-medium ${cfg?.level === "warn" ? "text-red-600" : cfg ? "text-amber-700" : "text-muted-foreground"}`}>{hint}</p>
      )}
      {/* Icon pill */}
      <div className="mt-auto pt-2 flex justify-end">
        <div className="w-8 h-8 rounded-xl bg-slate-50 border border-border/40 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      </div>
    </div>
  );
}

const PATIENT_STATUS_LABELS: Record<string, string> = {
  new_request:          "Новый запрос",
  initial_consultation: "Первичный осмотр",
  diagnostics:          "Диагностика",
  treatment_assigned:   "Назначено лечение",
  treatment_in_progress:"Лечение в процессе",
  post_op_monitoring:   "Пост-оп наблюдение",
  completed:            "Завершено",
};

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [channelOpen, setChannelOpen] = useState(true);

  const { data: analyticsRes, isLoading: analyticsLoading } = useGetAnalytics();
  const analytics = analyticsRes?.data?.analytics as any;

  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";
  const pmEnabled = isOwnerOrAdmin || user?.role === "doctor" || user?.role === "accountant";

  const periodDates = getPeriodDates(period, customFrom, customTo);

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

  const { data: patientMetricsRes, isLoading: pmLoading, isFetching: pmFetching } =
    useGetPatientMetrics(
      { dateFrom: periodDates.dateFrom, dateTo: periodDates.dateTo },
      { query: { enabled: pmEnabled } },
    );
  const pm = patientMetricsRes?.data;

  const statusData = analytics && "patientsByStatus" in analytics && analytics.patientsByStatus
    ? Object.entries(analytics.patientsByStatus).map(([status, count]: [string, unknown]) => ({
        name: PATIENT_STATUS_LABELS[status] || status,
        value: count as number,
      }))
    : [];

  const doctorKpis = (analytics && "doctorKpis" in analytics) ? (analytics.doctorKpis as any[]) : [];

  const retentionRate    = pm?.retentionRate ?? 0;
  const treatmentConv    = pm?.treatmentPlanConversion ?? 0;
  const avgLtv           = pm?.avgLtv ?? 0;
  const redAlerts        = analytics?.redAlertCount ?? 0;

  const retentionLevel: StatusLevel =
    retentionRate >= 60 ? "good" : retentionRate >= 30 ? "normal" : "warn";

  const conversionLevel: StatusLevel =
    treatmentConv >= 70 ? "good" : treatmentConv >= 40 ? "normal" : "warn";

  const retentionHint =
    retentionLevel === "good"   ? "Пациенты возвращаются — отличный результат"
    : retentionLevel === "normal" ? "Есть потенциал для роста повторных визитов"
    : "Стоит активнее работать с базой постоянных пациентов";

  const conversionHint =
    conversionLevel === "good"   ? "Большинство пациентов соглашаются на лечение"
    : conversionLevel === "normal" ? "Можно улучшить подачу планов лечения"
    : "Мало пациентов принимают план лечения — стоит пересмотреть подход";

  function handlePeriod(p: Period) {
    setPeriod(p);
    setShowCustom(p === "custom");
  }

  const revenue = (analytics?.revenueThisMonth ?? analytics?.myRevenueThisMonth ?? 0) as number;
  const newPats = (analytics?.newPatientsThisMonth ?? analytics?.newPatientsToday ?? 0) as number;
  const procedures = (analytics?.completedProceduresThisMonth ?? analytics?.myProceduresThisMonth ?? 0) as number;
  const scheduledToday = (analytics?.scheduledToday ?? 0) as number;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold text-gray-900">{t("analytics.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("analytics.subtitle")}</p>
        </div>
      </div>

      {/* ── Period filter bar ── */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriod(p)}
                className={`px-3 py-1.5 text-xs rounded-xl font-semibold transition-all ${
                  period === p
                    ? "bg-primary text-white shadow-sm"
                    : "bg-slate-100 text-gray-600 hover:bg-slate-200"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        {showCustom && (
          <div className="flex items-center gap-2 pl-5">
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs border border-border/60 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 w-36"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-border/60 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 w-36"
            />
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6 pb-10">

          {/* ── Section 1: Core KPI cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Revenue */}
            {analytics && ("revenueThisMonth" in analytics || "myRevenueThisMonth" in analytics) && (
              <QACard
                question="Сколько мы заработали?"
                value={`₸${revenue.toLocaleString("ru-KZ")}`}
                sub={`За выбранный период`}
                loading={analyticsLoading}
                icon={<DollarSign className="w-4 h-4" />}
              />
            )}

            {/* New patients */}
            {analytics && ("newPatientsThisMonth" in analytics || "newPatientsToday" in analytics) && (
              <QACard
                question="Сколько новых людей к нам обратились?"
                value={newPats}
                sub={newPats === 0 ? "Пока нет новых обращений" : `${newPats === 1 ? "1 новый пациент" : `${newPats} новых пациентов`}`}
                loading={analyticsLoading}
                icon={<Users className="w-4 h-4" />}
              />
            )}

            {/* Scheduled today */}
            {analytics && "scheduledToday" in analytics && (
              <QACard
                question="Сколько приёмов запланировано сегодня?"
                value={scheduledToday}
                sub={scheduledToday === 0 ? "Приёмов на сегодня нет" : `${scheduledToday} запись${scheduledToday === 1 ? "" : scheduledToday < 5 ? "и" : "ей"} на сегодня`}
                loading={analyticsLoading}
                icon={<CalendarDays className="w-4 h-4" />}
              />
            )}

            {/* Procedures */}
            {analytics && ("completedProceduresThisMonth" in analytics || "myProceduresThisMonth" in analytics) && (
              <QACard
                question="Насколько мы были заняты?"
                value={procedures}
                sub={`Выполненных процедур за период`}
                loading={analyticsLoading}
                icon={<Zap className="w-4 h-4" />}
              />
            )}

            {/* Red alerts */}
            {analytics && "redAlertCount" in analytics && (
              <QACard
                question="Есть ли пациенты, требующие внимания?"
                value={redAlerts}
                sub={redAlerts === 0 ? "Всё в порядке" : `${redAlerts} пациент${redAlerts === 1 ? "" : redAlerts < 5 ? "а" : "ов"} с красными флагами`}
                level={redAlerts === 0 ? "good" : redAlerts <= 3 ? "normal" : "warn"}
                hint={redAlerts > 0 ? "Проверьте карточки этих пациентов" : undefined}
                loading={analyticsLoading}
                icon={<AlertCircle className="w-4 h-4" />}
              />
            )}

            {/* Total patients */}
            {analytics && "totalPatients" in analytics && (
              <QACard
                question="Сколько пациентов в базе?"
                value={(analytics as any).totalPatients}
                sub="Всего пациентов в системе"
                loading={analyticsLoading}
                icon={<CheckCircle className="w-4 h-4" />}
              />
            )}
          </div>

          {/* ── Section 2: Retention & conversion ── */}
          {pmEnabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Лояльность и конверсия</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Retention rate */}
                <QACard
                  question="Сколько пациентов вернулись снова?"
                  value={pmLoading || pmFetching ? "…" : `${retentionRate}%`}
                  sub={`${pm?.returnedPatients ?? 0} из ${pm?.totalUniquePatientsInPeriod ?? 0} пациентов`}
                  level={pmLoading || pmFetching ? undefined : retentionLevel}
                  hint={pmLoading || pmFetching ? undefined : retentionHint}
                  loading={pmLoading}
                  icon={<Repeat2 className="w-4 h-4" />}
                />

                {/* Treatment plan conversion */}
                <QACard
                  question="Сколько пациентов согласились на лечение?"
                  value={pmLoading || pmFetching ? "…" : `${treatmentConv}%`}
                  sub={pmLoading || pmFetching ? undefined : `${pm?.treatmentPlanAccepted ?? 0} из ${pm?.treatmentPlanTotal ?? 0} планов`}
                  level={pmLoading || pmFetching ? undefined : conversionLevel}
                  hint={pmLoading || pmFetching ? undefined : conversionHint}
                  loading={pmLoading}
                  icon={<ClipboardCheck className="w-4 h-4" />}
                />

                {/* Average LTV */}
                <QACard
                  question="Сколько в среднем тратит один пациент?"
                  value={pmLoading || pmFetching ? "…" : `₸${avgLtv.toLocaleString("ru-KZ")}`}
                  sub="Средний доход с одного пациента"
                  loading={pmLoading}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
              </div>

              {/* Cohort retention table */}
              {!pmLoading && pm && pm.retentionCohorts.some((c) => c.newPatients > 0) && (
                <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
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
                            {([
                              { count: cohort.returnedIn3m,  total: cohort.newPatients },
                              { count: cohort.returnedIn6m,  total: cohort.newPatients },
                              { count: cohort.returnedIn12m, total: cohort.newPatients },
                            ] as { count: number; total: number }[]).map((cell, ci) => (
                              <td key={ci} className="py-2 px-3 text-right">
                                {cell.total > 0 ? (
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                                    cell.count / cell.total >= 0.5 ? "bg-emerald-100 text-emerald-700" :
                                    cell.count > 0               ? "bg-amber-100 text-amber-700"   : "text-muted-foreground"
                                  }`}>
                                    {cell.count > 0
                                      ? `${cell.count} (${Math.round((cell.count / cell.total) * 100)}%)`
                                      : "—"}
                                  </span>
                                ) : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top patients by LTV — owner/admin only */}
              {isOwnerOrAdmin && (
                <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
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

          {/* ── Section 3: Patient distribution pie ── */}
          {statusData.length > 0 && (
            <div className="bg-white rounded-2xl border border-border/50 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">На каком этапе находятся пациенты?</h3>
              <div className="flex flex-col lg:flex-row gap-4 items-center">
                <div className="w-full lg:w-64 shrink-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-1.5">
                  {statusData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs text-muted-foreground flex-1">{item.name}</span>
                      <span className="text-xs font-bold text-foreground">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 4: Doctor KPIs table ── */}
          {doctorKpis.length > 0 && (
            <div className="bg-white rounded-2xl border border-border/50 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">{t("analytics.doctorKpis")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.doctorName")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.patients")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.procedures")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.revenue")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.avgCheck")}</th>
                      <th className="text-right text-xs font-semibold text-muted-foreground py-3 px-3">{t("analytics.nps")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorKpis.map((doctor) => (
                      <tr key={doctor.doctorId} className="border-b border-border/30 hover:bg-muted/50 transition-colors">
                        <td className="text-sm text-foreground py-3 px-3 font-medium">{doctor.doctorName}</td>
                        <td className="text-sm text-foreground py-3 px-3 text-right">{doctor.patientsCount}</td>
                        <td className="text-sm text-foreground py-3 px-3 text-right">{doctor.proceduresCount}</td>
                        <td className="text-sm text-foreground py-3 px-3 text-right">₸{doctor.revenueTotal.toLocaleString()}</td>
                        <td className="text-sm text-foreground py-3 px-3 text-right">₸{Math.round(doctor.averageCheck).toLocaleString()}</td>
                        <td className="text-sm text-foreground py-3 px-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                            doctor.nps >= 70 ? "bg-emerald-100 text-emerald-700" :
                            doctor.nps >= 50 ? "bg-amber-100 text-amber-700"    : "bg-red-100 text-red-700"
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

          {/* ── Section 5: Channel analytics ── */}
          {isOwnerOrAdmin && (
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <button
                onClick={() => setChannelOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">Откуда к нам приходят люди?</span>
                </div>
                {channelOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {channelOpen && (
                <div className="px-5 pb-5">
                  {channelStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t("channelAnalytics.noData")}</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Bar-style channel breakdown */}
                      {channelStats.map((s, i) => {
                        const max = Math.max(...channelStats.map((x) => x.patientCount));
                        const pct = max > 0 ? Math.round((s.patientCount / max) * 100) : 0;
                        const convLevel: StatusLevel =
                          s.conversionRate >= 50 ? "good" :
                          s.conversionRate >= 25 ? "normal" : "warn";
                        const convCfg = statusConfig(convLevel);
                        return (
                          <div key={s.channelId} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-sm font-medium text-foreground">{s.channelName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${convCfg.badge}`}>
                                  {s.conversionRate}%
                                </span>
                                <span className="text-xs font-bold text-foreground">{s.patientCount} чел.</span>
                                <span className="text-xs text-muted-foreground">₸{s.totalRevenue.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
