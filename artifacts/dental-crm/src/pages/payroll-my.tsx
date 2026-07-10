import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Calculator, Clock, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMySalary } from "@workspace/api-client-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import type { FilterPreset } from "@/components/dashboard/owner-dashboard-shared";
import {
  buildSalaryBreakdown,
  formatSalaryPeriodLabel,
  getSalaryDateRange,
  LIST_PERIOD_PRESETS,
  parsePayrollPreset,
  salarySummaryHint,
  toSalaryDateParams,
} from "@/lib/payroll-period";

const fmt = (v: number | string | undefined) =>
  v !== undefined && v !== null
    ? `${Number(v).toLocaleString("ru")} ₸`
    : "—";

export default function PayrollMyPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [preset, setPreset] = useState<FilterPreset>(() => parsePayrollPreset(search));

  const dateRange = useMemo(() => getSalaryDateRange(preset), [preset]);
  const dateParams = useMemo(() => toSalaryDateParams(preset), [preset]);
  const periodLabel = formatSalaryPeriodLabel(dateRange.from, dateRange.to);

  const { data, isLoading } = useGetMySalary(dateParams, { query: { staleTime: 30_000 } });
  const salary = data?.data;

  const handleBack = () => {
    navigate("/dashboard/doctor");
  };

  const handlePresetChange = (next: FilterPreset) => {
    setPreset(next);
    navigate(`/payroll/my?preset=${next}`, { replace: true });
  };

  const statusColor = (s?: string) => {
    if (s === "paid") return "bg-[var(--success-light)] text-[#16a34a]";
    if (s === "approved") return "bg-[var(--info-light)] text-[var(--info)]";
    return "bg-[var(--warning-light)] text-[#d97706]";
  };

  const statusLabel = (s?: string) => {
    if (s === "paid") return t("payroll.statusPaid", "Выплачено");
    if (s === "approved") return t("payroll.statusApproved", "Утверждено");
    return t("payroll.statusPending", "Предварительно");
  };

  const breakdown = salary ? buildSalaryBreakdown(salary, t) : [];
  const revenueLabel =
    salary?.revenueScope === "clinic"
      ? t("payroll.clinicRevenue", "Выручка клиники за период")
      : t("payroll.myRevenue", "Ваша выручка за период");

  return (
    <PageShell className="pb-10">
      <PageHeader
        title={t("payroll.mySalary", "Моя зарплата")}
        onBack={handleBack}
        sticky
      />

      <div className="px-4 mt-4 space-y-3">
        <div
          className="flex gap-2 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {LIST_PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePresetChange(p.key)}
              className={cn(
                "shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors",
                preset === p.key
                  ? "bg-[var(--text)] text-white border-[var(--text)]"
                  : "bg-white text-[#0f172a] border-[#e8e3d9] hover:bg-[#faf8f4]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#94a3b8]">
          {t("payroll.period", "Период")}: {periodLabel}
        </p>

        {isLoading && (
          <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9] space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-[#f1ede4] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !salary && (
          <div className="bg-white rounded-2xl p-8 shadow-md border border-[#e8e3d9] text-center">
            <Wallet className="w-10 h-10 text-[#94a3b8] mx-auto mb-3" />
            <p className="text-sm text-[#64748b]">{t("payroll.noSettings", "Настройки зарплаты не заданы")}</p>
            <p className="text-xs text-[#94a3b8] mt-1">{t("payroll.contactAdmin", "Обратитесь к администратору")}</p>
          </div>
        )}

        {!isLoading && salary && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-1">
                    {t("payroll.calculated", "Начислено")}
                  </p>
                  <p className="text-3xl font-bold text-[#0f172a] tracking-tight">
                    {fmt(salary.calculatedSalary)}
                  </p>
                  <p className="text-xs text-[#64748b] mt-1">{salarySummaryHint(salary, t)}</p>
                </div>
                <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full mt-1", statusColor(salary.status))}>
                  {statusLabel(salary.status)}
                </span>
              </div>

              <p className="text-[11px] text-[#94a3b8] mb-4">
                {t(
                  "payroll.statusHint",
                  "Предварительно — расчёт по данным CRM. Утверждённая сумма фиксируется администратором в конце месяца.",
                )}
              </p>

              <div className="border-t border-[#e8e3d9] pt-4 space-y-2.5">
                <Row label={t("payroll.salaryType", "Тип")} value={
                  salary.salaryType === "fixed" ? t("payroll.fixed", "Оклад") :
                  salary.salaryType === "commission" ? t("payroll.commission", "Комиссия") :
                  salary.salaryType === "hourly" ? t("payroll.hourly", "Почасовая") :
                  t("payroll.fixedPlusCommission", "Оклад + %")
                } />
                <Row label={revenueLabel} value={fmt(salary.revenueThisMonth)} />
                {salary.approvedAmount !== undefined && salary.approvedAmount !== null && (
                  <Row label={t("payroll.approved", "Утверждено к выплате")} value={fmt(salary.approvedAmount)} highlight />
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9]">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-4 h-4 text-[#94a3b8]" />
                <p className="text-sm font-semibold text-[#0f172a]">
                  {t("payroll.calculationBreakdown", "Как считается")}
                </p>
              </div>
              <div className="space-y-3">
                {breakdown.map((line, idx) => (
                  <div
                    key={`${line.label}-${idx}`}
                    className={cn(
                      "flex items-start justify-between gap-3",
                      idx === breakdown.length - 1 && "pt-2 border-t border-[#e8e3d9]",
                    )}
                  >
                    <div className="min-w-0">
                      <span className={cn(
                        "text-xs",
                        idx === breakdown.length - 1 ? "font-semibold text-[#0f172a]" : "text-[#64748b]",
                      )}>
                        {line.label}
                      </span>
                      {line.hint && (
                        <p className="text-[11px] text-[#94a3b8] mt-0.5">{line.hint}</p>
                      )}
                    </div>
                    <span className={cn(
                      "text-sm font-semibold shrink-0 tabular-nums",
                      idx === breakdown.length - 1 ? "text-[#0f172a]" : "text-[#0f172a]",
                    )}>
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9]">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#94a3b8]" />
                <p className="text-sm font-semibold text-[#0f172a]">{t("payroll.history", "История выплат")}</p>
              </div>
              <p className="text-xs text-[#94a3b8]">
                {t("payroll.historyComingSoon", "История за прошлые месяцы будет доступна в следующем обновлении")}
              </p>
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
      <span className="text-xs text-[#64748b]">{label}</span>
      <span className={cn("text-sm font-semibold", highlight ? "text-[#16a34a]" : "text-[#0f172a]")}>
        {value}
      </span>
    </div>
  );
}
