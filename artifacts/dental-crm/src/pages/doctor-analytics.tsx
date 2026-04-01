import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, SlidersHorizontal, X, ChevronDown, Filter,
  Calendar, Users, TrendingUp, Wallet, CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  useGetDoctorDetailedAnalyticsMe,
  type DoctorDetailedAnalytics,
  type DoctorDetailedAnalyticsRevenueByMonthItem,
  type DoctorDetailedAnalyticsProceduresByNameItem,
  type GetDoctorDetailedAnalyticsMeParams,
} from "@workspace/api-client-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

// ─── Same mock data as dashboard so both screens show consistent demo numbers ─
const MOCK_ANALYTICS_DETAILED = {
  totalRevenue:     1_820_000,
  totalPatients:    31,
  totalProcedures:  42,
  averageCheck:     43_333,
  scheduledToday:   8,
  revenueByMonth: [
    { month: "Окт", revenue: 1_200_000 },
    { month: "Ноя", revenue: 1_540_000 },
    { month: "Дек", revenue: 980_000 },
    { month: "Янв", revenue: 1_650_000 },
    { month: "Фев", revenue: 1_390_000 },
    { month: "Мар", revenue: 1_820_000 },
  ],
  proceduresByName: [
    { name: "Чистка", count: 12 },
    { name: "Пломба", count: 9 },
    { name: "Брекеты", count: 7 },
    { name: "Удаление", count: 6 },
    { name: "Отбеливание", count: 8 },
  ],
  patientsByStatus: {
    treatment_in_progress: 14,
    post_op_monitoring: 8,
    completed: 9,
  },
  proceduresByStatus: {
    completed: 28,
    in_progress: 9,
    scheduled: 5,
  },
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  new_request: "status.new_request",
  initial_consultation: "status.initial_consultation",
  diagnostics: "status.diagnostics",
  treatment_assigned: "status.treatment_assigned",
  treatment_in_progress: "status.treatment_in_progress",
  post_op_monitoring: "status.post_op_monitoring",
  completed: "status.completed",
};

type Preset = "all" | "7d" | "30d" | "3m" | "6m" | "1y" | "custom";

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function dateMinusDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - days);
  return r;
}

function dateMinusMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - months);
  return r;
}

function computeDateRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "7d") return { dateFrom: toIsoDate(dateMinusDays(now, 7)), dateTo: undefined };
  if (preset === "30d") return { dateFrom: toIsoDate(dateMinusDays(now, 30)), dateTo: undefined };
  if (preset === "3m") return { dateFrom: toIsoDate(dateMinusMonths(now, 3)), dateTo: undefined };
  if (preset === "6m") return { dateFrom: toIsoDate(dateMinusMonths(now, 6)), dateTo: undefined };
  if (preset === "1y") return { dateFrom: toIsoDate(dateMinusMonths(now, 12)), dateTo: undefined };
  if (preset === "custom") return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
  return { dateFrom: undefined, dateTo: undefined };
}

