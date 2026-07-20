import { useParams, useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, TrendingUp, DollarSign, Activity,
  Banknote, CheckCircle, Clock, Wallet, SlidersHorizontal,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  useGetDoctorKpis,
  useGetPayrollRecords,
  useGetSalarySettings,
  useUpdateSalarySettings,
  useListUsersAll,
  useListExpenses,
  useListProceduresScoped,
  useGetMe,
  findCachedStaffUser,
  STAFF_LIST_STALE_MS,
  type DoctorKpi,
  type PayrollRecord,
  type User,
} from "@workspace/api-client-react";
import PayrollApproveModal from "./payroll-approve-modal";
import { useAuthStore } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";
import { getBaseUrl } from "@/lib/base-url";
import { usePageBack } from "@/hooks/use-page-back";

interface GeoEvent {
  id: string;
  eventType: "checkin" | "checkout";
  occurredAt: string;
  userId: string;
  userName: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  doctor: "Врач",
  accountant: "Бухгалтер",
  warehouse: "Склад",
  assistant: "Ассистент",
  nurse: "Медсестра",
};

export default function StaffDetailPage({
  overlayDoctorId,
}: {
  overlayDoctorId?: string;
} = {}) {
  const { t } = useTranslation();
  const { doctorId: routeDoctorId } = useParams<{ doctorId: string }>();
  const doctorId = overlayDoctorId ?? routeDoctorId;
  const [, setLocation] = useLocation();
  const goBack = usePageBack({ menuFallback: true });
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const isSelfView = !!doctorId && !!user?.id && doctorId === user.id;
  const canViewAnyStaff = user?.role === "owner" || user?.role === "admin";
  const canViewPage = canViewAnyStaff || isSelfView;

  const cachedUser = useMemo(
    () => (doctorId ? findCachedStaffUser(queryClient, doctorId) : undefined),
    [queryClient, doctorId],
  );

  const { data: meData, isLoading: meLoading } = useGetMe({
    query: { enabled: isSelfView && !cachedUser, staleTime: STAFF_LIST_STALE_MS },
  });

  const { data: usersData, isLoading: usersLoading } = useListUsersAll(
    { includeInactive: true },
    {
      query: {
        enabled: canViewAnyStaff && !cachedUser && !isSelfView,
        staleTime: STAFF_LIST_STALE_MS,
        placeholderData: () =>
          queryClient.getQueryData(["/api/users", { includeInactive: true }]) ??
          queryClient.getQueryData(["/api/users", { includeInactive: false }]),
      },
    },
  );

  const selectedUser: User | undefined =
    cachedUser
    ?? (isSelfView ? (meData?.data?.user ?? user ?? undefined) : undefined)
    ?? usersData?.data?.users?.find((u) => u && u.id === doctorId);
  const isDoctor = selectedUser?.role === "doctor";
  const isAssistant = selectedUser?.role === "assistant";

  const { data: kpiData } = useGetDoctorKpis({
    query: { enabled: !!isDoctor && canViewAnyStaff, staleTime: 5 * 60_000 },
  });
  const doctors: DoctorKpi[] = kpiData?.data?.kpis ?? [];
  const doctorKpi = doctors.find((d) => d && d.doctorId === doctorId);

  const canManagePayroll = user?.role === "owner" || user?.role === "accountant" || user?.role === "admin";

  const { data: payrollData, refetch: refetchPayroll } = useGetPayrollRecords(doctorId ?? "");
  const { data: salaryData, refetch: refetchSalary } = useGetSalarySettings(doctorId ?? "");
  const { mutateAsync: saveSettings, isPending: savingSettings } = useUpdateSalarySettings();
  const confirm = useConfirm();

  const payrollRecords: PayrollRecord[] = payrollData?.data?.records ?? [];
  const salarySettings = salaryData?.data?.settings;
  const settings = salarySettings as any;

  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryType, setSalaryType] = useState<"fixed" | "commission" | "fixed_plus_commission" | "hourly">("fixed");
  const [fixedAmount, setFixedAmount] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "halfYear" | "year">("today");
  const [showFilters, setShowFilters] = useState(false);

  const dates = useMemo(() => {
    const now = new Date();
    
    // Format helper to YYYY-MM-DD
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    let fromDate: Date;
    let toDate: Date;

    switch (dateFilter) {
      case "today": {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      }
      case "week": {
        const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        fromDate = new Date(past.getFullYear(), past.getMonth(), past.getDate(), 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      }
      case "month": {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case "halfYear": {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case "year": {
        fromDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      default: {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    }

    const dateFromStrGeo = formatDate(fromDate) + "T00:00:00";
    const dateToStrGeo = formatDate(toDate) + "T23:59:59";
    const dateFromShort = formatDate(fromDate);
    const dateToShort = formatDate(toDate);

    return {
      fromDate,
      toDate,
      dateFromStrGeo,
      dateToStrGeo,
      dateFromShort,
      dateToShort,
    };
  }, [dateFilter]);

  const { data: proceduresData, isFetching: proceduresLoading } = useListProceduresScoped(
    {
      doctorId: isDoctor ? doctorId : undefined,
      dateFrom: dates.dateFromShort,
      dateTo: dates.dateToShort,
    },
    {
      query: {
        enabled: !!doctorId && !!selectedUser,
        staleTime: 60_000,
      },
    },
  );

  const { data: expensesData, isFetching: expensesLoading } = useListExpenses(
    {
      dateFrom: dates.dateFromShort,
      dateTo: dates.dateToShort,
      category: "salary",
      subcategory: doctorId ? `аванс:${doctorId}` : undefined,
    },
    { query: { enabled: !!doctorId } },
  );

  const advance = useMemo(() => {
    return (expensesData?.data?.expenses ?? []).reduce(
      (sum, e) => sum + (e ? Number(e.amount) || 0 : 0),
      0,
    );
  }, [expensesData]);

  const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setSalaryType((settings.salaryType as typeof salaryType) || "fixed");
      setFixedAmount(Number(settings.fixedAmount) || 0);
      setCommissionPercent(Number(settings.commissionPercent) || 0);
    }
  }, [settings?.userId]);

  // Fetch geo events for the selected date filter
  useEffect(() => {
    if (!doctorId) return;
    const fetchGeoTracking = async () => {
      setGeoLoading(true);
      try {
        const token = localStorage.getItem("auth_token");
        const res = await fetch(
          `${getBaseUrl()}/api/geo/tracking?userId=${doctorId}&dateFrom=${dates.dateFromStrGeo}&dateTo=${dates.dateToStrGeo}`,
          {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.events) {
            setGeoEvents(json.data.events);
          }
        }
      } catch (err) {
        console.error("Failed to fetch geo tracking", err);
      } finally {
        setGeoLoading(false);
      }
    };
    fetchGeoTracking();
  }, [doctorId, dates.dateFromStrGeo, dates.dateToStrGeo]);

  const handleSaveSettings = async () => {
    if (!doctorId) return;
    // Danger: salary scheme is the basis for all future payroll calculations.
    const ok = await confirm({
      tone: "danger",
      title: "Изменить схему зарплаты?",
      description:
        "Новая схема будет использоваться при расчёте зарплаты и ФОТ сотрудника. Убедитесь, что данные верны.",
      confirmLabel: "Сохранить",
    });
    if (!ok) return;
    await saveSettings({ userId: doctorId, data: { salaryType: salaryType as any, fixedAmount, commissionPercent } });
    await refetchSalary();
    setEditingSalary(false);
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "";
    return name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  const isDayTime = (dateStr?: string | null) => {
    if (!dateStr) return true;
    try {
      const hour = new Date(dateStr).getHours();
      return hour >= 8 && hour < 20;
    } catch {
      return true;
    }
  };

  const workHours = useMemo(() => {
    if (geoEvents.length === 0) return 0;
    const userEvents = [...geoEvents].sort((a, b) => {
      if (!a || !b) return 0;
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    });

    let totalMs = 0;
    let activeCheckinTime: Date | null = null;

    for (const event of userEvents) {
      const eventTime = new Date(event.occurredAt);
      if (event.eventType === "checkin") {
        activeCheckinTime = eventTime;
      } else if (event.eventType === "checkout") {
        if (activeCheckinTime) {
          totalMs += eventTime.getTime() - activeCheckinTime.getTime();
          activeCheckinTime = null;
        }
      }
    }

    if (activeCheckinTime) {
      const now = new Date();
      const diff = now.getTime() - activeCheckinTime.getTime();
      if (diff > 0 && diff < 18 * 60 * 60 * 1000) {
        totalMs += diff;
      }
    }

    return totalMs / (1000 * 60 * 60);
  }, [geoEvents]);

  const filteredProcedures = proceduresData?.data?.procedures ?? [];
  const doctorProcedures = isDoctor
    ? filteredProcedures
    : filteredProcedures.filter((p) => p && p.doctorId === doctorId);

  const completedDoctorProcedures = useMemo(
    () => doctorProcedures.filter((p) => p && p.status === "completed"),
    [doctorProcedures],
  );

  const completedClinicProcedures = useMemo(
    () => filteredProcedures.filter((p) => p && p.status === "completed"),
    [filteredProcedures],
  );

  const metricsLoading = proceduresLoading || geoLoading || expensesLoading;

  if (!canViewPage) {
    return (
      <PageShell className="h-full flex items-center justify-center">
        <p className="text-[#64748b]">{t("staff.notFound")}</p>
      </PageShell>
    );
  }

  if (!selectedUser && (usersLoading || meLoading)) {
    return (
      <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
        <div className="px-5 pt-4">
          <Skeleton className="h-10 w-48 rounded-xl" />
          <Skeleton className="h-4 w-32 rounded-lg mt-2" />
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-2xl" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!selectedUser) {
    return (
      <PageShell className="h-full flex items-center justify-center">
        <p className="text-[#64748b]">{t("staff.notFound")}</p>
      </PageShell>
    );
  }

  const nps = isDoctor && doctorKpi ? Number(doctorKpi.nps) : 0;

  const targetAllProcedures = isDoctor ? doctorProcedures : filteredProcedures;
  const targetCompletedProcedures = isDoctor ? completedDoctorProcedures : completedClinicProcedures;

  // 1. Всего пациентов
  const totalPatientsSet = new Set<string>();
  const totalPatientsDaySet = new Set<string>();
  const totalPatientsNightSet = new Set<string>();

  targetAllProcedures.forEach((p) => {
    if (!p) return;
    const time = p.scheduledAt || p.createdAt;
    if (p.patientId) {
      totalPatientsSet.add(p.patientId);
      if (isDayTime(time)) {
        totalPatientsDaySet.add(p.patientId);
      } else {
        totalPatientsNightSet.add(p.patientId);
      }
    }
  });

  const totalPatientsCount = totalPatientsSet.size;
  const totalPatientsDay = totalPatientsDaySet.size;
  const totalPatientsNight = totalPatientsNightSet.size;

  // 2. Принятые пациенты
  const completedPatientsSet = new Set<string>();
  const completedPatientsDaySet = new Set<string>();
  const completedPatientsNightSet = new Set<string>();

  targetCompletedProcedures.forEach((p) => {
    if (!p) return;
    const time = p.completedAt || p.scheduledAt || p.createdAt;
    if (p.patientId) {
      completedPatientsSet.add(p.patientId);
      if (isDayTime(time)) {
        completedPatientsDaySet.add(p.patientId);
      } else {
        completedPatientsNightSet.add(p.patientId);
      }
    }
  });

  const completedPatientsCount = completedPatientsSet.size;
  const completedPatientsDay = completedPatientsDaySet.size;
  const completedPatientsNight = completedPatientsNightSet.size;

  // 3. Конверсия
  const conversionPercent = totalPatientsCount > 0 
    ? Math.round((completedPatientsCount / totalPatientsCount) * 100) 
    : 0;

  // 4. Общая выручка
  let totalRevenue = 0;
  let dayRevenue = 0;
  let nightRevenue = 0;

  targetCompletedProcedures.forEach((p) => {
    if (!p) return;
    const time = p.completedAt || p.scheduledAt || p.createdAt;
    const price = Number(p.price) || 0;
    totalRevenue += price;
    if (isDayTime(time)) {
      dayRevenue += price;
    } else {
      nightRevenue += price;
    }
  });

  // 5. Средний чек
  const avgCheckTotal = completedPatientsCount > 0 ? Math.round(totalRevenue / completedPatientsCount) : 0;
  const avgCheckDay = completedPatientsDay > 0 ? Math.round(dayRevenue / completedPatientsDay) : 0;
  const avgCheckNight = completedPatientsNight > 0 ? Math.round(nightRevenue / completedPatientsNight) : 0;

  // Salary calculations
  const fixedSal = Number(settings?.fixedAmount) || 0;
  const commPercent = Number(settings?.commissionPercent) || 0;
  const salType = (settings?.salaryType as any) || "fixed";

  let calculatedSalary = 0;
  if (salType === "fixed") {
    calculatedSalary = fixedSal;
  } else if (salType === "commission") {
    calculatedSalary = (totalRevenue * commPercent) / 100;
  } else if (salType === "fixed_plus_commission") {
    calculatedSalary = fixedSal + (totalRevenue * commPercent) / 100;
  } else if (salType === "hourly") {
    calculatedSalary = (fixedSal * workHours) + (totalRevenue * commPercent) / 100;
  }

  const finalSalary = calculatedSalary - advance;

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title={selectedUser.name ?? ""}
        subtitle={[
          ROLE_LABELS[selectedUser.role] ?? selectedUser.role,
          selectedUser.specialty,
        ].filter(Boolean).join(" • ")}
        onBack={goBack}
        icon={
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--ds-primary)] to-[var(--ds-primary)] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
            {getInitials(selectedUser.name)}
          </div>
        }
        right={
          <PageHeaderIconButton
            onClick={() => setShowFilters((v) => !v)}
            active={showFilters || dateFilter !== "month"}
            title="Фильтры"
            className="relative"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {dateFilter !== "month" && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[var(--ds-primary)] rounded-full" />
            )}
          </PageHeaderIconButton>
        }
        bottom={
          showFilters ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-[#94a3b8] mr-2 uppercase tracking-wider">Период:</span>
                {[
                  { value: "today", label: "Сегодня" },
                  { value: "week", label: "На неделю" },
                  { value: "month", label: "На месяц" },
                  { value: "halfYear", label: "На полгода" },
                  { value: "year", label: "На год" },
                ].map((item) => {
                  const isActive = dateFilter === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => setDateFilter(item.value as typeof dateFilter)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                        isActive
                          ? "bg-[var(--ds-primary)] text-white shadow-sm"
                          : "bg-[#f1ede4] text-[#64748b] hover:bg-[var(--ds-border)] hover:text-[#0f172a]",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">

          {/* Metrics Cards */}
          {(isDoctor || isAssistant) ? (
            metricsLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[130px] rounded-2xl bg-[#f1ede4]" />
                ))}
              </div>
            ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                
                {/* Left Column: Rows 1, 2, 3 */}
                <div className="flex flex-col gap-4">
                  {/* Card 1: Всего пациентов */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">Всего пациентов</h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">{totalPatientsCount}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">{totalPatientsDay}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">{totalPatientsNight}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Принятые пациенты */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">Принятые пациенты</h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">{completedPatientsCount}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">{completedPatientsDay}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">{completedPatientsNight}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Конверсия приёма / Часы работы */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">
                        {(isAssistant || salType === "hourly") ? "Часы работы" : "Конверсия приёма"}
                      </h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">
                        {(isAssistant || salType === "hourly") ? `${workHours.toFixed(1)} ч.` : `${conversionPercent}%`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">
                          {(isAssistant || salType === "hourly") ? "Ставка" : "День"}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">
                          {(isAssistant || salType === "hourly") ? `₸${fixedSal.toLocaleString()}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">
                          {(isAssistant || salType === "hourly") ? "Бонус" : "Ночь"}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">
                          {(isAssistant || salType === "hourly") ? `+${commPercent}%` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Rows 4, 5, 6 */}
                <div className="flex flex-col gap-4">
                  {/* Card 4: Выручка */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">
                        {isDoctor ? "Общая выручка" : "Выручка клиники"}
                      </h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">₸{totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">₸{dayRevenue.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">₸{nightRevenue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Средний чек */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">Средний чек</h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">₸{avgCheckTotal.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">₸{avgCheckDay.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#0f172a] block mt-0.5 truncate">₸{avgCheckNight.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 6: Выданный аванс */}
                  <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">Выданный аванс</h4>
                      <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">₸{advance.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#94a3b8] block mt-0.5 truncate">—</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-[#94a3b8] block mt-0.5 truncate">—</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <div className="text-right text-xs text-[#94a3b8] mt-2">
                Показатели рассчитаны автоматически на основании гео-событий трекера и завершенных процедур.
              </div>
            </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {/* Card 6: Выданный аванс for other employees */}
              <div className="bg-white rounded-2xl border border-[#e8e3d9] p-4 sm:p-5 shadow-md hover:shadow-lg transition-all duration-200 flex flex-col justify-between h-[130px]">
                <div>
                  <h4 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider truncate">Выданный аванс</h4>
                  <span className="text-xl sm:text-2xl font-black text-[#0f172a] block mt-1 truncate">₸{advance.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8e3d9] items-center">
                  <div>
                    <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">День</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#94a3b8] block mt-0.5 truncate">—</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#94a3b8] block font-medium uppercase tracking-tight truncate">Ночь</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#94a3b8] block mt-0.5 truncate">—</span>
                  </div>
                </div>
              </div>
              <div className="hidden sm:block" />
            </div>
          )}

          {/* Card 7: Зарплата (stretched full-width) */}
          <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#e8e3d9]">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                  <Wallet className="h-6 w-6 text-[#1f75fe]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0f172a]">Итого к выплате (ФОТ)</h3>
                  <p className="text-[12px] text-[#94a3b8] font-medium">С учётом выданного аванса и выполненных процедур</p>
                </div>
              </div>

              <div className="text-left lg:text-right">
                <span className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider block">Итоговая сумма</span>
                <span className="text-4xl font-black text-[#1f75fe] block mt-1">₸{finalSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Calculations and editing section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
              
              {/* Formula explanation */}
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Детализация начислений</h4>
                
                <div className="bg-[#faf8f4] rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#64748b] font-medium">Схема начисления:</span>
                    <span className="font-semibold text-[#0f172a]">
                      {salType === "fixed" && "Оклад"}
                      {salType === "commission" && "Процент от выручки"}
                      {salType === "fixed_plus_commission" && "Оклад + Процент"}
                      {salType === "hourly" && "Почасовая оплата"}
                    </span>
                  </div>
                  {salType === "fixed" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748b] font-medium">Фиксированный оклад:</span>
                      <span className="font-semibold text-[#0f172a]">₸{fixedSal.toLocaleString()}</span>
                    </div>
                  )}
                  {salType === "commission" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#64748b] font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                      <span className="font-semibold text-[#0f172a]">₸{calculatedSalary.toLocaleString()}</span>
                    </div>
                  )}
                  {salType === "fixed_plus_commission" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#64748b] font-medium">Фиксированный оклад:</span>
                        <span className="font-semibold text-[#0f172a]">₸{fixedSal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#64748b] font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                        <span className="font-semibold text-[#0f172a]">₸{((totalRevenue * commPercent) / 100).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {salType === "hourly" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#64748b] font-medium">Отработано часов:</span>
                        <span className="font-semibold text-[#0f172a]">{workHours.toFixed(1)} ч.</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#64748b] font-medium">Почасовая ставка:</span>
                        <span className="font-semibold text-[#0f172a]">₸{fixedSal.toLocaleString()}/час</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#64748b] font-medium">Оплата за часы:</span>
                        <span className="font-semibold text-[#0f172a]">₸{Math.round(fixedSal * workHours).toLocaleString()}</span>
                      </div>
                      {commPercent > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#64748b] font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                          <span className="font-semibold text-[#0f172a]">₸{Math.round((totalRevenue * commPercent) / 100).toLocaleString()}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between text-sm border-t border-[#e8e3d9]/60 pt-3">
                    <span className="text-[#64748b] font-semibold">Всего начислено:</span>
                    <span className="font-bold text-[#0f172a]">₸{calculatedSalary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#dc2626]">
                    <span className="font-semibold">Вычтено авансом:</span>
                    <span className="font-bold">- ₸{advance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-[#e8e3d9]/60 pt-3 text-[#1f75fe] font-bold">
                    <span>Итого к выплате:</span>
                    <span>₸{finalSalary.toLocaleString()}</span>
                  </div>
                </div>

                {/* Approve FOT button inside details */}
                {canManagePayroll && (
                  <div className="pt-2">
                    <button
                      onClick={() => setShowPayrollModal(true)}
                      className="w-full py-3 bg-[#1f75fe] text-white text-sm font-semibold rounded-full hover:bg-[#1a65e8] hover:scale-105 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <Banknote className="w-4 h-4" />
                      Утвердить выплату ФОТ
                    </button>
                  </div>
                )}
              </div>

              {/* Action column (Edit settings / status) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Параметры оплаты</h4>
                  {user?.role === "owner" && (
                    <button
                      onClick={() => setEditingSalary((v) => !v)}
                      className="text-xs text-[#1f75fe] font-semibold hover:underline"
                    >
                      {editingSalary ? "Отмена" : "Изменить"}
                    </button>
                  )}
                </div>

                {editingSalary ? (
                  <div className="bg-[#faf8f4] rounded-2xl p-4 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-[#64748b]">Тип начисления</label>
                      <select
                        value={salaryType}
                        onChange={(e) => setSalaryType(e.target.value as typeof salaryType)}
                        className="mt-1 w-full border border-[#e8e3d9] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] bg-white font-semibold text-[#0f172a]"
                      >
                        <option value="fixed">Оклад</option>
                        <option value="commission">Процент от выручки</option>
                        <option value="fixed_plus_commission">Оклад + Процент</option>
                        <option value="hourly">Почасовая оплата</option>
                      </select>
                    </div>
                    {(salaryType === "fixed" || salaryType === "fixed_plus_commission" || salaryType === "hourly") && (
                      <div>
                        <label className="text-xs font-semibold text-[#64748b]">
                          {salaryType === "hourly" ? "Почасовая ставка (₸/час)" : "Сумма оклада (₸)"}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={fixedAmount}
                          onChange={(e) => setFixedAmount(Number(e.target.value))}
                          className="mt-1 w-full border border-[#e8e3d9] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] bg-white font-bold text-[#0f172a]"
                        />
                      </div>
                    )}
                    {(salaryType === "commission" || salaryType === "fixed_plus_commission" || salaryType === "hourly") && (
                      <div>
                        <label className="text-xs font-semibold text-[#64748b]">Процент комиссии (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={commissionPercent}
                          onChange={(e) => setCommissionPercent(Number(e.target.value))}
                          className="mt-1 w-full border border-[#e8e3d9] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe] bg-white font-bold text-[#0f172a]"
                        />
                      </div>
                    )}
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="w-full py-2 bg-[#1f75fe] text-white text-sm font-semibold rounded-full hover:bg-[#1a65e8] hover:scale-105 disabled:opacity-50 transition-all"
                    >
                      {savingSettings ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                ) : settings ? (
                  <div className="bg-[#faf8f4] rounded-2xl p-4 space-y-3">
                    <div>
                      <p className="text-[11px] text-[#94a3b8] font-semibold uppercase">Схема начисления</p>
                      <p className="text-sm font-bold text-[#0f172a] mt-0.5">
                        {settings.salaryType === "fixed" ? "Оклад" :
                         settings.salaryType === "commission" ? "Процент от выручки" :
                         settings.salaryType === "fixed_plus_commission" ? "Оклад + Процент" :
                         "Почасовая оплата"}
                      </p>
                    </div>
                    {(settings.salaryType === "fixed" || settings.salaryType === "fixed_plus_commission" || settings.salaryType === "hourly") && (
                      <div>
                        <p className="text-[11px] text-[#94a3b8] font-semibold uppercase">
                          {settings.salaryType === "hourly" ? "Почасовая ставка" : "Размер оклада"}
                        </p>
                        <p className="text-sm font-bold text-[#0f172a] mt-0.5">
                          ₸{Number(settings.fixedAmount).toLocaleString()}
                          {settings.salaryType === "hourly" && " / час"}
                        </p>
                      </div>
                    )}
                    {(settings.salaryType === "commission" || settings.salaryType === "fixed_plus_commission" || settings.salaryType === "hourly") && (
                      <div>
                        <p className="text-[11px] text-[#94a3b8] font-semibold uppercase">Процентная ставка</p>
                        <p className="text-sm font-bold text-[#0f172a] mt-0.5">{settings.commissionPercent}%</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#faf8f4] rounded-2xl p-4 text-center">
                    <p className="text-sm text-[#94a3b8] font-medium">Схема оплаты не настроена</p>
                  </div>
                )}
              </div>

            </div>

            {/* History collapse */}
            {canManagePayroll && (
              <div className="mt-8 pt-6 border-t border-[#e8e3d9]">
                <details className="group">
                  <summary className="list-none flex items-center justify-between cursor-pointer select-none">
                    <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">История начислений и выплат</span>
                    <span className="text-xs text-[#1f75fe] font-semibold group-open:hidden">Показать историю</span>
                    <span className="text-xs text-[#1f75fe] font-semibold hidden group-open:inline">Скрыть историю</span>
                  </summary>

                  <div className="mt-4 pt-2">
                    {payrollRecords.length === 0 ? (
                      <div className="text-center py-8 text-sm text-[#94a3b8] font-medium">Записи о начислениях отсутствуют</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-[#e8e3d9]">
                        <table className="w-full text-sm text-left">
                          <thead>
                            <tr className="bg-[#faf8f4] border-b border-[#e8e3d9]">
                              <th className="px-4 py-3 text-xs font-bold text-[#64748b] uppercase">Период</th>
                              <th className="px-4 py-3 text-xs font-bold text-[#64748b] uppercase text-right">Базовая выручка</th>
                              <th className="px-4 py-3 text-xs font-bold text-[#64748b] uppercase text-right">Расчитано</th>
                              <th className="px-4 py-3 text-xs font-bold text-[#64748b] uppercase text-right">Выплачено</th>
                              <th className="px-4 py-3 text-xs font-bold text-[#64748b] uppercase text-center">Статус</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e3d9]">
                            {payrollRecords.map((r) => {
                              if (!r) return null;
                              return (
                                <tr key={r.id} className="hover:bg-[#faf8f4] transition-colors">
                                  <td className="px-4 py-3 font-semibold text-[#0f172a]">
                                    {(r.periodMonth ?? "").toString().padStart(2, "0")}/{r.periodYear ?? ""}
                                  </td>
                                  <td className="px-4 py-3 text-right text-[#64748b] font-medium">
                                    ₸{Number(r.revenueBase).toLocaleString("ru-KZ")}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-[#0f172a]">
                                    ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                                  </td>
                                  <td className="px-4 py-3 text-right text-[#16a34a] font-bold">
                                    {r.approvedAmount ? `₸${Number(r.approvedAmount).toLocaleString("ru-KZ")}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {r.status === "approved" || r.status === "paid" ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16a34a] bg-[#f0fdf4] px-2 py-0.5 rounded-full">
                                        <CheckCircle className="w-3 h-3" />
                                        {r.status === "paid" ? "Выплачено" : "Утверждено"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#d97706] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                                        <Clock className="w-3 h-3" />
                                        Ожидает
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

          </div>

        </div>
      </div>

      {showPayrollModal && (
        <PayrollApproveModal
          onClose={() => setShowPayrollModal(false)}
          onSuccess={() => refetchPayroll()}
          filterUserId={doctorId}
        />
      )}
    </PageShell>
  );
}
