import { useState, useMemo, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  useGetDoctorKpis,
  useListProcedures,
  useListPatients,
  useGetFinancialSummary,
  useListChannels,
  getGetOwnerAnalyticsQueryKey,
  getGetDoctorKpisQueryKey,
} from "@workspace/api-client-react";
import {
  Contact, Users, X, ChevronLeft,
  Stethoscope, Send, Banknote, QrCode, CreditCard,
  Clock, Wallet, CalendarDays, SlidersHorizontal, Layers,
  Globe, Handshake, Megaphone, MapPin, ChevronRight,
} from "lucide-react";
import { FaInstagram, FaTelegram, FaWhatsapp } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { OnboardingWizard } from "@/components/dashboard/onboarding-wizard";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  kaspi_transfer: Send,
  cash:           Banknote,
  kaspi_qr:       QrCode,
  terminal:       CreditCard,
  kaspi_red:      Wallet,
  debt:           Clock,
};

const DOCTOR_BG = [
  "#4f46e5", "#059669", "#d97706", "#db2777", "#0284c7", "#16a34a",
];

function fmtRevenue(n: number) {
  return n.toLocaleString("ru-KZ") + " ₸";
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
type PaymentStat = { method: string; label: string; amount: number; percent: number; color: string };

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi Перевод",
  cash:           "Наличные",
  kaspi_qr:       "Kaspi QR",
  terminal:       "Терминал",
  kaspi_red:      "Kaspi RED",
  debt:           "В долг",
};

const PAYMENT_COLORS: Record<string, string> = {
  kaspi_qr:       "#ff5a00",
  cash:           "#26de81",
  kaspi_transfer: "#4B7BEC",
  terminal:       "#a29bfe",
  kaspi_red:      "#fc5c65",
  debt:           "#a8a8a8",
};

function ChannelIcon({ type, size = 18 }: { type: string; size?: number }) {
  const BRAND = "#1f75fe";
  const props = { size, color: BRAND, style: { flexShrink: 0 } };
  switch (type) {
    case "instagram": return <FaInstagram {...props} />;
    case "telegram":  return <FaTelegram {...props} />;
    case "whatsapp":  return <FaWhatsapp {...props} />;
    case "2gis":      return <MapPin size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "website":   return <Globe size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "referral":  return <Handshake size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    default:          return <Megaphone size={size} color={BRAND} style={{ flexShrink: 0 }} />;
  }
}

