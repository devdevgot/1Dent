import { useState, useMemo } from "react";
import {
  useListProcedures, useListUsers, useListPatients, useUpdateProcedurePayment,
  useListExpenses, useDeleteExpense, useGetFinancialSummary, useGetInventoryConsumption,
  type ClinicExpense,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import ExpenseDialog from "@/components/expense-dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, CreditCard, AlertCircle, BarChart3,
  Search, ChevronDown, Clock, CheckCircle2, CalendarDays,
  Users, Zap, Plus, Pencil, Trash2, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay, endOfWeek, endOfMonth, endOfYear, parseISO, differenceInDays } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodPills } from "@/components/layout/period-pills";
import { Bone, SkeletonCard, TableSkeleton } from "@/components/skeletons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Period = "day" | "week" | "month" | "year" | "custom";

const BRAND_BLUE = "#1f75fe";
const PIE_COLORS = [BRAND_BLUE, "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi Transfer",
  cash:           "Наличные",
  kaspi_qr:       "Kaspi QR",
  terminal:       "Терминал",
  kaspi_red:      "Kaspi Red",
  debt:           "Долг",
};

const CATEGORY_COLORS: Record<string, string> = {
  salary:    "#4B7BEC",
  materials: "#F9CA24",
  rent:      "#6C5CE7",
  utilities: "#00B894",
  equipment: "#E17055",
  marketing: "#FD79A8",
  other:     "#B2BEC3",
};

const PERIOD_LABELS: Record<Period, string> = {
  day:    "Сегодня",
  week:   "Неделя",
  month:  "Месяц",
  year:   "Год",
  custom: "Период",
};

const PERIOD_OPTIONS = (Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({
  value: p,
  label: PERIOD_LABELS[p],
}));

const fmt = (v: number) => v.toLocaleString("ru-RU") + " ₸";

