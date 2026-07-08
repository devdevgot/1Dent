import { useAuthStore } from "@/hooks/use-auth";
import { useEffect } from "react";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";
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
      className="dash-stat-card group"
    >
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="dash-stat-icon">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <h3 className="dash-stat-label relative z-10">{t(titleKey)}</h3>
      <div className="dash-stat-value relative z-10">{value}</div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="dash-stat-card">
      <div className="dash-skeleton w-11 h-11 rounded-xl mb-4" />
      <div className="dash-skeleton w-24 h-4 rounded mb-2" />
      <div className="dash-skeleton w-20 h-8 rounded" />
    </div>
  );
}

export default function AccountantDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const queryClient = useQueryClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  const { data: analyticsData, isLoading, refetch } = useGetOwnerAnalytics({
    query: { queryKey: getGetOwnerAnalyticsQueryKey() },
  });
  const { data: proceduresData, isLoading: proceduresLoading } = useListProcedures();
  const { data: payrollData, refetch: refetchPayroll } = useGetPayrollRecords();
  const { data: summaryData } = useGetFinancialSummary({
    dateFrom: todayStr,
    dateTo: todayStr,
  });

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);

  const allRecords: PayrollRecord[] = payrollData?.data?.records ?? [];
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

  const monthStartDate = startOfMonth(now);
  const monthEndDate = endOfMonth(now);
  const completedProcedures = procedures.filter((p) => {
    if (p.status !== "completed" || !p.completedAt) return false;
    const d = new Date(p.completedAt);
    return d >= monthStartDate && d <= monthEndDate;
  });
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

  useEffect(() => {
    document.title = SITE.dashboardTitles.accountant;
  }, []);

  return (
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner dash-stack">
      <div className="dash-page-header">
        <div>
          <h2 className="dash-page-title">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="dash-page-subtitle">
            {t("accountantDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            aria-label={t("common.refresh", "Обновить")}
            onClick={() => refetch()}
            className="dash-btn-icon"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowExpenseDialog(true)}
            className="dash-btn dash-btn-secondary"
          >
            <PlusCircle className="w-4 h-4" />
            {t("expenses.add")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/financials")}
            className="dash-btn dash-btn-primary"
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
        <div className="dash-card dash-card-padded dash-card-elevated">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-[var(--primary-light)] rounded-xl">
              <Banknote className="w-5 h-5 text-[var(--ds-primary)]" />
            </div>
            <div className="flex-1">
              <h3 className="dash-section-title text-sm">{t("payroll.fot")}</h3>
              <p className="text-caption text-[var(--text-secondary)]">
                {`${currentMonth.toString().padStart(2, "0")}/${currentYear}`}
              </p>
            </div>
            <button
              onClick={() => setShowApproveModal(true)}
              className="dash-btn dash-btn-primary text-caption py-1.5 px-3"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {t("payroll.approveFot", "Утвердить ФОТ")}
            </button>
          </div>

          <div className="dash-stat-value text-3xl mb-3">
            ₸ {fotTotal.toLocaleString("ru-KZ")}
          </div>

          {approvedThisMonth.length > 0 ? (
            <div className="space-y-2">
              <p className="text-caption font-semibold text-[var(--success)] flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {approvedThisMonth.length} {t("payroll.fotApproved", "сотр. утверждено")}
              </p>
              {approvedThisMonth.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 bg-[var(--success-light)] rounded-lg border border-[var(--success-light)]"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-semibold text-[var(--text)] truncate">{r.userName ?? "—"}</p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                    </p>
                  </div>
                  <span className="ml-2 text-caption font-bold text-[var(--success)]">
                    ₸{Number(r.approvedAmount ?? r.calculatedAmount).toLocaleString("ru-KZ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Clock className="w-4 h-4" />
              <span className="text-xs">{t("payroll.fotNotApproved", "ФОТ за текущий месяц не утверждён")}</span>
            </div>
          )}
        </div>

        {/* Revenue by Doctor — computed from procedures (accessible to accountants) */}
        <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated">
          <div className="flex items-center justify-between mb-6">
            <h3 className="dash-section-title text-lg">
              <Stethoscope className="w-5 h-5 text-[var(--ds-primary)]" />
              {t("accountantDashboard.revenueByDoctor")}
            </h3>
            <button
              onClick={() => navigate("/procedures")}
              className="text-body text-[var(--ds-primary)] font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {proceduresLoading ? (
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="dash-skeleton w-8 h-8 rounded-full flex-none" />
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="dash-skeleton h-4 w-32 rounded" />
                      <div className="dash-skeleton h-4 w-20 rounded" />
                    </div>
                    <div className="dash-skeleton h-1.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : doctorRevenueList.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 text-[var(--text-subtle)]/30 mx-auto mb-3" />
              <p className="text-[var(--text-secondary)] font-medium">{t("accountantDashboard.noData")}</p>
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
                    <div className="w-8 h-8 rounded-full bg-[var(--primary-light)] flex items-center justify-center text-[var(--ds-primary)] font-bold text-caption flex-none">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-body font-medium text-[var(--text)] truncate">{d.name}</span>
                        <div className="ml-2 flex-none text-right">
                          <span className="text-body font-semibold text-[var(--text)]">
                            ₸ {d.revenue.toLocaleString("ru-KZ")}
                          </span>
                          <span className="text-caption text-[var(--text-secondary)] ml-1">({d.count} {t("dashboard.procedures").toLowerCase()})</span>
                        </div>
                      </div>
                      <div className="w-full bg-[var(--surface-2)] rounded-full h-1.5">
                        <div
                          className="bg-[#1f75fe] rounded-full h-1.5 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div className="pt-3 mt-2 border-t border-[var(--ds-border)] flex justify-between items-center">
                <span className="text-body font-semibold text-[var(--text-secondary)]">{t("accountantDashboard.totalRevenue")}</span>
                <span className="text-lg font-bold text-[var(--text)]">₸ {totalRevenue.toLocaleString("ru-KZ")}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Billing Queue */}
      <div className="dash-card dash-card-padded dash-card-elevated">
        <h3 className="dash-section-title text-lg mb-4">
          <Wallet className="w-5 h-5 text-[var(--ds-primary)]" />
          {t("accountantDashboard.billingQueue")}
          {completedNoBilling.length > 0 && (
            <span className="dash-badge dash-badge-warning ml-auto">
              {completedNoBilling.length}
            </span>
          )}
        </h3>
        {proceduresLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="dash-skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : completedNoBilling.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-[var(--success-light)] rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-[var(--success)]" />
            </div>
            <p className="text-[var(--success)] font-semibold">{t("accountantDashboard.allBilled")}</p>
            <p className="text-body text-[var(--text-secondary)] mt-1">{t("accountantDashboard.allBilledDesc")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {completedNoBilling.slice(0, 6).map((proc) => (
              <div key={proc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg)]">
                <div className="w-2 h-2 rounded-full bg-[var(--warning)] flex-none" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-[var(--text)] truncate">{proc.name}</p>
                  <p className="text-caption text-[var(--text-secondary)]">{proc.doctorName ?? "—"}</p>
                </div>
              </div>
            ))}
            {completedNoBilling.length > 6 && (
              <button
                onClick={() => navigate("/procedures")}
                className="w-full text-center text-body text-[var(--ds-primary)] font-semibold mt-2 hover:underline"
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
    </div>
  );
}
