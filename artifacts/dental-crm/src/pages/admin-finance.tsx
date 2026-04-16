import { useState, useMemo } from "react";
import { useListProcedures, useListUsers, useListPatients, useUpdateProcedurePayment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  AlertCircle,
  BarChart3,
  Search,
  ChevronDown,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, parseISO } from "date-fns";

type Period = "day" | "week" | "month" | "year" | "custom";

const BRAND_GREEN = "#98cc1c";
const PIE_COLORS = [BRAND_GREEN, "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi Transfer",
  cash:           "Наличные",
  kaspi_qr:       "Kaspi QR",
  terminal:       "Терминал",
  kaspi_red:      "Kaspi Red",
  debt:           "Долг",
};

const formatMoney = (v: number) => v.toLocaleString("ru-RU") + " ₸";

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
  bg = "bg-primary/10",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  bg?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bg)}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminFinancePage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("month");
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

  const queryClient = useQueryClient();
  const updatePayment = useUpdateProcedurePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/procedures"] });
        setSelectingPayment(null);
      },
    },
  });

  const { data: proceduresData, isLoading } = useListProcedures();
  const { data: usersData } = useListUsers();
  const { data: patientsData } = useListPatients();

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
    if (period === "custom") {
      const d = new Date(customTo);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    return null;
  }, [period, customTo]);

  const filtered = useMemo(() => {
    return allProcedures.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterDoctorId && p.doctorId !== filterDoctorId) return false;
      if (filterPatientId && p.patientId !== filterPatientId) return false;
      if (p.paymentMethod == null) return false;
      if (filterPaymentMethod && p.paymentMethod !== filterPaymentMethod) return false;
      const date = p.completedAt ?? p.scheduledAt;
      if (!date) return false;
      try {
        const d = parseISO(date);
        if (d < periodStart) return false;
        if (periodEnd && d > periodEnd) return false;
        return true;
      } catch {
        return false;
      }
    });
  }, [allProcedures, filterStatus, filterDoctorId, filterPatientId, filterPaymentMethod, periodStart, periodEnd]);

  const debtProcedures = useMemo(() => {
    return allProcedures.filter(
      (p) => p.status === "completed" && (!p.price || p.price === 0),
    );
  }, [allProcedures]);

  const pendingProcedures = useMemo(() => {
    return allProcedures.filter(
      (p) => p.status === "completed" && p.paymentMethod == null,
    );
  }, [allProcedures]);

  const totalRevenue = filtered.reduce((acc, p) => acc + (p.price ?? 0), 0);
  const avgCheck = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;
  const paymentsCount = filtered.length;
  const debtCount = debtProcedures.length;

  const chartData = useMemo(() => {
    const buckets: Record<string, number> = {};

    for (const p of filtered) {
      const dateStr = p.completedAt ?? p.scheduledAt;
      if (!dateStr) continue;
      try {
        const d = parseISO(dateStr);
        let key: string;
        if (period === "day") {
          key = format(d, "HH:00");
        } else if (period === "week") {
          key = format(d, "EEE");
        } else if (period === "month" || period === "custom") {
          key = format(d, "d.MM");
        } else {
          key = format(d, "MM.yyyy");
        }
        buckets[key] = (buckets[key] ?? 0) + (p.price ?? 0);
      } catch {
        // skip
      }
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
      .map(([method, value]) => ({
        name: PAYMENT_METHOD_LABELS[method] ?? method,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topProcedures = useMemo(() => {
    const byName: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const p of filtered) {
      if (!p.price) continue;
      if (!byName[p.name]) byName[p.name] = { name: p.name, revenue: 0, count: 0 };
      byName[p.name]!.revenue += p.price;
      byName[p.name]!.count += 1;
    }
    return Object.values(byName).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filtered]);

  const filteredPatientSearch = useMemo(() => {
    if (!patientSearch.trim()) return allPatients.slice(0, 8);
    const q = patientSearch.toLowerCase();
    return allPatients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 8);
  }, [allPatients, patientSearch]);

  const selectedPatient = allPatients.find((p) => p.id === filterPatientId);

  const PERIODS: { key: Period; label: string }[] = [
    { key: "day",    label: t("adminFinance.day") },
    { key: "week",   label: t("adminFinance.week") },
    { key: "month",  label: t("adminFinance.month") },
    { key: "year",   label: t("adminFinance.year") },
    { key: "custom", label: t("adminFinance.custom") },
  ];

  return (
    <div className="p-6 pb-12 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("adminFinance.title")}</h1>
            <p className="text-sm text-gray-500">{t("adminFinance.subtitle")}</p>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors",
                period === p.key ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {period === "custom" && (
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 w-fit">
          <span className="text-sm text-gray-500 font-medium">{t("adminFinance.from")}</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="text-sm text-gray-500 font-medium">{t("adminFinance.to")}</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label={t("adminFinance.totalRevenue")}
          value={formatMoney(totalRevenue)}
          sub={`${paymentsCount} ${t("adminFinance.procedure")}`}
          color="text-emerald-600"
          bg="bg-emerald-100"
        />
        <KpiCard
          icon={BarChart3}
          label={t("adminFinance.avgCheck")}
          value={formatMoney(avgCheck)}
          sub={t("adminFinance.procedure")}
          color="text-blue-600"
          bg="bg-blue-100"
        />
        <KpiCard
          icon={CreditCard}
          label={t("adminFinance.paymentsCount")}
          value={String(paymentsCount)}
          sub={t("adminFinance.procedure")}
          color="text-violet-600"
          bg="bg-violet-100"
        />
        <button
          onClick={() => setShowDebts(!showDebts)}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:border-red-200 transition-colors group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t("adminFinance.debts")}</span>
            <ChevronDown className={cn(
              "w-4 h-4 text-gray-400 ml-auto transition-transform",
              showDebts ? "rotate-180" : "",
            )} />
          </div>
          <p className="text-2xl font-bold text-red-600">{String(debtCount)}</p>
          <p className="text-xs text-gray-400 mt-1">{t("adminFinance.proceduresWithoutPrice")}</p>
        </button>
      </div>

      {/* Debts panel */}
      {showDebts && debtProcedures.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-red-50 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="text-base font-bold text-gray-900">{t("adminFinance.debtsList")}</h2>
            <span className="ml-auto text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              {debtProcedures.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colPatient")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colDoctor")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colService")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {debtProcedures.slice(0, 20).map((proc) => {
                  const dateStr = proc.completedAt ?? proc.scheduledAt;
                  return (
                    <tr key={proc.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {patientMap.get(proc.patientId ?? "") ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">{proc.name}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {dateStr
                          ? (() => {
                              try { return format(parseISO(dateStr), "dd.MM.yyyy"); }
                              catch { return "—"; }
                            })()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending payments section */}
      {pendingProcedures.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowPending(!showPending)}
            className="w-full px-5 py-4 border-b border-amber-100 flex items-center gap-2 hover:bg-amber-50/50 transition-colors"
          >
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-bold text-gray-900">Ожидают оплаты</h2>
            <span className="ml-1 text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              {pendingProcedures.length}
            </span>
            <ChevronDown className={cn("w-4 h-4 text-gray-400 ml-auto transition-transform", showPending ? "rotate-180" : "")} />
          </button>
          {showPending && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Пациент</th>
                    <th className="px-5 py-3 text-left">Врач</th>
                    <th className="px-5 py-3 text-left">Услуга</th>
                    <th className="px-5 py-3 text-right">Сумма</th>
                    <th className="px-5 py-3 text-left">Дата</th>
                    <th className="px-5 py-3 text-left">Оплата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingProcedures.map((proc) => {
                    const dateStr = proc.completedAt ?? proc.scheduledAt;
                    const isSelecting = selectingPayment === proc.id;
                    const isSaving = updatePayment.isPending;
                    return (
                      <tr key={proc.id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {patientMap.get(proc.patientId ?? "") ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">{proc.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {proc.price ? formatMoney(proc.price) : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                          {dateStr ? (() => { try { return format(parseISO(dateStr), "dd.MM.yyyy"); } catch { return "—"; } })() : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {isSelecting ? (
                            <div className="flex flex-wrap gap-1.5">
                              {(["cash", "kaspi_qr", "kaspi_transfer", "terminal", "kaspi_red", "debt"] as const).map((method) => (
                                <button
                                  key={method}
                                  disabled={isSaving}
                                  onClick={() => updatePayment.mutate({ id: proc.id, data: { paymentMethod: method } })}
                                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                                >
                                  {PAYMENT_METHOD_LABELS[method]}
                                </button>
                              ))}
                              <button
                                onClick={() => setSelectingPayment(null)}
                                className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectingPayment(proc.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Отметить оплату
                            </button>
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
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t("adminFinance.revenueChart")}
          </h2>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              {t("adminFinance.noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number) => [formatMoney(v), t("adminFinance.totalRevenue")]}
                  contentStyle={{ borderRadius: 12, fontSize: 13 }}
                />
                <Bar dataKey="revenue" fill={BRAND_GREEN} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment methods pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{t("adminFinance.paymentMethods")}</h2>
          {paymentMethodData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              {t("adminFinance.noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {paymentMethodData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top procedures */}
      {topProcedures.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{t("adminFinance.topProcedures")}</h2>
          <div className="space-y-3">
            {topProcedures.map((proc, i) => {
              const maxRevenue = topProcedures[0]?.revenue ?? 1;
              const pct = Math.round((proc.revenue / maxRevenue) * 100);
              return (
                <div key={proc.name} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{proc.name}</span>
                      <span className="text-sm font-bold text-emerald-700 shrink-0 ml-2">{formatMoney(proc.revenue)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{proc.count} {t("adminFinance.procedure")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payments table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table filters */}
        <div className="px-5 py-4 border-b border-gray-50 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <h2 className="text-base font-bold text-gray-900 flex-1">{t("adminFinance.paymentsTable")}</h2>

            <select
              value={filterDoctorId}
              onChange={(e) => setFilterDoctorId(e.target.value)}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none"
            >
              <option value="">{t("adminFinance.allDoctors")}</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none"
            >
              <option value="">{t("adminFinance.allStatuses")}</option>
              <option value="completed">{t("adminFinance.completed")}</option>
              <option value="scheduled">{t("adminFinance.scheduled")}</option>
              <option value="in_progress">{t("adminFinance.inProgress")}</option>
              <option value="cancelled">{t("adminFinance.cancelled")}</option>
            </select>

            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none"
            >
              <option value="">{t("adminFinance.allPayments")}</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Patient search filter */}
          <div className="relative w-full sm:w-72">
            {selectedPatient ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-sm">
                <span className="font-medium text-gray-800 flex-1 truncate">{selectedPatient.name}</span>
                <button
                  onClick={() => { setFilterPatientId(""); setPatientSearch(""); }}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary text-sm">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setShowPatientList(true); }}
                  onFocus={() => setShowPatientList(true)}
                  placeholder={t("adminFinance.filterPatient")}
                  className="flex-1 bg-transparent outline-none"
                />
              </div>
            )}

            {showPatientList && !selectedPatient && (
              <div className="absolute z-20 mt-1.5 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {filteredPatientSearch.length === 0 ? (
                  <div className="p-3 text-sm text-gray-400 text-center">{t("adminAppointment.noPatients")}</div>
                ) : (
                  filteredPatientSearch.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFilterPatientId(p.id);
                        setPatientSearch(p.name);
                        setShowPatientList(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{p.phone}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t("adminFinance.noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colPatient")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colDoctor")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colService")}</th>
                  <th className="px-5 py-3 text-right">{t("adminFinance.colAmount")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colPayment")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colDate")}</th>
                  <th className="px-5 py-3 text-left">{t("adminFinance.colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.slice(0, 50).map((proc) => {
                  const statusColors: Record<string, string> = {
                    scheduled:   "bg-blue-100 text-blue-700",
                    in_progress: "bg-amber-100 text-amber-700",
                    completed:   "bg-green-100 text-green-700",
                    cancelled:   "bg-gray-100 text-gray-500",
                  };
                  const dateStr = proc.completedAt ?? proc.scheduledAt;
                  const paymentLabel = proc.paymentMethod == null ? "Ожидает" : (PAYMENT_METHOD_LABELS[proc.paymentMethod] ?? proc.paymentMethod ?? "—");
                  return (
                    <tr key={proc.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {patientMap.get(proc.patientId ?? "") ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {proc.doctorId ? (doctorMap.get(proc.doctorId) ?? "—") : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">{proc.name}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                        {proc.price ? formatMoney(proc.price) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{paymentLabel}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {dateStr
                          ? (() => {
                              try { return format(parseISO(dateStr), "dd.MM.yyyy"); }
                              catch { return "—"; }
                            })()
                          : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          statusColors[proc.status ?? "scheduled"] ?? "bg-gray-100 text-gray-500",
                        )}>
                          {proc.status === "scheduled"   ? t("adminFinance.scheduled")  :
                           proc.status === "completed"   ? t("adminFinance.completed")  :
                           proc.status === "in_progress" ? t("adminFinance.inProgress") :
                           proc.status === "cancelled"   ? t("adminFinance.cancelled")  :
                           proc.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