function DonutChart({
  data,
  activePeriod,
  realIncome,
  onDetailsClick,
}: {
  data: PaymentStat[];
  activePeriod: string;
  realIncome: number;
  onDetailsClick: () => void;
}) {
  const SIZE = 260, cx = 130, cy = 130, r = 115, SW = 13;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.amount, 0);
  const GAP = 14;
  const totalPct = data.reduce((s, d) => s + d.percent, 0);

  let cumLen = 0;
  const segs = data.map(d => {
    const segLen = (d.percent / (totalPct || 1)) * circ;
    const dash = Math.max(0, segLen - GAP);
    const offset = circ * 0.25 - cumLen;
    cumLen += segLen;
    return { ...d, dash, offset };
  });

  const isEmpty = data.length === 0 || total === 0;

  return (
    <div style={{ width: SIZE, height: SIZE, position: "relative" }}>
      <svg width={SIZE} height={SIZE}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e3d9" strokeWidth={SW} />
        {!isEmpty && segs.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={`${s.dash} ${circ}`}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {isEmpty ? (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Нет данных</span>
        ) : (
          <>
            <span style={{ fontWeight: 700, fontSize: 24, lineHeight: "30px", color: "#0f172a" }}>
              {realIncome.toLocaleString("ru-KZ")} ₸
            </span>
            <button
              onClick={onDetailsClick}
              className="mt-1 px-3 py-1 bg-[#1f75fe]/10 hover:bg-[#1f75fe]/15 border border-[#1f75fe]/20 rounded-full text-[10px] font-bold text-[#1f75fe] transition-colors cursor-pointer"
            >
              Подробнее
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DATE FILTER ────────────────────────────────────────────────────────────
type FilterPreset = "today" | "week" | "month" | "6months" | "year" | "custom";

const FILTER_PRESETS: { key: FilterPreset; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "За неделю" },
  { key: "month",   label: "Текущий месяц" },
  { key: "6months", label: "За полгода" },
  { key: "year",    label: "За год" },
  { key: "custom",  label: "Выбрать период" },
];

function getPresetRange(preset: FilterPreset): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":   return { from: today, to: today };
    case "week":    return { from: new Date(today.getTime() - 6 * 86400000), to: today };
    case "month":   return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "6months": return { from: new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), to: today };
    case "year":    return { from: new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), to: today };
    default:        return { from: today, to: today };
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

function fmtDateRange(from: Date, to: Date): string {
  if (from.toDateString() === to.toDateString()) {
    return from.toLocaleDateString("ru", { day: "numeric", month: "long", weekday: "short" });
  }
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// ─────────────────────────────────────────────────────────────────────────────


export default function OwnerDashboard() {
  const { t } = useTranslation();
  const { clinic } = useAuthStore();
  const [, navigate] = useLocation();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    return localStorage.getItem("show_onboarding_wizard") === "true";
  });
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    return localStorage.getItem("onboarding_completed") === "true";
  });
  // ── Date filter state ──
  const [filterOpen, setFilterOpen]     = useState(false);
  const [showCustom, setShowCustom]     = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("today");
  const [pendingPreset, setPendingPreset] = useState<FilterPreset>("today");
  const today = new Date();
  const [customFrom, setCustomFrom] = useState(toInputValue(today));
  const [customTo,   setCustomTo]   = useState(toInputValue(today));

  const dateRange = useMemo(() => {
    if (filterPreset === "custom") {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    return getPresetRange(filterPreset);
  }, [filterPreset, customFrom, customTo]);

  const filterLabel = FILTER_PRESETS.find(p => p.key === filterPreset)?.label ?? "Месяц";
  const dateRangeLabel = fmtDateRange(dateRange.from, dateRange.to);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"channels" | "conditions">("channels");

  const dateFromStr = useMemo(() => format(dateRange.from, "yyyy-MM-dd"), [dateRange.from]);
  const dateToStr = useMemo(() => format(dateRange.to, "yyyy-MM-dd"), [dateRange.to]);

  const { data: analyticsData, isLoading: analyticsLoading } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: summaryData, isLoading: summaryLoading } = useGetFinancialSummary({ dateFrom: dateFromStr, dateTo: dateToStr });
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();
  const { data: patientsData } = useListPatients();
  const { data: channelsRes } = useListChannels();

  const isLoading = analyticsLoading || summaryLoading;

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const allPatients   = patientsData?.data?.patients ?? [];
  const channels      = channelsRes?.data?.channels ?? [];

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const rawKpis = kpiData?.data?.kpis ?? [];

  const analytics = {
    revenueThisMonth:               Number(rawAnalytics.revenueThisMonth ?? 0),
    newPatientsThisMonth:           Number(rawAnalytics.newPatientsThisMonth ?? 0),
    completedProceduresThisMonth:   Number(rawAnalytics.completedProceduresThisMonth ?? 0),
    totalPatients:                  Number(rawAnalytics.totalPatients ?? 0),
    redAlertCount:                  Number(rawAnalytics.redAlertCount ?? 0),
    revenueByPaymentMethod:         (rawAnalytics.revenueByPaymentMethod ?? []) as PaymentStat[],
  };

  const kpis = rawKpis;

  const revenueThisMonth       = analytics.revenueThisMonth;
  const completedProcedures    = analytics.completedProceduresThisMonth;
  const totalPatients          = analytics.totalPatients;

  const hasClinicData = useMemo(() => {
    if (analyticsLoading) return false;
    return (
      totalPatients > 0 ||
      allPatients.length > 0 ||
      completedProcedures > 0
    );
  }, [analyticsLoading, totalPatients, allPatients.length, completedProcedures]);

  useEffect(() => {
    if (analyticsData && !isOnboardingCompleted && hasClinicData) {
      localStorage.setItem("onboarding_completed", "true");
      localStorage.removeItem("show_onboarding_wizard");
      setIsOnboardingCompleted(true);
    }
  }, [analyticsData, isOnboardingCompleted, hasClinicData]);

  // Auto-open wizard for fresh clinics that haven't completed setup
  useEffect(() => {
    if (!isOnboardingCompleted && !hasClinicData && !onboardingOpen && clinic?.createdAt) {
      const ageMs = Date.now() - new Date(clinic.createdAt).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        setOnboardingOpen(true);
      }
    }
  }, [isOnboardingCompleted, hasClinicData, clinic?.createdAt]);

  const realIncome = summaryData?.data?.netProfit ?? 0;

  const paymentStats = useMemo(() => {
    const methodAmounts: Record<string, number> = {};
    let total = 0;
    allProcedures.forEach((p) => {
      if (!p.completedAt || p.status !== "completed") return;
      const d = new Date(p.completedAt);
      const toWithTime = new Date(dateRange.to);
      toWithTime.setHours(23, 59, 59, 999);
      if (d >= dateRange.from && d <= toWithTime) {
        const method = p.paymentMethod || "cash";
        const amt = p.price ?? 0;
        methodAmounts[method] = (methodAmounts[method] ?? 0) + amt;
        total += amt;
      }
    });

    return Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => {
      const amount = methodAmounts[method] ?? 0;
      const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
      return {
        method,
        label,
        amount,
        percent,
        color: PAYMENT_COLORS[method] || "#B2BEC3",
      };
    }).filter(stat => stat.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [allProcedures, dateRange]);

  const CONDITION_LABELS: Record<string, string> = {
    cavity: "Кариес",
    root_canal: "Пульпит / Каналы",
    crown: "Коронки",
    implant: "Имплантация",
    extraction_needed: "Удаление",
    treated: "Повторное лечение",
    missing: "Протезирование",
  };
  const CONDITION_COLORS: Record<string, string> = {
    cavity: "#F5A623",
    root_canal: "#D0021B",
    crown: "#F8E71C",
    implant: "#2F9E99",
    extraction_needed: "#8B0000",
    treated: "#4A90E2",
    missing: "#9B59B6",
  };
  const CONDITION_ORDER = ["cavity", "root_canal", "extraction_needed", "crown", "implant", "treated", "missing"];

  const [conditionStats, setConditionStats] = useState<Array<{ condition: string; label: string; count: number; percent: number; color: string }>>([]);
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    fetch(`/api/patients/condition-stats`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
    })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (!json?.data?.stats) return;
        const stats = json.data.stats as Record<string, number>;
        const total = Object.values(stats).reduce((s: number, v: number) => s + v, 0);
        const list = CONDITION_ORDER
          .filter((c) => (stats[c] ?? 0) > 0)
          .map((c) => ({
            condition: c,
            label: CONDITION_LABELS[c] ?? c,
            count: stats[c] ?? 0,
            percent: total > 0 ? Math.round(((stats[c] ?? 0) / total) * 100) : 0,
            color: CONDITION_COLORS[c] ?? "#B2BEC3",
          }));
        setConditionStats(list);
      })
      .catch(() => {});
  }, []);

  const patientSourceMap = useMemo(() => {
    return new Map(allPatients.map((p) => [p.id, p.source]));
  }, [allPatients]);

  const channelStats = useMemo(() => {
    const channelAmounts: Record<string, number> = {};
    let total = 0;

    allProcedures.forEach((p) => {
      if (!p.completedAt || p.status !== "completed") return;
      const d = new Date(p.completedAt);
      const toWithTime = new Date(dateRange.to);
      toWithTime.setHours(23, 59, 59, 999);
      if (d >= dateRange.from && d <= toWithTime) {
        const patientSource = patientSourceMap.get(p.patientId) || "other";
        const amount = p.price ?? 0;
        total += amount;

        const matchedChannel = channels.find(
          (ch) => ch.refCode === patientSource || patientSource === `ref:${ch.refCode}`
        );

        if (matchedChannel) {
          channelAmounts[matchedChannel.id] = (channelAmounts[matchedChannel.id] ?? 0) + amount;
        } else {
          channelAmounts[patientSource] = (channelAmounts[patientSource] ?? 0) + amount;
        }
      }
    });

    const list: Array<{ name: string; type: string; amount: number; percent: number }> = [];

    channels.forEach((ch) => {
      const amount = channelAmounts[ch.id] ?? 0;
      if (amount > 0) {
        list.push({
          name: ch.name,
          type: ch.type,
          amount,
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
        });
      }
    });

    const defaultSources = ["instagram", "2gis", "whatsapp", "website", "referral", "walk_in", "other"];
    defaultSources.forEach((src) => {
      const amount = channelAmounts[src] ?? 0;
      if (amount > 0) {
        const translatedName = src === "instagram" ? "Instagram" :
                               src === "2gis" ? "2GIS" :
                               src === "whatsapp" ? "WhatsApp" :
                               src === "website" ? "Сайт" :
                               src === "referral" ? "Рекомендация" :
                               src === "walk_in" ? "Визит в клинику" : "Другое";

        list.push({
          name: translatedName,
          type: src,
          amount,
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
        });
      }
    });

    return list.sort((a, b) => b.amount - a.amount);
  }, [allProcedures, patientSourceMap, channels, dateRange]);

  useEffect(() => {
    document.title = SITE.dashboardTitles.owner;
  }, []);

  return (
    <div className="dashboard-page min-h-full pb-8">

      <div className="dash-top-strip">
        {/* Doctor leaderboard */}
        {kpis.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <p className="dash-section-label mb-2">Рейтинг врачей</p>
            <div
              className="flex items-start gap-4 overflow-x-auto pb-2 pt-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {[...kpis].sort((a, b) => b.score - a.score).map((kpi, i) => {
                const initials = (kpi.doctorName || "")
                  .split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                const bg = DOCTOR_BG[i % DOCTOR_BG.length];
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                return (
                  <motion.button
                    key={kpi.doctorId}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate(`/users/${kpi.doctorId}`)}
                    className="flex flex-col items-center shrink-0 w-[88px] p-1.5 hover:bg-[#faf8f4] rounded-2xl transition-colors"
                  >
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          className="stroke-[#f1ede4]"
                          strokeWidth="3.5"
                          fill="transparent"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          className="stroke-[#1f75fe] transition-all duration-500 ease-out"
                          strokeWidth="3.5"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 28}
                          strokeDashoffset={2 * Math.PI * 28 * (1 - (kpi.score ?? 0) / 100)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-xs select-none"
                        style={{ backgroundColor: bg }}
                      >
                        {initials}
                      </div>
                      <span className="absolute bottom-0.5 right-0.5 text-[11px] bg-white rounded-full w-[18px] h-[18px] flex items-center justify-center shadow-sm border border-[#e8e3d9] select-none">
                        {medal}
                      </span>
                    </div>
                    <span className="text-[12px] font-semibold text-[#0f172a] mt-2 text-center truncate w-full px-1">
                      {(kpi.doctorName || "").split(" ")[0]}
                    </span>
                    <span className="text-[10px] font-medium text-[#94a3b8]">{kpi.score ?? 0}%</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date row */}
        <div className="mx-4 py-3 flex items-center justify-between border-t border-[#f1ede4]">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#0f172a]">
            <CalendarDays className="w-4 h-4 text-[#1f75fe]" />
            <span className="capitalize">{dateRangeLabel}</span>
          </div>
          <button
            onClick={() => { setPendingPreset(filterPreset); setShowCustom(false); setFilterOpen(true); }}
            className="flex items-center gap-1.5 bg-white border border-[#e8e3d9] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#94a3b8]" />
            {filterLabel}
          </button>
        </div>
      </div>

      {/* ─── Setup Wizard Call-to-Action Card ─── */}
      {!isOnboardingCompleted && (
        <div className="mx-4 mt-4 dash-card dash-card-padded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 bg-[#fef3c7] text-[#d97706] rounded-full px-3 py-1 text-xs font-medium mb-2">
              <Layers className="w-3 h-3" />
              Быстрый старт
            </span>
            <h4 className="text-base font-bold text-[#0f172a]">Мастер настроек 1Dent</h4>
            <p className="text-sm text-[#64748b] mt-1 leading-relaxed">
              Настройте сотрудников, ИИ-чатбота, геолокацию и Telegram для полноценного старта.
            </p>
          </div>
          <button
            onClick={() => setOnboardingOpen(true)}
            className="dash-btn dash-btn-primary w-full sm:w-auto shrink-0"
          >
            Продолжить настройку
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Revenue Donut Card ─── */}
      <div className="mx-4 mt-3 dash-card overflow-hidden">

        {/* Ring chart */}
        <div className="pt-4 pb-2 flex justify-center">
          {isLoading ? (
            <div className="w-[260px] h-[260px] flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <DonutChart
              data={paymentStats}
              activePeriod={filterLabel}
              realIncome={realIncome}
              onDetailsClick={() => setDetailsOpen(true)}
            />
          )}
        </div>

        {/* ─── Payment method list ─── */}
        {!isLoading && paymentStats.length > 0 && (
          <div className="px-5 pb-5 space-y-0 divide-y divide-[#f1ede4]">
            {paymentStats.map((stat, idx) => {
              const Icon = PAYMENT_ICONS[stat.method] ?? Wallet;
              return (
                <motion.div
                  key={stat.method}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 py-3"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: stat.color + "22" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: stat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a]">{stat.label}</p>
                    <p className="text-xs text-[#94a3b8]">{stat.percent}%</p>
                  </div>
                  <span className="text-sm font-bold text-[#0f172a] shrink-0">
                    {fmtRevenue(stat.amount)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {!isLoading && paymentStats.length === 0 && revenueThisMonth === 0 && (
          <p className="py-6 text-center text-sm text-[#94a3b8]">Нет выручки в этом периоде</p>
        )}
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="mx-4 mt-4 dash-card dash-card-padded-sm">
        <p className="dash-section-label mb-3">
          {t("dashboard.quickActions")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t("ownerDashboard.manageStaff"), icon: Contact, path: "/users", bg: "#f1f5f9", accent: "#64748b" },
            { label: t("nav.patients"), icon: Users, path: "/patients", bg: "#e0e7ff", accent: "#4f46e5" },
            { label: t("nav.procedures"), icon: Stethoscope, path: "/procedures", bg: "#fce7f3", accent: "#db2777" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-2.5 p-3 rounded-2xl border border-[#e8e3d9] hover:border-[#1f75fe]/30 hover:bg-[#1f75fe]/5 transition-all text-left group"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                style={{ backgroundColor: item.bg }}
              >
                <item.icon className="w-4 h-4" style={{ color: item.accent }} />
              </div>
              <span className="text-xs font-semibold text-[#0f172a]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Date Filter Sheet ─── */}
      <Sheet open={filterOpen} onOpenChange={(v) => { setFilterOpen(v); if (!v) setShowCustom(false); }}>
        <SheetContent side="bottom" className="dash-sheet rounded-t-3xl px-0 pb-8 max-h-[85dvh] overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {!showCustom ? (
              <motion.div
                key="presets"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h2 className="text-base font-bold text-[#0f172a]">Фильтр по дате</h2>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b] hover:text-[#0f172a] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Preset list */}
                <div className="mt-2">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => {
                        if (p.key === "custom") {
                          setPendingPreset("custom");
                          setShowCustom(true);
                        } else {
                          setPendingPreset(p.key);
                        }
                      }}
                      className="w-full flex items-center justify-between px-5 py-4 border-b border-[#f1ede4] last:border-0 bg-white first:rounded-t-2xl"
                    >
                      <span className={cn(
                        "text-sm font-medium",
                        pendingPreset === p.key ? "text-[#0f172a] font-semibold" : "text-[#64748b]",
                      )}>
                        {p.label}
                      </span>
                      <span className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        pendingPreset === p.key
                          ? "border-[#1f75fe] bg-[#1f75fe]"
                          : "border-[#e8e3d9]",
                      )}>
                        {pendingPreset === p.key && (
                          <span className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-5 mt-4 flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      setFilterPreset(pendingPreset);
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-full text-sm font-semibold text-white bg-[#1f75fe] hover:bg-[#1a65e8] transition-colors"
                  >
                    Применить
                  </button>
                  <button
                    onClick={() => {
                      setPendingPreset("month");
                      setFilterPreset("month");
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-full text-sm font-semibold text-[#64748b] bg-[#f1ede4] hover:bg-[#e8e3d9] transition-colors"
                  >
                    Сбросить
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="custom"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.18 }}
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-4 pb-4">
                  <button
                    onClick={() => setShowCustom(false)}
                    className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-bold text-[#0f172a] flex-1">Выбрать период</h2>
                  <button
                    onClick={() => { setFilterOpen(false); setShowCustom(false); }}
                    className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Date inputs */}
                <div className="px-5 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">Начало</p>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] pointer-events-none" />
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo}
                        onChange={e => setCustomFrom(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 rounded-xl border border-[#e8e3d9] text-sm font-semibold text-[#0f172a] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 focus:outline-none bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">Конец</p>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8] pointer-events-none" />
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom}
                        max={toInputValue(new Date())}
                        onChange={e => setCustomTo(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 rounded-xl border border-[#e8e3d9] text-sm font-semibold text-[#0f172a] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 focus:outline-none bg-white"
                      />
                    </div>
                  </div>

                  <div className="bg-[#1f75fe]/10 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#1f75fe] shrink-0" />
                    <span className="text-sm font-semibold text-[#1f75fe]">
                      {customFrom && customTo
                        ? fmtDateRange(new Date(customFrom), new Date(customTo))
                        : "Выберите даты"}
                    </span>
                  </div>
                </div>

                <div className="px-5 mt-5 flex flex-col gap-2.5">
                  <button
                    disabled={!customFrom || !customTo}
                    onClick={() => {
                      setFilterPreset("custom");
                      setPendingPreset("custom");
                      setFilterOpen(false);
                      setShowCustom(false);
                    }}
                    className="w-full py-3.5 rounded-full text-sm font-semibold text-white disabled:opacity-50 bg-[#1f75fe] hover:bg-[#1a65e8] transition-colors"
                  >
                    Применить
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>

      {/* ─── Detailed Analytics Sheet ─── */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="dash-sheet rounded-t-3xl px-0 pb-8 max-h-[85dvh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <h2 className="text-base font-bold text-[#0f172a]">Детальная аналитика</h2>
              <p className="text-[11px] font-medium text-[#94a3b8] mt-0.5">
                Период: {dateRangeLabel}
              </p>
            </div>
            <button
              onClick={() => setDetailsOpen(false)}
              className="w-8 h-8 rounded-full bg-[#f1ede4] flex items-center justify-center text-[#64748b]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-[#f1ede4] p-1 rounded-xl mx-5 mt-2 mb-4">
            <button
              onClick={() => setActiveTab("channels")}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                activeTab === "channels"
                  ? "bg-white text-[#0f172a] shadow-sm"
                  : "text-[#64748b] hover:text-[#0f172a]"
              )}
            >
              Каналы привлечения
            </button>
            <button
              onClick={() => setActiveTab("conditions")}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                activeTab === "conditions"
                  ? "bg-white text-[#0f172a] shadow-sm"
                  : "text-[#64748b] hover:text-[#0f172a]"
              )}
            >
              Виды лечения
            </button>
          </div>

          {/* Content */}
          <div className="px-5 max-h-[50dvh] overflow-y-auto">
            {activeTab === "channels" ? (
              <div className="space-y-1">
                {channelStats.length > 0 ? (
                  channelStats.map((stat) => (
                    <motion.div
                      key={stat.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 py-2.5 border-b border-[#f1ede4] last:border-0"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] flex items-center justify-center shrink-0">
                        <ChannelIcon type={stat.type} size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <p className="text-xs font-semibold text-[#0f172a] truncate pr-2">{stat.name}</p>
                          <span className="text-xs font-bold text-[#0f172a] shrink-0">
                            {fmtRevenue(stat.amount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#f1ede4] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full bg-[#1f75fe]"
                              style={{ width: `${stat.percent}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-[#94a3b8] shrink-0 w-7 text-right">
                            {stat.percent}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs text-[#94a3b8]">
                    Нет данных по источникам пациентов за этот период
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {conditionStats.length > 0 ? (
                  conditionStats.map((stat, idx) => (
                    <motion.div
                      key={stat.condition}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-center gap-3 py-2.5 border-b border-[#f1ede4] last:border-0"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: stat.color + "22" }}
                      >
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: stat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <p className="text-xs font-semibold text-[#0f172a] truncate pr-2">{stat.label}</p>
                          <span className="text-xs font-bold text-[#0f172a] shrink-0">
                            {stat.count} пац.
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#f1ede4] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${stat.percent}%`, backgroundColor: stat.color }}
                            />
                            </div>
                            <span className="text-[9px] font-bold text-[#94a3b8] shrink-0 w-7 text-right">
                              {stat.percent}%
                            </span>
                          </div>
                        </div>
                      </motion.div>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs text-[#94a3b8]">
                    Нет данных по видам лечения
                  </p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <OnboardingWizard
        open={onboardingOpen}
        onClose={() => {
          setOnboardingOpen(false);
          setIsOnboardingCompleted(localStorage.getItem("onboarding_completed") === "true");
        }}
      />
    </div>
  );
}
