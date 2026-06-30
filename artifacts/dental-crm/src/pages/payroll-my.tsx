import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Wallet, Clock } from "lucide-react";
import { useGetMySalary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

const fmt = (v: number | string | undefined) =>
  v !== undefined && v !== null
    ? `${Number(v).toLocaleString("ru")} ₸`
    : "—";

export default function PayrollMyPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data, isLoading } = useGetMySalary();
  const salary = data?.data;

  const statusColor = (s?: string) => {
    if (s === "paid")     return "bg-[var(--success-light)] text-[var(--success)]";
    if (s === "approved") return "bg-[var(--info-light)] text-[var(--info)]";
    return "bg-[var(--warning-light)] text-[var(--warning)]";
  };

  const statusLabel = (s?: string) => {
    if (s === "paid")     return t("payroll.statusPaid", "Выплачено");
    if (s === "approved") return t("payroll.statusApproved", "Утверждено");
    return t("payroll.statusPending", "Предварительно");
  };

  const periodLabel = salary?.period
    ? new Date(salary.period.year, salary.period.month - 1).toLocaleDateString("ru", { month: "long", year: "numeric" })
    : null;

  return (
    <PageShell className="pb-10">
      <PageHeader
        title={t("payroll.mySalary", "Моя зарплата")}
        onBack={() => navigate(-1 as unknown as string)}
        sticky
      />

      <div className="px-4 mt-4 space-y-3">
        {periodLabel && (
          <p className="text-xs text-[var(--text-subtle)] -mt-1">{periodLabel}</p>
        )}
        {isLoading && (
          <div className="bg-[var(--surface)] rounded-2xl p-5 shadow-md border border-[var(--border)] space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-[var(--surface-2)] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !salary && (
          <div className="bg-[var(--surface)] rounded-2xl p-8 shadow-md border border-[var(--border)] text-center">
            <Wallet className="w-10 h-10 text-[var(--text-subtle)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">{t("payroll.noSettings", "Настройки зарплаты не заданы")}</p>
            <p className="text-xs text-[var(--text-subtle)] mt-1">{t("payroll.contactAdmin", "Обратитесь к администратору")}</p>
          </div>
        )}

        {!isLoading && salary && (
          <>
            {/* Main card */}
            <div className="bg-[var(--surface)] rounded-2xl p-5 shadow-md border border-[var(--border)]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide mb-1">
                    {t("payroll.calculated", "Начислено")}
                  </p>
                  <p className="text-3xl font-bold text-[var(--text)] tracking-tight">
                    {fmt(salary.calculatedSalary)}
                  </p>
                </div>
                <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full mt-1", statusColor(salary.status))}>
                  {statusLabel(salary.status)}
                </span>
              </div>

              <div className="border-t border-[var(--border)] pt-4 space-y-2.5">
                <Row label={t("payroll.salaryType", "Тип")} value={
                  salary.salaryType === "fixed"                ? t("payroll.fixed", "Оклад") :
                  salary.salaryType === "commission"           ? t("payroll.commission", "Комиссия") :
                                                                 t("payroll.fixedPlusCommission", "Оклад + %")
                } />
                {(salary.salaryType === "fixed" || salary.salaryType === "fixed_plus_commission") && (
                  <Row label={t("payroll.fixedAmount", "Оклад")} value={fmt(salary.fixedAmount)} />
                )}
                {(salary.salaryType === "commission" || salary.salaryType === "fixed_plus_commission") && (
                  <Row label={t("payroll.commissionPercent", "Процент")} value={`${salary.commissionPercent}%`} />
                )}
                <Row label={t("payroll.revenue", "Выручка за период")} value={fmt(salary.revenueThisMonth)} />
                {salary.approvedAmount !== undefined && salary.approvedAmount !== null && (
                  <Row label={t("payroll.approved", "Утверждено к выплате")} value={fmt(salary.approvedAmount)} highlight />
                )}
              </div>
            </div>

            {/* History placeholder */}
            <div className="bg-[var(--surface)] rounded-2xl p-5 shadow-md border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[var(--text-subtle)]" />
                <p className="text-sm font-semibold text-[var(--text)]">{t("payroll.history", "История выплат")}</p>
              </div>
              <p className="text-xs text-[var(--text-subtle)]">{t("payroll.historyComingSoon", "История за прошлые месяцы будет доступна в следующем обновлении")}</p>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <span className={cn("text-sm font-semibold", highlight ? "text-[var(--success)]" : "text-[var(--text)]")}>
        {value}
      </span>
    </div>
  );
}
