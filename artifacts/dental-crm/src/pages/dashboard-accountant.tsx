import { useAuthStore } from "@/hooks/use-auth";
import {
  useGetOwnerAnalytics,
  getGetOwnerAnalyticsQueryKey,
  useListProcedures,
  useGetPayrollRecords,
  useGetFinancialSummary,
  type PayrollRecord,
} from "@workspace/api-client-react";
import {
  TrendingUp, Activity, Users, Star,
  RefreshCw, ChevronRight, Wallet,
  Stethoscope, Banknote, CheckCircle, Clock, PlusCircle,
  TrendingDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import PayrollApproveModal from "./payroll-approve-modal";
import ExpenseDialog from "@/components/expense-dialog";
import { useQueryClient } from "@tanstack/react-query";

function StatCard({
  titleKey,
  value,
  icon: Icon,
  delay = 0,
}: {
  titleKey: string;
  value: string | number;
  icon: React.ElementType;
  delay?: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md hover:shadow-lg transition-shadow group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-[#1f75fe]/5 rounded-full blur-2xl group-hover:bg-[#1f75fe]/10 transition-colors" />
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-[#f1ede4] text-[#1f75fe] rounded-xl ring-1 ring-[#e8e3d9]/50">
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-[#64748b] font-medium text-sm mb-1">{t(titleKey)}</h3>
      <div className="text-3xl font-display font-bold text-[#0f172a]">{value}</div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md animate-pulse">
      <div className="w-12 h-12 bg-[#f1ede4] rounded-xl mb-4" />
      <div className="w-24 h-4 bg-[#f1ede4] rounded mb-2" />
      <div className="w-20 h-8 bg-[#f1ede4] rounded" />
    </div>
  );
}

export default function AccountantDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const queryClient = useQueryClient();
  const today = new Date();

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();
  const { data: payrollData, refetch: refetchPayroll } = useGetPayrollRecords();
  const { data: summaryData } = useGetFinancialSummary({
    dateFrom: format(today, "yyyy-MM-dd"),
    dateTo: format(today, "yyyy-MM-dd"),
  });

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  const allRecords: PayrollRecord[] = payrollData?.data?.records ?? [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const thisMonthRecords = allRecords.filter(
    (r) => r.periodMonth === currentMonth && r.periodYear === currentYear,
  );
  const approvedThisMonth = thisMonthRecords.filter((r) => r.status === "approved" || r.status === "paid");
  const fotTotal = approvedThisMonth.reduce(
    (sum, r) => sum + Number(r.approvedAmount ?? r.calculatedAmount),
    0,
  );

  const analytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const procedures = proceduresData?.data?.procedures ?? [];

  const completedProcedures = procedures.filter((p) => p.status === "completed");
  const completedNoBilling = completedProcedures.filter((p) => !p.price || p.price === 0);

  const revenueByDoctor = completedProcedures.reduce<Record<string, { name: string; revenue: number; count: number }>>((acc, p) => {
    if (!p.doctorId || !p.doctorName) return acc;
    if (!acc[p.doctorId]) {
      acc[p.doctorId] = { name: p.doctorName, revenue: 0, count: 0 };
    }
    acc[p.doctorId].revenue += p.price ?? 0;
    acc[p.doctorId].count += 1;
    return acc;
  }, {});

  const doctorRevenueList = Object.entries(revenueByDoctor)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = doctorRevenueList.reduce((acc, d) => acc + d.revenue, 0);

  const fmt = (n: unknown) => {
    const num = Number(n ?? 0);
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
  };

  const fmtMoney = (n: unknown) => {
    const num = Number(n ?? 0);
    return `₸ ${num.toLocaleString("ru-KZ")}`;
  };

  const netProfit = summaryData?.data?.netProfit;
  const marginPct = summaryData?.data?.marginPct;

  const cards = [
    { titleKey: "dashboard.totalPatients",    value: fmt(analytics.totalPatients),                   icon: Users,      delay: 0 },
    { titleKey: "dashboard.revenue",          value: fmtMoney(analytics.revenueThisMonth),            icon: TrendingUp, delay: 0.05 },
    { titleKey: "dashboard.monthlyProcedures",value: fmt(analytics.completedProceduresThisMonth),     icon: Activity,   delay: 0.1 },
    { titleKey: "accountantDashboard.netProfit", value: netProfit !== undefined ? fmtMoney(netProfit) : "—", icon: netProfit !== undefined && netProfit >= 0 ? TrendingUp : TrendingDown, delay: 0.15 },
  ];

  return (
    <div className="space-y-4 p-4 pb-8 bg-[#faf8f4] font-manrope min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-sm">
        <div>
          <h2 className="text-3xl font-display font-bold text-[#0f172a]">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="text-[#64748b] mt-1 text-lg">
            {t("accountantDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="p-2.5 border border-[#e8e3d9] rounded-xl text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowExpenseDialog(true)}
            className="px-4 py-2.5 border border-[#1f75fe] text-[#1f75fe] font-semibold rounded-full hover:bg-[#1f75fe]/5 transition-all flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            {t("expenses.add")}
          </button>
          <button
            onClick={() => navigate("/financials")}
            className="px-5 py-2.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-semibold rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            {t("accountantDashboard.financials")}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <StatCard key={i} titleKey={c.titleKey} value={c.value} icon={c.icon} delay={c.delay} />
            ))}
      </div>

      {/* ─── ФОТ (Payroll Fund) Card ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-[#1f75fe]/10 rounded-xl">
              <Banknote className="w-5 h-5 text-[#1f75fe]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold font-display text-[#0f172a]">{t("payroll.fot")}</h3>
              <p className="text-xs text-[#64748b]">
                {`${currentMonth.toString().padStart(2, "0")}/${currentYear}`}
              </p>
            </div>
            <button
              onClick={() => setShowApproveModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white text-xs font-semibold rounded-full transition-all hover:scale-105 active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {t("payroll.approveFot", "Утвердить ФОТ")}
            </button>
          </div>

          <div className="text-3xl font-display font-bold text-[#0f172a] mb-3">
            ₸ {fotTotal.toLocaleString("ru-KZ")}
          </div>

          {approvedThisMonth.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#16a34a] flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {approvedThisMonth.length} {t("payroll.fotApproved", "сотр. утверждено")}
              </p>
              {approvedThisMonth.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 bg-[#f0fdf4] rounded-lg border border-[#f0fdf4]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0f172a] truncate">{r.userName ?? "—"}</p>
                    <p className="text-[11px] text-[#64748b]">
                      {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                    </p>
                  </div>
                  <span className="ml-2 text-xs font-bold text-[#16a34a]">
                    ₸{Number(r.approvedAmount ?? r.calculatedAmount).toLocaleString("ru-KZ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#64748b]">
              <Clock className="w-4 h-4" />
              <span className="text-xs">{t("payroll.fotNotApproved", "ФОТ за текущий месяц не утверждён")}</span>
            </div>
          )}
        </div>

        {/* Revenue by Doctor — computed from procedures (accessible to accountants) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold font-display flex items-center gap-2 text-[#0f172a]">
              <Stethoscope className="w-5 h-5 text-[#1f75fe]" />
              {t("accountantDashboard.revenueByDoctor")}
            </h3>
            <button
              onClick={() => navigate("/procedures")}
              className="text-sm text-[#1f75fe] font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {doctorRevenueList.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 text-[#94a3b8]/30 mx-auto mb-3" />
              <p className="text-[#64748b] font-medium">{t("accountantDashboard.noData")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {doctorRevenueList.map((d, i) => {
                const pct = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center text-[#1f75fe] font-bold text-xs flex-none">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-[#0f172a] truncate">{d.name}</span>
                        <div className="ml-2 flex-none text-right">
                          <span className="text-sm font-semibold text-[#0f172a]">
                            ₸ {d.revenue.toLocaleString("ru-KZ")}
                          </span>
                          <span className="text-xs text-[#64748b] ml-1">({d.count} {t("dashboard.procedures").toLowerCase()})</span>
                        </div>
                      </div>
                      <div className="w-full bg-[#f1ede4] rounded-full h-1.5">
                        <div
                          className="bg-[#1f75fe] rounded-full h-1.5 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div className="pt-3 mt-2 border-t border-[#e8e3d9] flex justify-between items-center">
                <span className="text-sm font-semibold text-[#64748b]">{t("accountantDashboard.totalRevenue")}</span>
                <span className="text-lg font-bold text-[#0f172a]">₸ {totalRevenue.toLocaleString("ru-KZ")}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Billing Queue */}
      <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
        <h3 className="text-lg font-bold font-display mb-4 flex items-center gap-2 text-[#0f172a]">
          <Wallet className="w-5 h-5 text-[#1f75fe]" />
          {t("accountantDashboard.billingQueue")}
          {completedNoBilling.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#d97706] ml-auto">
              {completedNoBilling.length}
            </span>
          )}
        </h3>
        {completedNoBilling.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-[#16a34a]" />
            </div>
            <p className="text-[#16a34a] font-semibold">{t("accountantDashboard.allBilled")}</p>
            <p className="text-sm text-[#64748b] mt-1">{t("accountantDashboard.allBilledDesc")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {completedNoBilling.slice(0, 6).map((proc) => (
              <div key={proc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#faf8f4]">
                <div className="w-2 h-2 rounded-full bg-[#d97706] flex-none" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0f172a] truncate">{proc.name}</p>
                  <p className="text-xs text-[#64748b]">{proc.doctorName ?? "—"}</p>
                </div>
              </div>
            ))}
            {completedNoBilling.length > 6 && (
              <button
                onClick={() => navigate("/procedures")}
                className="w-full text-center text-sm text-[#1f75fe] font-semibold mt-2 hover:underline"
              >
                +{completedNoBilling.length - 6} {t("accountantDashboard.more")}
              </button>
            )}
          </div>
        )}
      </div>

      {showApproveModal && (
        <PayrollApproveModal
          onClose={() => setShowApproveModal(false)}
          onSuccess={() => refetchPayroll()}
        />
      )}

      {showExpenseDialog && (
        <ExpenseDialog
          expense={null}
          onClose={() => setShowExpenseDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
            queryClient.invalidateQueries({ queryKey: ["/api/analytics/financial-summary"] });
          }}
        />
      )}
    </div>
  );
}