export default function AdminFinancePage() {
  const { t } = useTranslation();

  const [period, setPeriod] = useState<Period>("day");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterDoctorId, setFilterDoctorId] = useState("");
  const [filterPatientId, setFilterPatientId] = useState("");
  const [filterStatus, setFilterStatus] = useState("completed");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientList, setShowPatientList] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showPending, setShowPending] = useState(true);
  const [selectingPayment, setSelectingPayment] = useState<string | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ClinicExpense | null>(null);

  const { toast } = useToast();
  const { user } = useAuthStore();
  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "accountant";
  const canWrite  = user?.role === "owner" || user?.role === "admin";

  const queryClient = useQueryClient();
  const updatePayment = useUpdateProcedurePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/procedures"] });
        queryClient.invalidateQueries({ queryKey: ["/api/analytics/financial-summary"] });
        setSelectingPayment(null);
      },
      onError: () => {
        toast({ title: t("adminFinance.paymentError", "Не удалось подтвердить оплату"), variant: "destructive" });
      },
    },
  });

  const { data: proceduresData, isLoading } = useListProcedures();
  const { data: usersData, isLoading: usersLoading } = useListUsers();
  const { data: patientsData, isLoading: patientsLoading } = useListPatients();
  const anyLoading = isLoading || usersLoading || patientsLoading;

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const allUsers = usersData?.data?.users ?? [];
  const allPatients = patientsData?.data?.patients ?? [];
  const doctors = allUsers.filter((u) => u.role === "doctor");
  const patientMap = new Map(allPatients.map((p) => [p.id, p.name]));
  const doctorMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "day")    return startOfDay(now);
    if (period === "week")   return startOfWeek(now, { weekStartsOn: 1 });
    if (period === "month")  return startOfMonth(now);
    if (period === "custom") return startOfDay(new Date(customFrom));
    return startOfYear(now);
  }, [period, customFrom]);

  const periodEnd = useMemo(() => {
    const now = new Date();
    if (period === "day")    return endOfDay(now);
    if (period === "week")   return endOfWeek(now, { weekStartsOn: 1 });
    if (period === "month")  return endOfMonth(now);
    if (period === "custom") {
      const d = new Date(customTo);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    return endOfYear(now);
  }, [period, customTo]);

  const dateFromStr = useMemo(() => format(periodStart, "yyyy-MM-dd"), [periodStart]);
  const dateToStr = useMemo(() => format(periodEnd ?? new Date(), "yyyy-MM-dd"), [periodEnd]);

  const { data: expensesData, refetch: refetchExpenses } = useListExpenses({ dateFrom: dateFromStr, dateTo: dateToStr });
  const { data: summaryData } = useGetFinancialSummary({ dateFrom: dateFromStr, dateTo: dateToStr });
  const { data: consumptionData } = useGetInventoryConsumption({ dateFrom: dateFromStr, dateTo: dateToStr });
  const { mutateAsync: doDelete } = useDeleteExpense();

  const expenses = expensesData?.data?.expenses ?? [];
  const consumption = consumptionData?.data?.consumption ?? [];

  async function handleDeleteExpense(id: string) {
    if (!confirm(t("expenses.confirmDelete"))) return;
    try {
      await doDelete(id);
      toast({ title: t("expenses.deleted") });
      refetchExpenses();
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/financial-summary"] });
    } catch {
      toast({ title: t("expenses.deleteError"), variant: "destructive" });
    }
  }

  function handleExpenseSuccess() {
    refetchExpenses();
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/financial-summary"] });
  }

  function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    try { return format(new Date(d), "dd.MM.yyyy"); } catch { return d; }
  }

  const filtered = useMemo(() => {
    return allProcedures.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterDoctorId && p.doctorId !== filterDoctorId) return false;
      if (filterPatientId && p.patientId !== filterPatientId) return false;
      const isPending = (p.status as string) === "pending_payment";
      if (!isPending && p.status === "completed" && p.paymentMethod == null) return false;
      if (filterPaymentMethod && p.paymentMethod !== filterPaymentMethod) return false;
      const date = p.completedAt ?? p.scheduledAt;
      if (!date) return false;
      try {
        const d = parseISO(date);
        if (d < periodStart) return false;
        if (d > periodEnd) return false;
        return true;
      } catch { return false; }
    });
  }, [allProcedures, filterStatus, filterDoctorId, filterPatientId, filterPaymentMethod, periodStart, periodEnd]);

  const debtProcedures = useMemo(() =>
    allProcedures.filter((p) =>
      p.status === "completed" && p.paymentMethod === "debt" && (p.price ?? 0) > 0,
    ),
  [allProcedures]);

  const pendingProcedures = useMemo(() =>
    allProcedures.filter((p) => (p.status as string) === "pending_payment"),
  [allProcedures]);

  const useApiSummary = !filterDoctorId && !filterPatientId && !filterPaymentMethod && filterStatus === "completed";

  const filteredRevenue = filtered.reduce((acc, p) => acc + (p.price ?? 0), 0);
  const totalRevenue  = useApiSummary
    ? (summaryData?.data?.totalRevenue ?? filteredRevenue)
    : filteredRevenue;
  const avgCheck      = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;
  const paymentsCount = filtered.length;
  const pendingTotal  = pendingProcedures.reduce((a, p) => a + (p.price ?? 0), 0);
  const debtCount     = debtProcedures.length;

  const totalMaterialCost        = summaryData?.data?.totalMaterialCost        ?? consumption.reduce((a, r) => a + (r.totalCost ?? 0), 0);
  const totalOperationalExpenses = summaryData?.data?.totalOperationalExpenses ?? expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit                = useApiSummary
    ? (summaryData?.data?.netProfit ?? (totalRevenue - totalMaterialCost - totalOperationalExpenses))
    : (totalRevenue - totalMaterialCost - totalOperationalExpenses);
  const marginPct                = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
  const totalExpenses            = totalMaterialCost + totalOperationalExpenses;

  const expensesByCategory = summaryData?.data?.expensesByCategory ?? {};
  const pieData = Object.entries(expensesByCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: t(`expenses.cat.${k}`), value: v, key: k }));

  const chartData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const p of filtered) {
      const dateStr = p.completedAt ?? p.scheduledAt;
      if (!dateStr) continue;
      try {
        const d = parseISO(dateStr);
        let key: string;
        if (period === "day")                        key = format(d, "HH:00");
        else if (period === "week")                  key = format(d, "EEE");
        else if (period === "month" || period === "custom") key = format(d, "d.MM");
        else                                         key = format(d, "MM.yyyy");
        buckets[key] = (buckets[key] ?? 0) + (p.price ?? 0);
      } catch { /* skip */ }
    }
    return Object.entries(buckets).map(([name, revenue]) => ({ name, revenue }));
  }, [filtered, period]);

  const paymentMethodData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of filtered) {
      if (!p.price || p.price === 0) continue;
      const m = p.paymentMethod ?? "unknown";
      totals[m] = (totals[m] ?? 0) + p.price;
    }
    return Object.entries(totals)
      .map(([method, value]) => ({ name: PAYMENT_METHOD_LABELS[method] ?? method, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topProcedures = useMemo(() => {
    const byName: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const p of filtered) {
      if (!p.price) continue;
      if (!byName[p.name]) byName[p.name] = { name: p.name, revenue: 0, count: 0 };
      byName[p.name]!.revenue += p.price;
      byName[p.name]!.count  += 1;
    }
    return Object.values(byName).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filtered]);

  const revenueByDoctor = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const p of filtered) {
      const id   = p.doctorId ?? "unassigned";
      const name = (p.doctorId && doctorMap.get(p.doctorId)) ?? "Без врача";
      if (!map[id]) map[id] = { name, revenue: 0, count: 0 };
      map[id]!.revenue += p.price ?? 0;
      map[id]!.count  += 1;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, doctorMap]);

  const filteredPatientSearch = useMemo(() => {
    if (!patientSearch.trim()) return allPatients.slice(0, 8);
    const q = patientSearch.toLowerCase();
    return allPatients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 8);
  }, [allPatients, patientSearch]);

  const selectedPatient = allPatients.find((p) => p.id === filterPatientId);

  const today = new Date();

  return (
    <PageShell animate={false}>
      <PageHeader
        title={t("adminFinance.title")}
        subtitle={t("adminFinance.subtitle")}
        icon={<Wallet className="w-5 h-5" />}
        bottom={
          <>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
              <PeriodPills value={period} options={PERIOD_OPTIONS} onChange={(v) => setPeriod(v as Period)} />
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-2 mt-2 pl-5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-caption px-2.5 py-1.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 focus:border-[var(--ds-primary)] w-36"
                />
                <span className="text-caption text-[var(--text-subtle)]">—</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="text-caption px-2.5 py-1.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 focus:border-[var(--ds-primary)] w-36"
                />
              </div>
            )}
          </>
        }
      />

      <div className="p-4 pb-12 space-y-4 max-w-7xl mx-auto">

        {/* ── HERO: четыре главные цифры ── */}
        {anyLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0,1,2,3].map((i) => (
              <div key={i} className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] p-4 shadow-md animate-pulse">
                <div className="h-3 w-16 bg-[var(--surface-2)] rounded mb-3" />
                <div className="h-7 w-24 bg-[var(--surface-2)] rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Заработали */}
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-4">
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">Заработали</p>
              <p className="text-xl font-extrabold text-[var(--success)] leading-tight">
                {(totalRevenue >= 1_000_000
                  ? `₸${(totalRevenue / 1_000_000).toFixed(1)}M`
                  : totalRevenue >= 1000
                    ? `₸${Math.round(totalRevenue / 1000)}K`
                    : fmt(totalRevenue))}
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{paymentsCount} оплат</p>
            </div>

            {/* Ожидается */}
            <button
              onClick={() => setShowPending(!showPending)}
              className="bg-[#fef3c7] rounded-2xl border border-[#fde68a] shadow-md p-4 text-left hover:bg-[#fde68a]/50 transition-colors"
            >
              <p className="text-[11px] font-semibold text-[var(--warning)] mb-1.5">Ожидается</p>
              <p className="text-xl font-extrabold text-[var(--warning)] leading-tight">
                {pendingTotal >= 1000
                  ? `₸${Math.round(pendingTotal / 1000)}K`
                  : fmt(pendingTotal)}
              </p>
              <p className="text-[10px] text-[var(--warning)] mt-1">{pendingProcedures.length} записей</p>
            </button>

            {/* Расходы */}
            <div className={cn(
              "bg-[var(--ds-surface)] rounded-2xl border shadow-md p-4",
              totalExpenses > totalRevenue ? "bg-[#fef2f2] border-[#fecaca]" : "border-[var(--ds-border)]",
            )}>
              <p className={cn("text-[11px] font-semibold mb-1.5", totalExpenses > totalRevenue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]")}>
                Расходы
              </p>
              <p className={cn("text-xl font-extrabold leading-tight", totalExpenses > totalRevenue ? "text-[var(--danger)]" : "text-[var(--text)]")}>
                {totalExpenses >= 1000
                  ? `₸${Math.round(totalExpenses / 1000)}K`
                  : fmt(totalExpenses)}
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">материалы + опер.</p>
            </div>

            {/* Долги */}
            <button
              onClick={() => setShowDebts(!showDebts)}
              className={cn(
                "rounded-2xl border shadow-md p-4 text-left transition-colors",
                debtCount > 0
                  ? "bg-[#fef2f2] border-[#fecaca] hover:bg-[#fecaca]/30"
                  : "bg-[var(--ds-surface)] border-[var(--ds-border)] hover:bg-[var(--bg)]",
              )}
            >
              <p className={cn("text-[11px] font-semibold mb-1.5", debtCount > 0 ? "text-[var(--danger)]" : "text-[var(--text-secondary)]")}>
                Долги пациентов
              </p>
              <p className={cn("text-xl font-extrabold leading-tight", debtCount > 0 ? "text-[var(--danger)]" : "text-[var(--text-subtle)]")}>
                {debtCount}
              </p>
              <p className={cn("text-[10px] mt-1", debtCount > 0 ? "text-[var(--danger)]" : "text-[var(--text-secondary)]")}>
                {debtCount > 0 ? "нажмите для просмотра" : "всё оплачено"}
              </p>
            </button>
          </div>
        )}

        {/* ── Чистая прибыль + Маржа ── */}
        {anyLoading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="p-4">
                <Bone className="h-3 w-28 rounded mb-2" />
                <Bone className="h-6 w-24 rounded" />
              </SkeletonCard>
            ))}
          </div>
        )}
        {!anyLoading && (
          <div className="grid grid-cols-2 gap-3">
            <div className={cn("rounded-2xl border p-4 shadow-md", netProfit >= 0 ? "bg-[#f0fdf4] border-[#bbf7d0]" : "bg-[#fef2f2] border-[#fecaca]")}>
              <div className="flex items-center gap-2 mb-1">
                {netProfit >= 0
                  ? <TrendingUp className="w-4 h-4 text-[var(--success)]" />
                  : <TrendingDown className="w-4 h-4 text-[var(--danger)]" />}
                <span className="text-caption font-semibold text-[var(--text-secondary)]">Чистая прибыль</span>
              </div>
              <p className={cn("text-xl font-bold", netProfit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {netProfit.toLocaleString("ru-RU")} ₸
              </p>
            </div>
            <div className={cn("col-span-1 rounded-2xl border p-4 shadow-md", netProfit >= 0 ? "bg-[#f0fdf4]/60 border-[#bbf7d0]" : "bg-[#fef2f2]/60 border-[#fecaca]")}>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className={cn("w-4 h-4", netProfit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")} />
                <span className="text-caption font-semibold text-[var(--text-secondary)]">{t("financials.margin")}</span>
              </div>
              <p className={cn("text-xl font-bold", netProfit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {marginPct}%
              </p>
            </div>
          </div>
        )}

        {/* ── Дополнительные метрики ── */}
        {anyLoading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="p-4 flex items-center gap-3">
                <Bone className="w-9 h-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-3 w-28 rounded" />
                  <Bone className="h-4 w-20 rounded" />
                </div>
              </SkeletonCard>
            ))}
          </div>
        )}
        {!anyLoading && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#e0f2fe] flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4 text-[#0284c7]" />
              </div>
              <div>
                <p className="text-caption text-[var(--text-secondary)]">В среднем за один визит</p>
                <p className="text-base font-bold text-[var(--text)]">{fmt(avgCheck)}</p>
              </div>
            </div>
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-[var(--ds-primary)]" />
              </div>
              <div>
                <p className="text-caption text-[var(--text-secondary)]">Выполнено процедур</p>
                <p className="text-base font-bold text-[var(--text)]">{paymentsCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Долги пациентов (развёртка) ── */}
        {showDebts && debtProcedures.length > 0 && (
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[#fecaca] shadow-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#fecaca] flex items-center gap-2 bg-[#fef2f2]">
              <AlertCircle className="w-4 h-4 text-[var(--danger)]" />
              <h2 className="text-body font-bold text-[var(--text)]">Долги пациентов</h2>
              <span className="ml-auto text-caption font-bold text-[var(--danger)] bg-[#fef2f2] px-2 py-0.5 rounded-full border border-[#fecaca]">
                {debtProcedures.length}
              </span>
            </div>
            <div className="divide-y divide-[#e8e3d9]">
              {debtProcedures.slice(0, 20).map((proc) => {
                const dateStr = proc.completedAt ?? proc.scheduledAt;
                let daysAgo = 0;
                try { if (dateStr) daysAgo = differenceInDays(today, parseISO(dateStr)); } catch { /* */ }
                const isOverdue = daysAgo > 14;
                return (
                  <div
                    key={proc.id}
                    className={cn(
                      "px-4 py-3 flex items-start justify-between gap-3 hover:bg-[var(--bg)] transition-colors",
                      isOverdue ? "bg-[#fef2f2]/60" : "",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-[var(--text)] truncate">
                        {patientMap.get(proc.patientId ?? "") ?? "—"}
                      </p>
                      <p className="text-caption text-[var(--text-secondary)] truncate">{proc.name}</p>
                      <p className="text-caption text-[var(--text-secondary)]">
                        {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-body font-bold text-[var(--danger)]">
                        {proc.price ? fmt(proc.price) : "—"}
                      </p>
                      {isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fef2f2] text-[var(--danger)] border border-[#fecaca]">
                          {daysAgo} дн.
                        </span>
                      ) : (
                        <span className="text-caption text-[var(--text-secondary)]">{daysAgo} дн. назад</span>
                      )}
                      {dateStr && (
                        <p className="text-[10px] text-[var(--text-subtle)] mt-0.5">
                          {(() => { try { return format(parseISO(dateStr), "dd.MM.yyyy"); } catch { return "—"; } })()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Ожидают оплаты ── */}
        {pendingProcedures.length > 0 && (
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[#fde68a] shadow-md overflow-hidden">
            <button
              onClick={() => setShowPending(!showPending)}
              className="w-full px-4 py-3 border-b border-[#fde68a] flex items-center gap-2 hover:bg-[#fef3c7]/50 transition-colors"
            >
              <Clock className="w-4 h-4 text-[var(--warning)]" />
              <h2 className="text-body font-bold text-[var(--text)]">Ожидается оплата</h2>
              <span className="ml-1 text-caption font-bold text-[var(--warning)] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                {pendingProcedures.length}
              </span>
              <span className="ml-auto text-body font-bold text-[var(--warning)]">{fmt(pendingTotal)}</span>
              <ChevronDown className={cn("w-4 h-4 text-[var(--text-subtle)] transition-transform", showPending ? "rotate-180" : "")} />
            </button>
            {showPending && (
              <div className="divide-y divide-[#e8e3d9]">
                {pendingProcedures.map((proc) => {
                  const dateStr = proc.completedAt ?? proc.scheduledAt;
                  const isSelecting = selectingPayment === proc.id;
                  const isSaving = updatePayment.isPending;
                  return (
                    <div key={proc.id} className="px-4 py-3 space-y-2 hover:bg-[var(--bg)] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-semibold text-[var(--text)] truncate">
                            {patientMap.get(proc.patientId ?? "") ?? "—"}
                          </p>
                          <p className="text-caption text-[var(--text-secondary)] truncate">{proc.name}</p>
                          <p className="text-caption text-[var(--text-secondary)]">
                            {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                            {dateStr && ` · ${(() => { try { return format(parseISO(dateStr), "dd.MM.yyyy"); } catch { return ""; } })()}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-body font-bold text-[var(--text)]">
                            {proc.price ? fmt(proc.price) : "—"}
                          </p>
                          {!isSelecting && (
                            <button
                              onClick={() => setSelectingPayment(proc.id)}
                              className="mt-1 flex items-center gap-1 px-2.5 py-1 text-caption font-medium rounded-full bg-[#fef3c7] text-[var(--warning)] hover:bg-[#fde68a] transition-colors"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Оплатить
                            </button>
                          )}
                        </div>
                      </div>
                      {isSelecting && (
                        <div className="flex flex-wrap gap-1.5">
                          {(["cash", "kaspi_qr", "kaspi_transfer", "terminal", "kaspi_red", "debt"] as const).map((method) => (
                            <button
                              key={method}
                              disabled={isSaving}
                              onClick={() => updatePayment.mutate({ id: proc.id, data: { paymentMethod: method } })}
                              className="px-2 py-1 text-caption rounded-xl border border-[var(--ds-border)] hover:border-[#1f75fe] hover:bg-[#1f75fe]/10 hover:text-[var(--ds-primary)] transition-colors disabled:opacity-50"
                            >
                              {PAYMENT_METHOD_LABELS[method]}
                            </button>
                          ))}
                          <button
                            onClick={() => setSelectingPayment(null)}
                            className="px-2 py-1 text-caption rounded-xl border border-[var(--ds-border)] text-[var(--text-subtle)] hover:bg-[var(--surface-2)] transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Операционные расходы ── */}
        <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] overflow-hidden shadow-md">
          <div className="px-4 py-3 border-b border-[var(--ds-border)] flex items-center justify-between">
            <span className="text-body font-bold text-[var(--text)]">{t("financials.opExpensesList")}</span>
            {canCreate && (
              <button
                onClick={() => { setEditingExpense(null); setExpenseDialogOpen(true); }}
                className="flex items-center gap-1.5 text-caption font-semibold text-[var(--ds-primary)] hover:bg-[#1f75fe]/10 px-2.5 py-1.5 rounded-xl transition-colors"
              >
                {t("expenses.add")}
              </button>
            )}
          </div>
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)] text-sm">{t("expenses.empty")}</div>
          ) : (
            <div className="divide-y divide-[#e8e3d9]">
              {expenses.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-2 hover:bg-[var(--bg)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ backgroundColor: CATEGORY_COLORS[e.category] ?? "#B2BEC3" }} />
                      <p className="text-body font-medium text-[var(--text)]">
                        {t(`expenses.cat.${e.category}`)}
                        {e.subcategory && (
                          <span className="text-[var(--text-secondary)] font-normal">
                            {" "}
                            ·{" "}
                            {e.subcategory.startsWith("аванс:")
                              ? `аванс (${allUsers.find((u) => u.id === e.subcategory.split(":")[1])?.name || e.subcategory.split(":")[1]})`
                              : e.subcategory.startsWith("зарплата:")
                                ? `зарплата (${allUsers.find((u) => u.id === e.subcategory.split(":")[1])?.name || e.subcategory.split(":")[1]})`
                                : e.subcategory}
                          </span>
                        )}
                      </p>
                    </div>
                    {e.description && <p className="text-caption text-[var(--text-secondary)] mt-0.5 ml-4 truncate">{e.description}</p>}
                    <p className="text-caption text-[var(--text-subtle)] mt-0.5 ml-4">{fmtDate(e.expenseDate)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className="text-body font-semibold text-[var(--text)] mr-1">{Number(e.amount).toLocaleString("ru-RU")} ₸</p>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => { setEditingExpense(e); setExpenseDialogOpen(true); }}
                          className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-secondary)] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!e.payrollRef && (
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-[#fef2f2] text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Как менялась выручка ── */}
        <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-5">
          <h2 className="text-body font-bold text-[var(--text)] mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--ds-primary)]" />
            Как менялась выручка
          </h2>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-[var(--text-subtle)] text-sm">
              Нет данных за выбранный период
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  formatter={(v: number) => [fmt(v), "Выручка"]}
                  contentStyle={{ borderRadius: 12, fontSize: 13 }}
                />
                <Bar dataKey="revenue" fill={BRAND_BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Кто из врачей принёс больше всего ── */}
        {revenueByDoctor.length > 0 && (
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-5">
            <h2 className="text-body font-bold text-[var(--text)] mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--ds-primary)]" />
              Кто из врачей принёс больше всего
            </h2>
            <div className="space-y-3">
              {revenueByDoctor.map((row, i) => {
                const maxRev = revenueByDoctor[0]?.revenue ?? 1;
                const pct = Math.round((row.revenue / maxRev) * 100);
                return (
                  <div key={row.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-caption font-bold text-[var(--text-subtle)] w-4">{i + 1}</span>
                        <span className="text-body font-medium text-[var(--text)]">{row.name}</span>
                        <span className="text-caption text-[var(--text-secondary)]">{row.count} проц.</span>
                      </div>
                      <span className="text-body font-bold text-[var(--success)]">{fmt(row.revenue)}</span>
                    </div>
                    <div className="ml-6 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1f75fe] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Какие услуги самые прибыльные ── */}
        {topProcedures.length > 0 && (
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-5">
            <h2 className="text-body font-bold text-[var(--text)] mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--ds-primary)]" />
              Какие услуги самые прибыльные
            </h2>
            <div className="space-y-3">
              {topProcedures.map((proc, i) => {
                const maxRevenue = topProcedures[0]?.revenue ?? 1;
                const pct = Math.round((proc.revenue / maxRevenue) * 100);
                return (
                  <div key={proc.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-caption font-bold text-[var(--text-subtle)] w-4">{i + 1}</span>
                        <span className="text-body font-medium text-[var(--text)] truncate max-w-[180px]">{proc.name}</span>
                        <span className="text-caption text-[var(--text-secondary)] shrink-0">{proc.count} раз</span>
                      </div>
                      <span className="text-body font-bold text-[var(--success)] shrink-0">{fmt(proc.revenue)}</span>
                    </div>
                    <div className="ml-6 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--success)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Диаграммы (расходы и оплаты) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Расходы: пирог ── */}
          {pieData.length > 0 && (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] p-4 shadow-md">
              <h3 className="text-body font-bold text-[var(--text)] mb-3">Куда уходят деньги?</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key] ?? "#B2BEC3"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("ru-RU")} ₸`, ""]} />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Способы оплаты ── */}
          {paymentMethodData.length > 0 && (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-4">
              <h2 className="text-body font-bold text-[var(--text)] mb-3">Как платят пациенты?</h2>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentMethodData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Расход материалов ── */}
        {consumption.length > 0 && (
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] overflow-hidden shadow-md">
            <div className="px-4 py-3 border-b border-[var(--ds-border)] flex items-center gap-2">
              <Package className="w-4 h-4 text-[var(--warning)]" />
              <span className="text-body font-bold text-[var(--text)]">{t("financials.materialsBreakdown")}</span>
            </div>
            <div className="divide-y divide-[#e8e3d9]">
              {consumption.slice(0, 5).map((row) => (
                <div key={row.itemId} className="px-4 py-3 flex items-center justify-between gap-2 hover:bg-[var(--bg)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-medium text-[var(--text)] truncate">{row.itemName}</p>
                    <p className="text-caption text-[var(--text-secondary)]">{row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("financials.proceduresPcs")}</p>
                  </div>
                  <p className="text-body font-semibold text-[var(--warning)] shrink-0">{(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸</p>
                </div>
              ))}
              {consumption.length > 5 && (
                <div className="px-4 py-2 text-caption text-center text-[var(--text-subtle)]">+{consumption.length - 5} {t("financials.moreItems")}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Таблица платежей ── */}
        <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--ds-border)] space-y-3">
            <h2 className="text-body font-bold text-[var(--text)]">{t("adminFinance.paymentsTable")}</h2>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterDoctorId}
                onChange={(e) => setFilterDoctorId(e.target.value)}
                className="text-caption px-2.5 py-1.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
              >
                <option value="">{t("adminFinance.allDoctors")}</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-caption px-2.5 py-1.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
              >
                <option value="">{t("adminFinance.allStatuses")}</option>
                <option value="completed">{t("adminFinance.completed")}</option>
                <option value="pending_payment">Ожидает оплаты</option>
                <option value="scheduled">{t("adminFinance.scheduled")}</option>
                <option value="in_progress">{t("adminFinance.inProgress")}</option>
                <option value="cancelled">{t("adminFinance.cancelled")}</option>
              </select>
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="text-caption px-2.5 py-1.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
              >
                <option value="">{t("adminFinance.allPayments")}</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Patient search */}
            <div className="relative w-full sm:w-72">
              {selectedPatient ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1f75fe]/30 bg-[#1f75fe]/5 text-sm">
                  <span className="font-medium text-[var(--text)] flex-1 truncate">{selectedPatient.name}</span>
                  <button
                    onClick={() => { setFilterPatientId(""); setPatientSearch(""); }}
                    className="text-caption text-[var(--ds-primary)] hover:underline shrink-0"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--ds-border)] focus-within:ring-2 focus-within:ring-[#1f75fe]/20 focus-within:border-[#1f75fe] bg-[var(--ds-surface)]">
                  <Search className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                  <input
                    value={patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); setShowPatientList(true); }}
                    onFocus={() => setShowPatientList(true)}
                    placeholder={t("adminFinance.filterPatient")}
                    className="flex-1 bg-transparent outline-none text-xs"
                  />
                </div>
              )}
              {showPatientList && !selectedPatient && (
                <div className="absolute z-20 mt-1.5 w-full bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border)] shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filteredPatientSearch.length === 0 ? (
                    <div className="p-3 text-body text-[var(--text-subtle)] text-center">Нет пациентов</div>
                  ) : (
                    filteredPatientSearch.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setFilterPatientId(p.id); setPatientSearch(p.name); setShowPatientList(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg)] transition-colors text-left border-b border-[var(--ds-border)]/60 last:border-0"
                      >
                        <span className="text-body font-medium text-[var(--text)]">{p.name}</span>
                        <span className="text-caption text-[var(--text-subtle)] ml-auto">{p.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton rows={6} columns={7} avatar={false} className="border-0 shadow-none rounded-none" />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-subtle)] text-sm">{t("adminFinance.noData")}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("adminFinance.colPatient")}</TableHead>
                    <TableHead>{t("adminFinance.colDoctor")}</TableHead>
                    <TableHead>{t("adminFinance.colService")}</TableHead>
                    <TableHead className="text-right">{t("adminFinance.colAmount")}</TableHead>
                    <TableHead>{t("adminFinance.colPayment")}</TableHead>
                    <TableHead>{t("adminFinance.colDate")}</TableHead>
                    <TableHead>{t("adminFinance.colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 50).map((proc) => {
                    const statusColors: Record<string, string> = {
                      scheduled:       "bg-[#e0f2fe] text-[#0284c7]",
                      in_progress:     "bg-[#fef3c7] text-[var(--warning)]",
                      completed:       "bg-[#f0fdf4] text-[var(--success)]",
                      cancelled:       "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                      pending_payment: "bg-[#fef3c7] text-[var(--warning)]",
                    };
                    const statusLabels: Record<string, string> = {
                      scheduled:       t("adminFinance.scheduled"),
                      in_progress:     t("adminFinance.inProgress"),
                      completed:       t("adminFinance.completed"),
                      cancelled:       t("adminFinance.cancelled"),
                      pending_payment: "Ожидает",
                    };
                    const dateStr = proc.completedAt ?? proc.scheduledAt;
                    return (
                      <TableRow key={proc.id}>
                        <TableCell className="font-medium text-[var(--text)]">
                          {patientMap.get(proc.patientId ?? "") ?? "—"}
                        </TableCell>
                        <TableCell className="text-[var(--text-secondary)]">
                          {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-[var(--text)] max-w-[180px] truncate">{proc.name}</TableCell>
                        <TableCell className="text-right font-semibold text-[var(--text)]">
                          {proc.price ? fmt(proc.price) : "—"}
                        </TableCell>
                        <TableCell className="text-[var(--text-secondary)]">
                          {proc.paymentMethod ? (PAYMENT_METHOD_LABELS[proc.paymentMethod] ?? proc.paymentMethod) : "—"}
                        </TableCell>
                        <TableCell className="text-[var(--text-secondary)] whitespace-nowrap">
                          {dateStr ? (() => { try { return format(parseISO(dateStr), "dd.MM.yy"); } catch { return "—"; } })() : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-caption font-medium px-2 py-0.5 rounded-full", statusColors[proc.status] ?? "bg-[var(--surface-2)] text-[var(--text-subtle)]")}>
                            {statusLabels[proc.status] ?? proc.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 50 && (
                <div className="px-4 py-3 text-center text-caption text-[var(--text-secondary)] border-t border-[var(--ds-border)]">
                  Показано 50 из {filtered.length} записей
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {expenseDialogOpen && (
        <ExpenseDialog
          expense={editingExpense}
          onClose={() => { setExpenseDialogOpen(false); setEditingExpense(null); }}
          onSuccess={handleExpenseSuccess}
        />
      )}
    </PageShell>
  );
}
