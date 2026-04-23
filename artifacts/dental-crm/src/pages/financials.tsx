import { useState } from "react";
import {
  useListProcedures,
  useListUsers,
  useGetInventoryConsumption,
  useListExpenses,
  useDeleteExpense,
  useGetFinancialSummary,
  type ClinicExpense,
} from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import {
  Wallet, TrendingUp, TrendingDown, Package, ChevronLeft,
  Plus, Pencil, Trash2, Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import ExpenseDialog from "@/components/expense-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getBaseUrl } from "@/lib/base-url";

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#4B7BEC",
  materials: "#F9CA24",
  rent: "#6C5CE7",
  utilities: "#00B894",
  equipment: "#E17055",
  marketing: "#FD79A8",
  other: "#B2BEC3",
};

export default function FinancialsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "accountant";
  const canWrite = user?.role === "owner" || user?.role === "admin";

  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("completed");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ClinicExpense | null>(null);

  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  const { data: proceduresData, isLoading } = useListProcedures();
  const { data: usersData } = useListUsers();
  const { data: consumptionData } = useGetInventoryConsumption({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: expensesData, refetch: refetchExpenses } = useListExpenses({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: summaryData } = useGetFinancialSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { mutateAsync: doDelete } = useDeleteExpense();

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const users = usersData?.data?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const consumption = consumptionData?.data?.consumption ?? [];
  const expenses = expensesData?.data?.expenses ?? [];

  const filtered = allProcedures.filter((p) => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterDoctor && p.doctorId !== filterDoctor) return false;
    const pDate = p.completedAt ?? p.scheduledAt;
    if (dateFrom && pDate && pDate < dateFrom) return false;
    if (dateTo && pDate && pDate > dateTo + "T23:59:59") return false;
    return true;
  });

  const totalRevenue = summaryData?.data?.totalRevenue ?? filtered.reduce((acc, p) => acc + (p.price ?? 0), 0);
  const totalMaterialCost = summaryData?.data?.totalMaterialCost ?? consumption.reduce((a, r) => a + (r.totalCost ?? 0), 0);
  const totalOperationalExpenses = summaryData?.data?.totalOperationalExpenses ?? expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = summaryData?.data?.netProfit ?? (totalRevenue - totalMaterialCost - totalOperationalExpenses);
  const marginPct = summaryData?.data?.marginPct ?? (totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0);

  const expensesByCategory = summaryData?.data?.expensesByCategory ?? {};
  const pieData = Object.entries(expensesByCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: t(`expenses.cat.${k}`), value: v, key: k }));

  const revenueByDoctor: Record<string, { name: string; total: number; count: number }> = {};
  for (const p of filtered) {
    const doctorId = p.doctorId ?? "unassigned";
    const name = (p.doctorId && userMap.get(p.doctorId)) ?? t("financials.unassigned");
    if (!revenueByDoctor[doctorId]) {
      revenueByDoctor[doctorId] = { name, total: 0, count: 0 };
    }
    revenueByDoctor[doctorId]!.total += p.price ?? 0;
    revenueByDoctor[doctorId]!.count += 1;
  }

  const doctors = users.filter((u) => u.role === "doctor");

  function formatDate(d: string | null | undefined) {
    if (!d) return "—";
    try { return format(new Date(d), "dd.MM.yyyy"); } catch { return d; }
  }

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

  async function downloadBlob(path: string, filename: string) {
    const base = getBaseUrl();
    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("expenses.error"), variant: "destructive" });
    }
  }

  function handleExportExcel() {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    downloadBlob(`/api/analytics/export/excel?${qs.toString()}`, `financial-report-${dateFrom ?? "all"}-${dateTo ?? "all"}.xlsx`);
  }

  function handleExportPdf() {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    downloadBlob(`/api/analytics/export/pdf?${qs.toString()}`, `financial-report-${dateFrom ?? "all"}-${dateTo ?? "all"}.pdf`);
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">{t("financials.title")}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            title={t("financials.exportExcel")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            <FileSpreadsheet className="w-5 h-5" />
          </button>
          <button
            onClick={handleExportPdf}
            title={t("financials.exportPdf")}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 pb-24 space-y-4 max-w-full">
        {/* Date range */}
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* KPI cards: Revenue → Material Cost → Operational Expenses → Net Profit → Margin % */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-muted-foreground">{t("financials.totalRevenue")}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{totalRevenue.toLocaleString("ru-RU")} ₸</p>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("financials.procedures")}</p>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-muted-foreground">{t("financials.materialCost")}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{totalMaterialCost.toLocaleString("ru-RU")} ₸</p>
            <p className="text-xs text-muted-foreground mt-0.5">{consumption.length} {t("financials.materials")}</p>
          </div>

          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-xs font-semibold text-muted-foreground">{t("financials.opExpenses")}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{totalOperationalExpenses.toLocaleString("ru-RU")} ₸</p>
            <p className="text-xs text-muted-foreground mt-0.5">{expenses.length} {t("financials.expensesPcs")}</p>
          </div>

          <div className={`rounded-2xl border border-border/50 p-4 ${netProfit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              {netProfit >= 0
                ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                : <TrendingDown className="w-4 h-4 text-red-500" />}
              <span className="text-xs font-semibold text-muted-foreground">{t("financials.netProfit")}</span>
            </div>
            <p className={`text-xl font-bold ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {netProfit.toLocaleString("ru-RU")} ₸
            </p>
          </div>

          <div className={`col-span-2 rounded-2xl border border-border/50 p-4 ${netProfit >= 0 ? "bg-emerald-50/60" : "bg-red-50/60"}`}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className={`w-4 h-4 ${netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`} />
              <span className="text-xs font-semibold text-muted-foreground">{t("financials.margin")}</span>
            </div>
            <p className={`text-xl font-bold ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {marginPct}%
            </p>
          </div>
        </div>

        {/* Expense pie chart */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t("financials.expensesBreakdown")}</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                >
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

        {/* Operational Expenses section */}
        <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{t("financials.opExpensesList")}</span>
            {canCreate && (
              <button
                onClick={() => { setEditingExpense(null); setExpenseDialogOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("expenses.add")}
              </button>
            )}
          </div>
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t("expenses.empty")}</div>
          ) : (
            <div className="divide-y divide-border/50">
              {expenses.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-none"
                        style={{ backgroundColor: CATEGORY_COLORS[e.category] ?? "#B2BEC3" }}
                      />
                      <p className="text-sm font-medium text-foreground">
                        {t(`expenses.cat.${e.category}`)}
                        {e.subcategory && <span className="text-muted-foreground font-normal"> · {e.subcategory}</span>}
                      </p>
                    </div>
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 ml-4 truncate">{e.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5 ml-4">{formatDate(e.expenseDate)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className="text-sm font-semibold text-foreground mr-1">
                      {Number(e.amount).toLocaleString("ru-RU")} ₸
                    </p>
                    {canWrite && (
                      <>
                        <button
                          onClick={() => { setEditingExpense(e); setExpenseDialogOpen(true); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-muted-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!e.payrollRef && (
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
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

        {/* Material consumption breakdown */}
        {consumption.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50">
              <span className="text-sm font-semibold text-foreground">{t("financials.materialsBreakdown")}</span>
            </div>
            <div className="divide-y divide-border/50">
              {consumption.slice(0, 5).map((row) => (
                <div key={row.itemId} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{row.itemName}</p>
                    <p className="text-xs text-muted-foreground">{row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("financials.proceduresPcs")}</p>
                  </div>
                  <p className="text-sm font-semibold text-amber-700 shrink-0">
                    {(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸
                  </p>
                </div>
              ))}
              {consumption.length > 5 && (
                <div className="px-4 py-2 text-xs text-center text-muted-foreground">
                  +{consumption.length - 5} {t("financials.moreItems")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Revenue by doctor */}
        {Object.values(revenueByDoctor).length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t("financials.byDoctor")}</h3>
            <div className="space-y-2">
              {Object.values(revenueByDoctor)
                .sort((a, b) => b.total - a.total)
                .map((row) => (
                  <div key={row.name} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{row.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{row.count} {t("financials.pcs")}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">
                      {row.total.toLocaleString("ru-RU")} ₸
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Filters for procedure list */}
        <div className="flex gap-2">
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("financials.allDoctors")}</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("financials.allStatuses")}</option>
            <option value="completed">{t("financials.completed")}</option>
            <option value="scheduled">{t("financials.scheduled")}</option>
            <option value="in_progress">{t("financials.inProgress")}</option>
            <option value="cancelled">{t("financials.cancelled")}</option>
          </select>
        </div>

        {/* Procedures list */}
        <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50">
            <span className="text-sm font-semibold text-foreground">{t("financials.proceduresList")}</span>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">{t("financials.empty")}</div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.doctorId ? (userMap.get(p.doctorId) ?? t("financials.unassigned")) : t("financials.unassigned")}
                        {" · "}
                        {p.completedAt ? formatDate(p.completedAt) : formatDate(p.scheduledAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">
                        {(p.price ?? 0).toLocaleString("ru-RU")} ₸
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        p.status === "completed" ? "text-emerald-600" :
                        p.status === "cancelled" ? "text-destructive" :
                        p.status === "in_progress" ? "text-blue-600" : "text-amber-600"
                      }`}>
                        {t(`procedures.status.${p.status}`)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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
    </div>
  );
}
