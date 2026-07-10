import { useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { useGetMySalary } from "@workspace/api-client-react";
import {
  fmtRevenue,
  LIST_PERIOD_PRESETS,
  type FilterPreset,
} from "@/components/dashboard/owner-dashboard-shared";
import {
  formatSalaryPeriodLabel,
  getSalaryDateRange,
  payrollMyUrl,
  salarySummaryHint,
  toSalaryDateParams,
} from "@/lib/payroll-period";

const SALARY_ICON = "/icons/menu/financials.png";

type MySalaryCardProps = {
  listPreset: FilterPreset;
  onListPresetChange: (preset: FilterPreset) => void;
};

function salaryTypeLabel(
  type: string | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (type === "fixed") return t("payroll.fixed", "Оклад");
  if (type === "commission") return t("payroll.commission", "Комиссия");
  if (type === "hourly") return t("payroll.hourly", "Почасовая");
  if (type === "fixed_plus_commission") return t("payroll.fixedPlusCommission", "Оклад + %");
  return t("payroll.calculated", "Начислено");
}

export function MySalaryCard({ listPreset, onListPresetChange }: MySalaryCardProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user } = useAuthStore();

  const dateRange = useMemo(() => getSalaryDateRange(listPreset), [listPreset]);
  const dateParams = useMemo(() => toSalaryDateParams(listPreset), [listPreset]);
  const periodLabel = formatSalaryPeriodLabel(dateRange.from, dateRange.to);

  const { data, isLoading } = useGetMySalary(
    dateParams,
    { query: { staleTime: 30_000 } },
  );

  const salary = data?.data;
  const displayName = salary?.userName?.trim() || user?.name?.trim() || t("payroll.mySalary", "Моя зарплата");
  const subtitle = salary
    ? salarySummaryHint(salary, t) || salaryTypeLabel(salary.salaryType, t)
    : t("payroll.noSettings", "Настройки не заданы");

  const openDetails = () => navigate(payrollMyUrl(listPreset));

  return (
    <div className="mx-4 mt-4 bg-white rounded-3xl border border-[#e8e3d9] shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[22px] font-bold text-[#0f172a] tracking-tight">
          {t("payroll.mySalary", "Моя зарплата")}
        </h2>
        <p className="text-xs text-[#94a3b8] mt-1">
          {t("payroll.cardHint", "Предварительный расчёт за выбранный период")}
        </p>
        <div
          className="flex gap-2 mt-3 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {LIST_PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onListPresetChange(p.key)}
              className={cn(
                "shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors",
                listPreset === p.key
                  ? "bg-[var(--text)] text-white border-[var(--text)]"
                  : "bg-white text-[#0f172a] border-[#e8e3d9] hover:bg-[#faf8f4]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[#f1ede4]">
        <button
          type="button"
          onClick={openDetails}
          className="flex items-center gap-3.5 w-full px-5 py-3.5 text-left hover:bg-[#faf8f4] active:bg-[#f1ede4] transition-colors"
        >
          <div
            className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: "#EDFBF2" }}
          >
            <img
              src={SALARY_ICON}
              alt=""
              aria-hidden
              className="w-[44px] h-[44px] object-contain drop-shadow-sm"
              draggable={false}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-[#0f172a] truncate">{displayName}</p>
            <p className="text-xs text-[#64748b] mt-0.5 truncate">{subtitle}</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5 truncate">{periodLabel}</p>
          </div>
          <div className="shrink-0 text-right">
            {isLoading ? (
              <div className="h-4 w-16 rounded bg-[#f1ede4] animate-pulse ml-auto" />
            ) : salary ? (
              <p className="font-bold text-sm text-[#0f172a] tabular-nums">
                {fmtRevenue(salary.calculatedSalary)}
              </p>
            ) : (
              <p className="text-xs text-[#94a3b8]">—</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-[#64748b] shrink-0" />
        </button>
      </div>

      <button
        type="button"
        onClick={openDetails}
        className="mx-4 my-4 w-[calc(100%-2rem)] py-3.5 rounded-2xl bg-[#f1ede4] hover:bg-[#e8e3d9] text-[#0f172a] text-sm font-semibold transition-colors flex items-center justify-center gap-1"
      >
        {t("payroll.details", "Подробнее")}
        <ChevronRight className="w-4 h-4 text-[#64748b]" />
      </button>
    </div>
  );
}
