import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  if (level === "good")   return { label: "Хорошо",          bg: "bg-[#f0fdf4]", border: "border-[#16a34a]/20", badge: "bg-[#f0fdf4] text-[#16a34a]", dot: "bg-[#16a34a]" };
  if (level === "warn")   return { label: "Требует внимания", bg: "bg-[#fef2f2]", border: "border-[#dc2626]/20", badge: "bg-[#fef2f2] text-[#dc2626]", dot: "bg-[#dc2626]" };
  return                         { label: "Норма",            bg: "bg-[#fef3c7]", border: "border-[#d97706]/20", badge: "bg-[#fef3c7] text-[#d97706]", dot: "bg-[#d97706]" };
}

interface QACardProps {
  question: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: string;
  level?: StatusLevel;
  icon?: React.ReactNode;
  loading?: boolean;
}

function QACard({ question, value, sub, hint, level, loading }: QACardProps) {
  const cfg = level ? statusConfig(level) : null;
  return (
    <div className={`bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-4 flex flex-col gap-1 ${cfg ? `${cfg.border}` : ""}`}>
      {/* Question — primary focus */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-[#0f172a] leading-snug">{question}</p>
        {cfg && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        )}
      </div>
      {/* Value — secondary */}
      {loading ? (
        <div className="h-7 w-20 bg-[#f1ede4] animate-pulse rounded-xl mt-2" />
      ) : (
        <p className="text-xl font-extrabold text-[#1f75fe] tracking-tight leading-none mt-2">{value}</p>
      )}
      {/* Sub line */}
      {!loading && sub && (
        <p className="text-xs text-[#64748b] mt-0.5 leading-snug">{sub}</p>
      )}
      {/* Hint */}
      {!loading && hint && (
        <p className={`text-xs mt-1 font-medium ${level === "warn" ? "text-[#dc2626]" : level === "normal" ? "text-[#d97706]" : "text-[#64748b]"}`}>{hint}</p>
      )}
    </div>
  );
}

function DoctorCard({ doctor, index, t }: { doctor: any; index: number; t: any }) {
  const initials = (doctor.doctorName || "")
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bg = COLORS[index % COLORS.length];
  const npsVal = doctor.nps ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] p-5 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col justify-between space-y-4">
      {/* Header: Avatar, Name, NPS */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 select-none shadow-sm"
            style={{ backgroundColor: bg }}
          >
            {initials}
          </div>
          <div>
            <h4 className="font-semibold text-[#0f172a] text-sm leading-tight">{doctor.doctorName || ""}</h4>
            <p className="text-[11px] text-[#64748b] mt-0.5">{t("analytics.doctorName")}</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
            npsVal >= 70 ? "bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20" :
            npsVal >= 50 ? "bg-[#fef3c7] text-[#d97706] border border-[#d97706]/20"    : "bg-[#fef2f2] text-[#dc2626] border border-[#dc2626]/20"
          }`}>
            NPS: {npsVal}%
          </span>
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#e8e3d9]">
        <div>
          <span className="text-[10px] text-[#64748b] font-medium block uppercase tracking-wider">
            {t("analytics.revenue")}
          </span>
          <span className="text-sm font-bold text-[#0f172a] block mt-0.5">
            ₸{(doctor.revenueTotal ?? 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#64748b] font-medium block uppercase tracking-wider">
            {t("analytics.avgCheck")}
          </span>
          <span className="text-sm font-bold text-[#0f172a] block mt-0.5">
            ₸{Math.round(doctor.averageCheck ?? 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#64748b] font-medium block uppercase tracking-wider">
            {t("analytics.patients")}
          </span>
          <span className="text-sm font-semibold text-[#0f172a] block mt-0.5">
            {doctor.patientsCount ?? 0}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#64748b] font-medium block uppercase tracking-wider">
            {t("analytics.procedures")}
          </span>
          <span className="text-sm font-semibold text-[#0f172a] block mt-0.5">
            {doctor.proceduresCount ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _statusLevelUnused = null;

const PATIENT_STATUS_LABELS: Record<string, string> = {
  new_request:          "Новый запрос",
  initial_consultation: "Первичный осмотр",
  diagnostics:          "Диагностика",
  treatment_assigned:   "Утвержден план",
  treatment_in_progress:"Лечение в процессе",
  payment_processing:   "Принятие оплаты",
  post_op_monitoring:   "Пост-оп наблюдение",
  completed:            "Завершено",
  repeat_sale:          "Повторная продажа",
};

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [period, setPeriod] = useState<Period>("today");
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
      { query: { enabled: pmEnabled, queryKey: ["/api/analytics/patient-metrics", periodDates] } },
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
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      {/* ── Header ── */}
      <div className="shrink-0 px-4 py-4 border-b border-[#e8e3d9] bg-white flex items-center gap-3 shadow-sm">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f1ede4] active:bg-[#e8e3d9] transition-colors text-[#64748b] shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold text-[#0f172a]">{t("analytics.title")}</h1>
          <p className="text-xs text-[#64748b] mt-0.5">{t("analytics.subtitle")}</p>
        </div>
      </div>

      {/* ── Period filter bar ── */}
      <div className="shrink-0 bg-white border-b border-[#e8e3d9] px-4 py-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-[#64748b] shrink-0" />
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriod(p)}
                className={`px-3 py-1.5 text-xs rounded-xl font-semibold transition-all ${
                  period === p
                    ? "bg-[#1f75fe]/10 text-[#1f75fe]"
                    : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a]"
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
              className="text-xs border border-[#e8e3d9] rounded-xl px-2.5 py-1.5 bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] w-36 transition-colors"
            />
            <span className="text-xs text-[#64748b]">—</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-[#e8e3d9] rounded-xl px-2.5 py-1.5 bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] w-36 transition-colors"
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
                <Heart className="h-4 w-4 text-[#1f75fe]" />
                <h2 className="text-sm font-bold text-[#0f172a]">Лояльность и конверсия</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Retention rate */}
                <QACard
                  question="Сколько пациентов вернулись снова?"
                  value={pmLoading || pmFetching ? "…" : `${retentionRate}%`}
                  sub={`Ретеншн за период`}
                  level={pmLoading || pmFetching ? undefined : retentionLevel}
                  hint={pmLoading || pmFetching ? undefined : retentionHint}
                  loading={!!pmLoading}
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
                <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 shadow-md">
                  <h4 className="text-sm font-semibold text-[#0f172a] mb-3">{t("analytics.cohortTitle")}</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t("analytics.cohortMonth")}</TableHead>
                          <TableHead className="text-right">{t("analytics.cohortNewPatients")}</TableHead>
                          <TableHead className="text-right">{t("analytics.cohortReturn3m")}</TableHead>
                          <TableHead className="text-right">{t("analytics.cohortReturn6m")}</TableHead>
                          <TableHead className="text-right">{t("analytics.cohortReturn12m")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pm.retentionCohorts.map((cohort) => (
                          <TableRow key={cohort.month}>
                            <TableCell className="font-medium text-[#0f172a]">{cohort.month}</TableCell>
                            <TableCell className="text-right text-[#0f172a]">{cohort.newPatients}</TableCell>
                            {([
                              { count: cohort.returnedIn3m,  total: cohort.newPatients },
                              { count: cohort.returnedIn6m,  total: cohort.newPatients },
                              { count: cohort.returnedIn12m, total: cohort.newPatients },
                            ] as { count: number; total: number }[]).map((cell, ci) => (
                              <TableCell key={ci} className="text-right">
                                {cell.total > 0 ? (
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                                    cell.count / cell.total >= 0.5 ? "bg-[#f0fdf4] text-[#16a34a]" :
                                    cell.count > 0               ? "bg-[#fef3c7] text-[#d97706]"   : "text-[#64748b]"
                                  }`}>
                                    {cell.count > 0
                                      ? `${cell.count} (${Math.round((cell.count / cell.total) * 100)}%)`
                                      : "—"}
                                  </span>
                                ) : "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Top patients by LTV — owner/admin only */}
              {isOwnerOrAdmin && (
                <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 shadow-md">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="h-4 w-4 text-[#d97706]" />
                    <h4 className="text-sm font-semibold text-[#0f172a]">{t("analytics.topByLtv")}</h4>
                  </div>
                  {pmLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-[#f1ede4] animate-pulse shrink-0" />
                          <div className="h-3 flex-1 bg-[#f1ede4] animate-pulse rounded" />
                          <div className="h-3 w-16 bg-[#f1ede4] animate-pulse rounded" />
                        </div>
                      ))}
                    </div>
                  ) : pm && pm.topPatientsByLtv.length > 0 ? (
                    <div className="space-y-2">
                      {pm.topPatientsByLtv.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-[#e8e3d9] last:border-0">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            idx === 0 ? "bg-[#fef3c7] text-[#d97706]" :
                            idx === 1 ? "bg-[#f1ede4] text-[#64748b]" :
                            idx === 2 ? "bg-[#fef3c7] text-[#d97706]" : "bg-[#f1ede4] text-[#64748b]"
                          }`}>{idx + 1}</span>
                          <span className="text-sm text-[#0f172a] font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-[#64748b]">{p.procedureCount} {t("analytics.procedures")}</span>
                          <span className="text-sm font-semibold text-[#0f172a]">₸{p.totalSpent.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#64748b] text-center py-4">{t("analytics.noData", "—")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Section 3: Patient distribution pie ── */}
          {statusData.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 shadow-md">
              <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3">На каком этапе находятся пациенты?</h3>
              <div className="flex flex-col lg:flex-row gap-4 items-center">
                <div className="w-full lg:w-56 shrink-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80}
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
                <div className="flex-1 grid grid-cols-1">
                  {statusData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2.5 py-2.5 border-b border-[#e8e3d9] last:border-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-sm text-[#64748b] flex-1">{item.name}</span>
                      <span className="text-sm font-bold text-[#0f172a]">{String(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 4: Doctor KPIs (Cards Layout) ── */}
          {doctorKpis.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0f172a]">{t("analytics.doctorKpis")}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side: first 3 rows */}
                <div className="space-y-4">
                  {doctorKpis.slice(0, 3).map((doctor, idx) => (
                    <DoctorCard key={doctor.doctorId} doctor={doctor} index={idx} t={t} />
                  ))}
                </div>

                {/* Right side: other 4,5,6 rows */}
                <div className="space-y-4">
                  {doctorKpis.slice(3, 6).map((doctor, idx) => (
                    <DoctorCard key={doctor.doctorId} doctor={doctor} index={idx + 3} t={t} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 5: Channel analytics ── */}
          {isOwnerOrAdmin && (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
              <button
                onClick={() => setChannelOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#faf8f4] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-[#1f75fe]" />
                  <span className="text-sm font-bold text-[#0f172a]">Откуда к нам приходят люди?</span>
                </div>
                {channelOpen
                  ? <ChevronUp className="w-4 h-4 text-[#64748b]" />
                  : <ChevronDown className="w-4 h-4 text-[#64748b]" />}
              </button>

              {channelOpen && (
                <div className="px-5 pb-5">
                  {channelStats.length === 0 ? (
                    <p className="text-sm text-[#64748b] text-center py-8">{t("channelAnalytics.noData")}</p>
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
                                <span className="text-sm font-medium text-[#0f172a]">{s.channelName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${convCfg.badge}`}>
                                  {s.conversionRate}%
                                </span>
                                <span className="text-xs font-bold text-[#0f172a]">{s.patientCount} чел.</span>
                                <span className="text-xs text-[#64748b]">₸{s.totalRevenue.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-[#f1ede4] rounded-full overflow-hidden">
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
    </PageShell>
  );
}
