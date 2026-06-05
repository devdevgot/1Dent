import { useParams, useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft, Users, TrendingUp, DollarSign, Activity,
  Banknote, CheckCircle, Clock, Wallet, SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetDoctorKpis,
  useGetPayrollRecords,
  useGetSalarySettings,
  useUpdateSalarySettings,
  useListProcedures,
  useListUsersAll,
  useListExpenses,
  type DoctorKpi,
  type PayrollRecord,
} from "@workspace/api-client-react";
import PayrollApproveModal from "./payroll-approve-modal";
import { useAuthStore } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getBaseUrl } from "@/lib/base-url";

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

export default function StaffDetailPage() {
  const { t } = useTranslation();
  const { doctorId } = useParams<{ doctorId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();

  const { data: kpiData, isLoading: kpiLoading } = useGetDoctorKpis();
  const { data: usersData, isLoading: usersLoading } = useListUsersAll({ includeInactive: true });

  const doctors: DoctorKpi[] = kpiData?.data?.kpis ?? [];
  const doctorKpi = doctors.find((d) => d && d.doctorId === doctorId);

  const allUsers = usersData?.data?.users ?? [];
  const selectedUser = allUsers.find((u) => u && u.id === doctorId);

  const canManagePayroll = user?.role === "owner" || user?.role === "accountant" || user?.role === "admin";

  const { data: payrollData, refetch: refetchPayroll } = useGetPayrollRecords(doctorId ?? "");
  const { data: salaryData, refetch: refetchSalary } = useGetSalarySettings(doctorId ?? "");
  const { mutateAsync: saveSettings, isPending: savingSettings } = useUpdateSalarySettings();

  const payrollRecords: PayrollRecord[] = payrollData?.data?.records ?? [];
  const salarySettings = salaryData?.data?.settings;
  const settings = salarySettings as any;

  const { data: proceduresData, isLoading: proceduresLoading } = useListProcedures();

  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryType, setSalaryType] = useState<"fixed" | "commission" | "fixed_plus_commission" | "hourly">("fixed");
  const [fixedAmount, setFixedAmount] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "halfYear" | "year">("month");
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

  const { data: expensesData, isLoading: expensesLoading } = useListExpenses({
    dateFrom: dates.dateFromShort,
    dateTo: dates.dateToShort,
  });

  const expenses = expensesData?.data?.expenses ?? [];
  const advance = useMemo(() => {
    return expenses
      .filter((e) => e && e.category === "salary" && e.subcategory === `аванс:${doctorId}`)
      .reduce((sum, e) => sum + (e ? Number(e.amount) || 0 : 0), 0);
  }, [expenses, doctorId]);

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
        const res = await fetch(`${getBaseUrl()}/api/geo/tracking?dateFrom=${dates.dateFromStrGeo}&dateTo=${dates.dateToStrGeo}`, {
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
    if (!doctorId || geoEvents.length === 0) return 0;
    const userEvents = geoEvents
      .filter((e) => e && e.userId === doctorId)
      .sort((a, b) => {
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
  }, [geoEvents, doctorId]);

  const allProcedures = proceduresData?.data?.procedures ?? [];
  
  const filteredProcedures = useMemo(() => {
    const fromTime = dates.fromDate.getTime();
    const toTime = dates.toDate.getTime();
    return allProcedures.filter((p) => {
      if (!p) return false;
      const timeStr = p.completedAt || p.scheduledAt || p.createdAt;
      if (!timeStr) return false;
      const time = new Date(timeStr).getTime();
      return time >= fromTime && time <= toTime;
    });
  }, [allProcedures, dates.fromDate, dates.toDate]);

  const doctorProcedures = useMemo(() => {
    return filteredProcedures.filter((p) => p && p.doctorId === doctorId);
  }, [filteredProcedures, doctorId]);

  const completedDoctorProcedures = useMemo(() => {
    return doctorProcedures.filter((p) => p && p.status === "completed");
  }, [doctorProcedures]);

  const completedClinicProcedures = useMemo(() => {
    return filteredProcedures.filter((p) => p && p.status === "completed");
  }, [filteredProcedures]);

  if (kpiLoading || proceduresLoading || usersLoading || geoLoading || expensesLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!selectedUser) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("staff.notFound")}</p>
      </div>
    );
  }

  const isDoctor = selectedUser.role === "doctor";
  const isAssistant = (selectedUser.role as any) === "assistant";
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
    <div className="h-full flex flex-col overflow-hidden bg-[#f7f8fc]">
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation("/users")}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
              {getInitials(selectedUser.name)}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{selectedUser.name}</h1>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                {selectedUser.specialty && ` • ${selectedUser.specialty}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                "relative transition-colors p-1.5",
                showFilters || dateFilter !== "month" ? "text-primary" : "text-gray-400 hover:text-primary",
              )}
              title="Фильтры"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {dateFilter !== "month" && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary rounded-full" />
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-white border-b border-border/50 px-6 shrink-0"
          >
            <div className="py-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-gray-400 mr-2 uppercase tracking-wider">Период:</span>
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
                    onClick={() => setDateFilter(item.value as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
                      isActive
                        ? "bg-primary text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-6">

          {/* Metrics Cards */}
          {(isDoctor || isAssistant) ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                
                {/* Left Column: Rows 1, 2, 3 */}
                <div className="flex flex-col gap-4">
                  {/* Card 1: Всего пациентов */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Всего пациентов</h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">{totalPatientsCount}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">{totalPatientsDay}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">{totalPatientsNight}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Принятые пациенты */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Принятые пациенты</h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">{completedPatientsCount}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">{completedPatientsDay}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">{completedPatientsNight}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Конверсия приёма / Часы работы */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">
                        {(isAssistant || salType === "hourly") ? "Часы работы" : "Конверсия приёма"}
                      </h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">
                        {(isAssistant || salType === "hourly") ? `${workHours.toFixed(1)} ч.` : `${conversionPercent}%`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">
                          {(isAssistant || salType === "hourly") ? "Ставка" : "День"}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">
                          {(isAssistant || salType === "hourly") ? `₸${fixedSal.toLocaleString()}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">
                          {(isAssistant || salType === "hourly") ? "Бонус" : "Ночь"}
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">
                          {(isAssistant || salType === "hourly") ? `+${commPercent}%` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Rows 4, 5, 6 */}
                <div className="flex flex-col gap-4">
                  {/* Card 4: Выручка */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">
                        {isDoctor ? "Общая выручка" : "Выручка клиники"}
                      </h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">₸{totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">₸{dayRevenue.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">₸{nightRevenue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Средний чек */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Средний чек</h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">₸{avgCheckTotal.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">₸{avgCheckDay.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-700 block mt-0.5 truncate">₸{avgCheckNight.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 6: Выданный аванс */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Выданный аванс</h4>
                      <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">₸{advance.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-400 block mt-0.5 truncate">—</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-400 block mt-0.5 truncate">—</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <div className="text-right text-xs text-gray-400 mt-2">
                Показатели рассчитаны автоматически на основании гео-событий трекера и завершенных процедур.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {/* Card 6: Выданный аванс for other employees */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-[130px]">
                <div>
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">Выданный аванс</h4>
                  <span className="text-xl sm:text-2xl font-black text-gray-900 block mt-1 truncate">₸{advance.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 items-center">
                  <div>
                    <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">День</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-400 block mt-0.5 truncate">—</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 block font-medium uppercase tracking-tight truncate">Ночь</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-400 block mt-0.5 truncate">—</span>
                  </div>
                </div>
              </div>
              <div className="hidden sm:block" />
            </div>
          )}

          {/* Card 7: Зарплата (stretched full-width) */}
          <div className="bg-white rounded-2xl border border-border/50 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Итого к выплате (ФОТ)</h3>
                  <p className="text-[12px] text-gray-400 font-medium">С учётом выданного аванса и выполненных процедур</p>
                </div>
              </div>

              <div className="text-left lg:text-right">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Итоговая сумма</span>
                <span className="text-4xl font-black text-primary block mt-1">₸{finalSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Calculations and editing section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
              
              {/* Formula explanation */}
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Детализация начислений</h4>
                
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Схема начисления:</span>
                    <span className="font-semibold text-gray-800">
                      {salType === "fixed" && "Оклад"}
                      {salType === "commission" && "Процент от выручки"}
                      {salType === "fixed_plus_commission" && "Оклад + Процент"}
                      {salType === "hourly" && "Почасовая оплата"}
                    </span>
                  </div>
                  {salType === "fixed" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Фиксированный оклад:</span>
                      <span className="font-semibold text-gray-800">₸{fixedSal.toLocaleString()}</span>
                    </div>
                  )}
                  {salType === "commission" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                      <span className="font-semibold text-gray-800">₸{calculatedSalary.toLocaleString()}</span>
                    </div>
                  )}
                  {salType === "fixed_plus_commission" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Фиксированный оклад:</span>
                        <span className="font-semibold text-gray-800">₸{fixedSal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                        <span className="font-semibold text-gray-800">₸{((totalRevenue * commPercent) / 100).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {salType === "hourly" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Отработано часов:</span>
                        <span className="font-semibold text-gray-800">{workHours.toFixed(1)} ч.</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Почасовая ставка:</span>
                        <span className="font-semibold text-gray-800">₸{fixedSal.toLocaleString()}/час</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Оплата за часы:</span>
                        <span className="font-semibold text-gray-800">₸{Math.round(fixedSal * workHours).toLocaleString()}</span>
                      </div>
                      {commPercent > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 font-medium">Комиссия ({commPercent}% от ₸{totalRevenue.toLocaleString()}):</span>
                          <span className="font-semibold text-gray-800">₸{Math.round((totalRevenue * commPercent) / 100).toLocaleString()}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between text-sm border-t border-gray-200/60 pt-3">
                    <span className="text-gray-500 font-semibold">Всего начислено:</span>
                    <span className="font-bold text-gray-800">₸{calculatedSalary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-rose-600">
                    <span className="font-semibold">Вычтено авансом:</span>
                    <span className="font-bold">- ₸{advance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-200/60 pt-3 text-primary font-bold">
                    <span>Итого к выплате:</span>
                    <span>₸{finalSalary.toLocaleString()}</span>
                  </div>
                </div>

                {/* Approve FOT button inside details */}
                {canManagePayroll && (
                  <div className="pt-2">
                    <button
                      onClick={() => setShowPayrollModal(true)}
                      className="w-full py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 shadow-md shadow-primary/20"
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
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Параметры оплаты</h4>
                  {user?.role === "owner" && (
                    <button
                      onClick={() => setEditingSalary((v) => !v)}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      {editingSalary ? "Отмена" : "Изменить"}
                    </button>
                  )}
                </div>

                {editingSalary ? (
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Тип начисления</label>
                      <select
                        value={salaryType}
                        onChange={(e) => setSalaryType(e.target.value as typeof salaryType)}
                        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white font-semibold text-gray-700"
                      >
                        <option value="fixed">Оклад</option>
                        <option value="commission">Процент от выручки</option>
                        <option value="fixed_plus_commission">Оклад + Процент</option>
                        <option value="hourly">Почасовая оплата</option>
                      </select>
                    </div>
                    {(salaryType === "fixed" || salaryType === "fixed_plus_commission" || salaryType === "hourly") && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          {salaryType === "hourly" ? "Почасовая ставка (₸/час)" : "Сумма оклада (₸)"}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={fixedAmount}
                          onChange={(e) => setFixedAmount(Number(e.target.value))}
                          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white font-bold text-gray-700"
                        />
                      </div>
                    )}
                    {(salaryType === "commission" || salaryType === "fixed_plus_commission" || salaryType === "hourly") && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500">Процент комиссии (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={commissionPercent}
                          onChange={(e) => setCommissionPercent(Number(e.target.value))}
                          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white font-bold text-gray-700"
                        />
                      </div>
                    )}
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/95 disabled:opacity-50 transition-colors"
                    >
                      {savingSettings ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                ) : settings ? (
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div>
                      <p className="text-[11px] text-gray-400 font-semibold uppercase">Схема начисления</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">
                        {settings.salaryType === "fixed" ? "Оклад" :
                         settings.salaryType === "commission" ? "Процент от выручки" :
                         settings.salaryType === "fixed_plus_commission" ? "Оклад + Процент" :
                         "Почасовая оплата"}
                      </p>
                    </div>
                    {(settings.salaryType === "fixed" || settings.salaryType === "fixed_plus_commission" || settings.salaryType === "hourly") && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-semibold uppercase">
                          {settings.salaryType === "hourly" ? "Почасовая ставка" : "Размер оклада"}
                        </p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                          ₸{Number(settings.fixedAmount).toLocaleString()}
                          {settings.salaryType === "hourly" && " / час"}
                        </p>
                      </div>
                    )}
                    {(settings.salaryType === "commission" || settings.salaryType === "fixed_plus_commission" || settings.salaryType === "hourly") && (
                      <div>
                        <p className="text-[11px] text-gray-400 font-semibold uppercase">Процентная ставка</p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">{settings.commissionPercent}%</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-4 text-center">
                    <p className="text-sm text-gray-400 font-medium">Схема оплаты не настроена</p>
                  </div>
                )}
              </div>

            </div>

            {/* History collapse */}
            {canManagePayroll && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <details className="group">
                  <summary className="list-none flex items-center justify-between cursor-pointer select-none">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">История начислений и выплат</span>
                    <span className="text-xs text-primary font-semibold group-open:hidden">Показать историю</span>
                    <span className="text-xs text-primary font-semibold hidden group-open:inline">Скрыть историю</span>
                  </summary>

                  <div className="mt-4 pt-2">
                    {payrollRecords.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400 font-medium">Записи о начислениях отсутствуют</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm text-left">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Период</th>
                              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Базовая выручка</th>
                              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Расчитано</th>
                              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Выплачено</th>
                              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">Статус</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {payrollRecords.map((r) => {
                              if (!r) return null;
                              return (
                                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-gray-700">
                                    {(r.periodMonth ?? "").toString().padStart(2, "0")}/{r.periodYear ?? ""}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-600 font-medium">
                                    ₸{Number(r.revenueBase).toLocaleString("ru-KZ")}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                                    ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                                  </td>
                                  <td className="px-4 py-3 text-right text-emerald-600 font-bold">
                                    {r.approvedAmount ? `₸${Number(r.approvedAmount).toLocaleString("ru-KZ")}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {r.status === "approved" || r.status === "paid" ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        <CheckCircle className="w-3 h-3" />
                                        {r.status === "paid" ? "Выплачено" : "Утверждено"}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
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
        />
      )}
    </div>
  );
}