export default function DoctorAnalyticsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [minRevenueInput, setMinRevenueInput] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Accumulated known procedure names for the dropdown (survives filter changes)
  const [knownProcedureNames, setKnownProcedureNames] = useState<string[]>([]);

  // ── Build API params ──────────────────────────────────────────────────────
  const params = useMemo<GetDoctorDetailedAnalyticsMeParams>(() => {
    const { dateFrom, dateTo } = computeDateRange(preset, customFrom, customTo);
    const p: GetDoctorDetailedAnalyticsMeParams = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    if (selectedType) p.procedureType = selectedType;
    const minRev = Number(minRevenueInput);
    if (!isNaN(minRev) && minRev > 0) p.minRevenue = minRev;
    return p;
  }, [preset, customFrom, customTo, selectedType, minRevenueInput]);

  const hasActiveFilters =
    preset !== "all" || !!selectedType || (Number(minRevenueInput) > 0);

  const { data, isLoading, isFetching } = useGetDoctorDetailedAnalyticsMe(
    Object.keys(params).length > 0 ? params : undefined,
  );
  const analytics: DoctorDetailedAnalytics | undefined = data?.data?.analytics;

  // Accumulate procedure names for dropdown
  useEffect(() => {
    const names = (analytics?.proceduresByName ?? []).map((p: DoctorDetailedAnalyticsProceduresByNameItem) => p.name);
    if (names.length > 0) {
      setKnownProcedureNames((prev) => {
        const merged = Array.from(new Set([...prev, ...names])).sort();
        return merged;
      });
    }
  }, [analytics]);

  function resetFilters() {
    setPreset("all");
    setCustomFrom("");
    setCustomTo("");
    setSelectedType("");
    setMinRevenueInput("");
  }

  // ── Derived chart data ────────────────────────────────────────────────────
  const hasRealData = Number(analytics?.totalRevenue ?? 0) > 0 || Number(analytics?.totalProcedures ?? 0) > 0;
  const effectiveAnalytics = hasRealData ? analytics : null;

  const totalRevenue    = effectiveAnalytics ? Number(effectiveAnalytics.totalRevenue    ?? 0) : MOCK_ANALYTICS_DETAILED.totalRevenue;
  const totalPatients   = effectiveAnalytics ? Number(effectiveAnalytics.totalPatients   ?? 0) : MOCK_ANALYTICS_DETAILED.totalPatients;
  const totalProcedures = effectiveAnalytics ? Number(effectiveAnalytics.totalProcedures ?? 0) : MOCK_ANALYTICS_DETAILED.totalProcedures;
  const averageCheck    = effectiveAnalytics ? Number(effectiveAnalytics.averageCheck    ?? 0) : MOCK_ANALYTICS_DETAILED.averageCheck;
  const scheduledToday  = effectiveAnalytics ? Number(effectiveAnalytics.scheduledToday  ?? 0) : MOCK_ANALYTICS_DETAILED.scheduledToday;

  const revenueByMonth: DoctorDetailedAnalyticsRevenueByMonthItem[] =
    effectiveAnalytics ? (effectiveAnalytics.revenueByMonth ?? []) : (MOCK_ANALYTICS_DETAILED.revenueByMonth as DoctorDetailedAnalyticsRevenueByMonthItem[]);
  const proceduresByName: DoctorDetailedAnalyticsProceduresByNameItem[] =
    effectiveAnalytics ? (effectiveAnalytics.proceduresByName ?? []) : (MOCK_ANALYTICS_DETAILED.proceduresByName as DoctorDetailedAnalyticsProceduresByNameItem[]);
  const patientsByStatus    = effectiveAnalytics ? (effectiveAnalytics.patientsByStatus  ?? {}) : MOCK_ANALYTICS_DETAILED.patientsByStatus;
  const rawProceduresByStatus = effectiveAnalytics ? (effectiveAnalytics.proceduresByStatus ?? {}) : MOCK_ANALYTICS_DETAILED.proceduresByStatus;

  const patientStatusData = Object.entries(patientsByStatus)
    .map(([key, value]) => ({ name: t(STATUS_LABEL_KEYS[key] ?? key), value: Number(value) }))
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
      icon: Calendar,
      bg: "bg-blue-500",
      light: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      label: t("doctorAnalytics.patientsRemaining"),
      value: totalPatients,
      sub: t("doctorAnalytics.thisMonth"),
      icon: Users,
      bg: "bg-violet-500",
      light: "bg-violet-50",
      text: "text-violet-600",
    },
    {
      label: t("doctorAnalytics.revenue"),
      value: totalRevenue >= 1_000_000
        ? `₸${(totalRevenue / 1_000_000).toFixed(1)}M`
        : `₸${Math.floor(totalRevenue / 1000)}K`,
      sub: t("doctorAnalytics.thisMonth"),
      icon: TrendingUp,
      bg: "bg-emerald-500",
      light: "bg-emerald-50",
      text: "text-emerald-600",
    },
    {
      label: t("doctorAnalytics.averageCheck"),
      value: averageCheck >= 1_000_000
        ? `₸${(averageCheck / 1_000_000).toFixed(1)}M`
        : `₸${Math.floor(averageCheck / 1000)}K`,
      sub: t("doctorAnalytics.thisMonth"),
      icon: Wallet,
      bg: "bg-amber-500",
      light: "bg-amber-50",
      text: "text-amber-600",
    },
    {
      label: t("doctorAnalytics.completedProcedures"),
      value: totalProcedures,
      sub: t("doctorAnalytics.thisMonth"),
      icon: CheckCircle2,
      bg: "bg-rose-500",
      light: "bg-rose-50",
      text: "text-rose-600",
    },
  ];

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "all",    label: t("doctorAnalytics.periodAll") },
    { key: "7d",     label: t("doctorAnalytics.period7d") },
    { key: "30d",    label: t("doctorAnalytics.period30d") },
    { key: "3m",     label: t("doctorAnalytics.period3m") },
    { key: "6m",     label: t("doctorAnalytics.period6m") },
    { key: "1y",     label: t("doctorAnalytics.period1y") },
    { key: "custom", label: t("doctorAnalytics.customPeriod") },
  ];

  const selectedTypeName = selectedType || t("doctorAnalytics.allTypes");

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("doctorAnalytics.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("doctorAnalytics.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t("doctorAnalytics.filterActive")}
              </div>
            )}
            <button
              onClick={() => setShowFiltersModal(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                hasActiveFilters
                  ? "bg-primary text-white shadow-lg shadow-primary/25 hover:shadow-xl"
                  : "bg-slate-100 text-foreground hover:bg-slate-200"
              }`}
            >
              <Filter className="w-4 h-4" />
              {t("doctorAnalytics.filters")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`${card.light} rounded-2xl p-3.5 flex flex-col gap-2`}>
                    <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-4.5 h-4.5 text-white" size={18} />
                    </div>
                    <p className={`text-xl font-bold leading-none ${card.text}`}>{card.value}</p>
                    <p className="text-xs font-medium text-gray-500 leading-tight">{card.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Trend */}
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
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => `₸${Math.floor(v / 1000)}K`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`₸${v.toLocaleString()}`, t("doctorAnalytics.revenue")]} />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Procedure Types Bar */}
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

              {/* Patient Status Pie */}
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

              {/* Procedures by Status Bar */}
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
        )}
      </div>

      {/* ── Filters Modal ──────────────────────────────────────────────────── */}
      <Dialog open={showFiltersModal} onOpenChange={setShowFiltersModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border/30 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              {t("doctorAnalytics.filters")}
            </DialogTitle>
            <DialogClose className="absolute right-4 top-4" />
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Period Section */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("doctorAnalytics.period")}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    className={`px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                      preset === key
                        ? "bg-primary text-white shadow-md"
                        : "bg-slate-100 text-foreground hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range */}
            {preset === "custom" && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t("doctorAnalytics.customPeriod")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      {t("doctorAnalytics.from")}
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full text-sm border border-border/60 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      {t("doctorAnalytics.to")}
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full text-sm border border-border/60 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Procedure Type */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("doctorAnalytics.procedureType")}</h3>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowTypeDropdown((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-border/60 rounded-lg hover:border-primary/40 transition-colors"
                >
                  <span className={selectedType ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {selectedTypeName}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showTypeDropdown ? "rotate-180" : ""}`} />
                </button>
                {showTypeDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border/60 rounded-lg shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedType(""); setShowTypeDropdown(false); }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors ${!selectedType ? "font-semibold text-primary bg-primary/5" : "text-muted-foreground"}`}
                    >
                      {t("doctorAnalytics.allTypes")}
                    </button>
                    {knownProcedureNames.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground italic text-center">{t("common.noData")}</p>
                    )}
                    {knownProcedureNames.map((name) => (
                      <button
                        key={name}
                        onClick={() => { setSelectedType(name); setShowTypeDropdown(false); }}
                        className={`w-full px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors ${selectedType === name ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Min Revenue */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("doctorAnalytics.minRevenue")}</h3>
              <input
                type="number"
                min={0}
                value={minRevenueInput}
                onChange={(e) => setMinRevenueInput(e.target.value)}
                placeholder="Мин. выручка (₸)"
                className="w-full text-sm border border-border/60 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Filter Summary */}
            {hasActiveFilters && (
              <div className="border-t border-border/30 pt-4">
                <p className="text-xs text-muted-foreground mb-2">{t("doctorAnalytics.filteredResults")}</p>
                <div className="flex flex-wrap gap-2">
                  {preset !== "all" && (
                    <div className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                      {PRESETS.find((p) => p.key === preset)?.label}
                    </div>
                  )}
                  {selectedType && (
                    <div className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                      {selectedType}
                    </div>
                  )}
                  {Number(minRevenueInput) > 0 && (
                    <div className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                      ≥ ₸{Number(minRevenueInput).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-border/30 pt-4 flex gap-3 justify-end">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
              >
                <X className="w-4 h-4" />
                {t("doctorAnalytics.resetFilters")}
              </button>
            )}
            <button
              onClick={() => setShowFiltersModal(false)}
              className="flex items-center gap-1.5 px-6 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-lg shadow-primary/25"
            >
              {t("common.close")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
