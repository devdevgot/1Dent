import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  SlidersHorizontal, X, ChevronDown, Filter,
  Calendar, Users, TrendingUp, Wallet, CheckCircle2, ChevronLeft, BarChart3,
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
import { PageShell } from "@/components/layout/page-shell";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];


const STATUS_LABEL_KEYS: Record<string, string> = {
  new_request: "status.new_request",
  initial_consultation: "status.initial_consultation",
  diagnostics: "status.diagnostics",
  treatment_assigned: "status.treatment_assigned",
  treatment_in_progress: "status.treatment_in_progress",
  payment_processing: "status.payment_processing",
  post_op_monitoring: "status.post_op_monitoring",
  completed: "status.completed",
  repeat_sale: "status.repeat_sale",
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
  const totalRevenue    = Number(analytics?.totalRevenue    ?? 0);
  const totalPatients   = Number(analytics?.totalPatients   ?? 0);
  const totalProcedures = Number(analytics?.totalProcedures ?? 0);
  const averageCheck    = Number(analytics?.averageCheck    ?? 0);
  const scheduledToday  = Number(analytics?.scheduledToday  ?? 0);

  const revenueByMonth: DoctorDetailedAnalyticsRevenueByMonthItem[] = analytics?.revenueByMonth ?? [];
  const proceduresByName: DoctorDetailedAnalyticsProceduresByNameItem[] = analytics?.proceduresByName ?? [];
  const patientsByStatus    = analytics?.patientsByStatus  ?? {};
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
      icon: Calendar,
      bg: "bg-[#1f75fe]",
      light: "bg-[#e0f2fe]",
      text: "text-[#0284c7]",
    },
    {
      label: t("doctorAnalytics.patientsRemaining"),
      value: totalPatients,
      sub: t("doctorAnalytics.thisMonth"),
      icon: Users,
      bg: "bg-[#7c3aed]",
      light: "bg-[#f5f3ff]",
      text: "text-[#7c3aed]",
    },
    {
      label: t("doctorAnalytics.revenue"),
      value: totalRevenue >= 1_000_000
        ? `₸${(totalRevenue / 1_000_000).toFixed(1)}M`
        : `₸${Math.floor(totalRevenue / 1000)}K`,
      sub: t("doctorAnalytics.thisMonth"),
      icon: TrendingUp,
      bg: "bg-[#16a34a]",
      light: "bg-[#f0fdf4]",
      text: "text-[#16a34a]",
    },
    {
      label: t("doctorAnalytics.averageCheck"),
      value: averageCheck >= 1_000_000
        ? `₸${(averageCheck / 1_000_000).toFixed(1)}M`
        : `₸${Math.floor(averageCheck / 1000)}K`,
      sub: t("doctorAnalytics.thisMonth"),
      icon: Wallet,
      bg: "bg-[#d97706]",
      light: "bg-[#fef3c7]",
      text: "text-[#d97706]",
    },
    {
      label: t("doctorAnalytics.completedProcedures"),
      value: totalProcedures,
      sub: t("doctorAnalytics.thisMonth"),
      icon: CheckCircle2,
      bg: "bg-[#db2777]",
      light: "bg-[#fce7f3]",
      text: "text-[#db2777]",
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
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[#e8e3d9] bg-white px-4 pt-5 pb-4 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f1ede4] active:bg-[#e8e3d9] transition-colors text-[#64748b] shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1f75fe] shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-[#0f172a]">{t("doctorAnalytics.title")}</h1>
          </div>
          <p className="text-xs text-[#64748b] mt-0.5">{t("doctorAnalytics.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1f75fe]/10 text-[#1f75fe] rounded-full text-xs font-medium">
              <SlidersHorizontal className="w-3 h-3" />
              {t("doctorAnalytics.filterActive")}
            </div>
          )}
          <button
            onClick={() => setShowFiltersModal(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
              hasActiveFilters
                ? "bg-[#1f75fe] hover:bg-[#1a65e8] text-white shadow-md hover:scale-105"
                : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a] rounded-xl"
            }`}
          >
            <Filter className="w-4 h-4" />
            {t("doctorAnalytics.filters")}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#1f75fe]/20 border-t-[#1f75fe] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`${card.light} rounded-2xl border border-[#e8e3d9] p-3.5 flex flex-col gap-2 shadow-md`}>
                    <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center shadow-sm`}>
                      <Icon className="w-4.5 h-4.5 text-white" size={18} />
                    </div>
                    <p className={`text-xl font-bold leading-none ${card.text}`}>{card.value}</p>
                    <p className="text-xs font-medium text-[#64748b] leading-tight">{card.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Trend */}
              <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-4">{t("doctorAnalytics.revenueTrend")}</h3>
                {revenueByMonth.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-sm text-[#64748b]">
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
              <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-4">{t("doctorAnalytics.procedureTypes")}</h3>
                {proceduresByName.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-sm text-[#64748b]">
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
              <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-4">{t("doctorAnalytics.patientStatus")}</h3>
                {patientStatusData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-sm text-[#64748b]">
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
                          <span className="text-xs text-[#64748b] flex-1 truncate">{item.name}</span>
                          <span className="text-xs font-semibold text-[#0f172a]">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Procedures by Status Bar */}
              <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-4">{t("doctorAnalytics.proceduresByStatus")}</h3>
                {procedureStatusChartData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-sm text-[#64748b]">
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
          <DialogHeader className="border-b border-[#e8e3d9] pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-[#1f75fe]" />
              {t("doctorAnalytics.filters")}
            </DialogTitle>
            <DialogClose className="absolute right-4 top-4" />
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Period Section */}
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a] mb-3">{t("doctorAnalytics.period")}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    className={`px-3 py-2 text-xs rounded-xl font-medium transition-all ${
                      preset === key
                        ? "bg-[#1f75fe]/10 text-[#1f75fe] font-semibold"
                        : "text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a]"
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
                <h3 className="text-sm font-semibold text-[#0f172a] mb-3">{t("doctorAnalytics.customPeriod")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#64748b] mb-1.5 block">
                      {t("doctorAnalytics.from")}
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#64748b] mb-1.5 block">
                      {t("doctorAnalytics.to")}
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Procedure Type */}
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a] mb-3">{t("doctorAnalytics.procedureType")}</h3>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowTypeDropdown((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-[#e8e3d9] rounded-xl hover:border-[#1f75fe]/40 transition-colors"
                >
                  <span className={selectedType ? "text-[#0f172a] font-medium" : "text-[#64748b]"}>
                    {selectedTypeName}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform ${showTypeDropdown ? "rotate-180" : ""}`} />
                </button>
                {showTypeDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e8e3d9] rounded-xl shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedType(""); setShowTypeDropdown(false); }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-[#f1ede4] transition-colors ${!selectedType ? "font-semibold text-[#1f75fe] bg-[#1f75fe]/10" : "text-[#64748b]"}`}
                    >
                      {t("doctorAnalytics.allTypes")}
                    </button>
                    {knownProcedureNames.length === 0 && (
                      <p className="px-3 py-2 text-sm text-[#64748b] italic text-center">{t("common.noData")}</p>
                    )}
                    {knownProcedureNames.map((name) => (
                      <button
                        key={name}
                        onClick={() => { setSelectedType(name); setShowTypeDropdown(false); }}
                        className={`w-full px-3 py-2 text-sm text-left hover:bg-[#f1ede4] transition-colors ${selectedType === name ? "font-semibold text-[#1f75fe] bg-[#1f75fe]/10" : "text-[#0f172a]"}`}
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
              <h3 className="text-sm font-semibold text-[#0f172a] mb-3">{t("doctorAnalytics.minRevenue")}</h3>
              <input
                type="number"
                min={0}
                value={minRevenueInput}
                onChange={(e) => setMinRevenueInput(e.target.value)}
                placeholder="Мин. выручка (₸)"
                className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] transition-colors"
              />
            </div>

            {/* Filter Summary */}
            {hasActiveFilters && (
              <div className="border-t border-[#e8e3d9] pt-4">
                <p className="text-xs text-[#64748b] mb-2">{t("doctorAnalytics.filteredResults")}</p>
                <div className="flex flex-wrap gap-2">
                  {preset !== "all" && (
                    <div className="px-2.5 py-1 bg-[#1f75fe]/10 text-[#1f75fe] text-xs rounded-full font-medium">
                      {PRESETS.find((p) => p.key === preset)?.label}
                    </div>
                  )}
                  {selectedType && (
                    <div className="px-2.5 py-1 bg-[#1f75fe]/10 text-[#1f75fe] text-xs rounded-full font-medium">
                      {selectedType}
                    </div>
                  )}
                  {Number(minRevenueInput) > 0 && (
                    <div className="px-2.5 py-1 bg-[#1f75fe]/10 text-[#1f75fe] text-xs rounded-full font-medium">
                      ≥ ₸{Number(minRevenueInput).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-[#e8e3d9] pt-4 flex gap-3 justify-end">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#dc2626] border border-[#dc2626]/20 rounded-xl hover:bg-[#fef2f2] transition-colors font-medium"
              >
                <X className="w-4 h-4" />
                {t("doctorAnalytics.resetFilters")}
              </button>
            )}
            <button
              onClick={() => setShowFiltersModal(false)}
              className="flex items-center gap-1.5 px-6 py-2 text-sm bg-[#1f75fe] hover:bg-[#1a65e8] text-white rounded-full hover:scale-105 transition-all font-semibold shadow-md"
            >
              {t("common.close")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
