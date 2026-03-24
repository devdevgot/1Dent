import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, SlidersHorizontal, X, ChevronDown } from "lucide-react";
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
  type GetDoctorDetailedAnalyticsMeParams,
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
          onClick={() => setLocation("/dashboard")}
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
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t("doctorAnalytics.filterActive")}
            </div>
          )}
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/30 bg-gray-50/80 px-6 py-3 space-y-3">
        {/* Period presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {t("doctorAnalytics.period")}:
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPreset(key)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                  preset === key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range */}
        {preset === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">{t("doctorAnalytics.from")}:</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs border border-border/60 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <span className="text-xs text-muted-foreground shrink-0">{t("doctorAnalytics.to")}:</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs border border-border/60 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}

        {/* Additional filters row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Procedure Type dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">{t("doctorAnalytics.procedureType")}:</span>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowTypeDropdown((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-border/60 rounded-lg hover:border-primary/40 transition-colors min-w-[130px] justify-between"
              >
                <span className={selectedType ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {selectedTypeName}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
              {showTypeDropdown && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-border/60 rounded-xl shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedType(""); setShowTypeDropdown(false); }}
                    className={`w-full px-3 py-2 text-xs text-left hover:bg-muted/50 transition-colors ${!selectedType ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  >
                    {t("doctorAnalytics.allTypes")}
                  </button>
                  {knownProcedureNames.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground italic">{t("common.noData")}</p>
                  )}
                  {knownProcedureNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => { setSelectedType(name); setShowTypeDropdown(false); }}
                      className={`w-full px-3 py-2 text-xs text-left hover:bg-muted/50 transition-colors ${selectedType === name ? "font-semibold text-primary" : "text-foreground"}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Min Revenue */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">{t("doctorAnalytics.minRevenue")}:</span>
            <input
              type="number"
              min={0}
              value={minRevenueInput}
              onChange={(e) => setMinRevenueInput(e.target.value)}
              placeholder="0"
              className="text-xs border border-border/60 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/40 w-28"
            />
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <X className="w-3 h-3" />
              {t("doctorAnalytics.resetFilters")}
            </button>
          )}

          {/* Loading indicator */}
          {isFetching && (
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin ml-1" />
          )}
        </div>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground italic">{t("doctorAnalytics.filteredResults")}</p>
        )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {kpiCards.map((card) => (
                <div key={card.label} className="bg-white rounded-xl border border-border/50 p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-2">{card.label}</p>
                  <p className="text-3xl font-bold text-foreground">{card.value}</p>
                  <p className={`text-xs mt-2 ${card.subColor}`}>{card.sub}</p>
                </div>
              ))}
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
    </div>
  );
}
