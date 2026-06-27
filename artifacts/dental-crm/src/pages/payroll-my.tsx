import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ChevronLeft, Wallet, Clock } from "lucide-react";
import { useGetMySalary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

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
    if (s === "paid")     return "bg-[#f0fdf4] text-[#16a34a]";
    if (s === "approved") return "bg-[#e0f2fe] text-[#0284c7]";
    return "bg-[#fef3c7] text-[#d97706]";
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
    <div className="min-h-full bg-[#faf8f4] font-manrope pb-10">
      {/* Header */}
      <div className="bg-white border-b border-[#e8e3d9] shadow-sm px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1 as unknown as string)} className="p-1.5 -ml-1 rounded-xl hover:bg-[#f1ede4] transition-colors">
          <ChevronLeft className="w-5 h-5 text-[#64748b]" />
        </button>
        <div>
          <h1 className="text-base font-bold text-[#0f172a]">{t("payroll.mySalary", "Моя зарплата")}</h1>
          {periodLabel && <p className="text-xs text-[#94a3b8]">{periodLabel}</p>}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
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
            {/* Main card */}
            <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-1">
                    {t("payroll.calculated", "Начислено")}
                  </p>
                  <p className="text-3xl font-bold text-[#0f172a] tracking-tight">
                    {fmt(salary.calculatedSalary)}
                  </p>
                </div>
                <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full mt-1", statusColor(salary.status))}>
                  {statusLabel(salary.status)}
                </span>
              </div>

              <div className="border-t border-[#e8e3d9] pt-4 space-y-2.5">
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
            <div className="bg-white rounded-2xl p-5 shadow-md border border-[#e8e3d9]">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#94a3b8]" />
                <p className="text-sm font-semibold text-[#0f172a]">{t("payroll.history", "История выплат")}</p>
              </div>
              <p className="text-xs text-[#94a3b8]">{t("payroll.historyComingSoon", "История за прошлые месяцы будет доступна в следующем обновлении")}</p>
            </div>
          </>
        )}
      </div>
    </div>
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
