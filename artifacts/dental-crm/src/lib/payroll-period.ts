import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  getPresetRange,
  LIST_PERIOD_PRESETS,
  type FilterPreset,
} from "@/components/dashboard/owner-dashboard-shared";
import type { MySalaryData } from "@workspace/api-client-react";

export { LIST_PERIOD_PRESETS };

const VALID_PRESETS = new Set<FilterPreset>(["today", "week", "month"]);

export function getSalaryDateRange(preset: FilterPreset) {
  const range = getPresetRange(preset);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  return { from: range.from, to };
}

export function toSalaryDateParams(preset: FilterPreset) {
  const { from, to } = getSalaryDateRange(preset);
  return {
    dateFrom: format(from, "yyyy-MM-dd"),
    dateTo: format(to, "yyyy-MM-dd"),
  };
}

export function formatSalaryPeriodLabel(from: Date, to: Date): string {
  if (format(from, "yyyy-MM-dd") === format(to, "yyyy-MM-dd")) {
    return format(from, "d MMMM yyyy", { locale: ru });
  }
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${format(from, "d")}–${format(to, "d MMMM yyyy", { locale: ru })}`;
  }
  return `${format(from, "d MMM yyyy", { locale: ru })} – ${format(to, "d MMM yyyy", { locale: ru })}`;
}

export function parsePayrollPreset(search: string): FilterPreset {
  const preset = new URLSearchParams(search).get("preset");
  if (preset && VALID_PRESETS.has(preset as FilterPreset)) {
    return preset as FilterPreset;
  }
  return "today";
}

export function payrollMyUrl(preset: FilterPreset) {
  return `/payroll/my?preset=${preset}`;
}

const fmtMoney = (v: number) => `${Number(v).toLocaleString("ru")} ₸`;

export type SalaryBreakdownLine = {
  label: string;
  value: string;
  hint?: string;
};

export function buildSalaryBreakdown(
  salary: MySalaryData,
  t: (key: string, fallback: string) => string,
): SalaryBreakdownLine[] {
  const lines: SalaryBreakdownLine[] = [];
  const revenue = salary.revenueThisMonth ?? 0;
  const pct = salary.commissionPercent ?? 0;
  const commissionPart = (revenue * pct) / 100;
  const effectiveFixed = salary.effectiveFixedAmount ?? salary.fixedAmount ?? 0;
  const hours = salary.workHours ?? 0;
  const hourlyRate = salary.fixedAmount ?? 0;

  if (salary.salaryType === "fixed") {
    if (effectiveFixed !== salary.fixedAmount) {
      lines.push({
        label: t("payroll.monthlyFixed", "Оклад за месяц"),
        value: fmtMoney(salary.fixedAmount),
      });
      lines.push({
        label: t("payroll.fixedForPeriod", "Оклад за период"),
        value: fmtMoney(effectiveFixed),
        hint: t("payroll.proratedHint", "Пропорционально количеству дней в периоде"),
      });
    } else {
      lines.push({
        label: t("payroll.fixedForPeriod", "Оклад за период"),
        value: fmtMoney(effectiveFixed),
      });
    }
  }

  if (salary.salaryType === "commission") {
    lines.push({
      label: t("payroll.commissionPart", "Процент от выручки"),
      value: fmtMoney(commissionPart),
      hint: `${pct}% × ${fmtMoney(revenue)}`,
    });
  }

  if (salary.salaryType === "fixed_plus_commission") {
    lines.push({
      label: t("payroll.fixedForPeriod", "Оклад за период"),
      value: fmtMoney(effectiveFixed),
      hint:
        effectiveFixed !== salary.fixedAmount
          ? t("payroll.proratedHint", "Пропорционально количеству дней в периоде")
          : undefined,
    });
    lines.push({
      label: t("payroll.commissionPart", "Процент от выручки"),
      value: fmtMoney(commissionPart),
      hint: `${pct}% × ${fmtMoney(revenue)}`,
    });
  }

  if (salary.salaryType === "hourly") {
    const hourlyPart = hourlyRate * hours;
    lines.push({
      label: t("payroll.hourlyPart", "Почасовая оплата"),
      value: fmtMoney(hourlyPart),
      hint: `${fmtMoney(hourlyRate)} / ч × ${hours.toFixed(1)} ч`,
    });
    if (pct > 0) {
      lines.push({
        label: t("payroll.commissionPart", "Процент от выручки"),
        value: fmtMoney(commissionPart),
        hint: `${pct}% × ${fmtMoney(revenue)}`,
      });
    }
  }

  lines.push({
    label: t("payroll.total", "Итого"),
    value: fmtMoney(salary.calculatedSalary),
  });

  return lines;
}

export function salarySummaryHint(
  salary: MySalaryData,
  t: (key: string, fallback: string) => string,
): string {
  const revenueLabel =
    salary.revenueScope === "clinic"
      ? t("payroll.clinicRevenue", "Выручка клиники")
      : t("payroll.myRevenue", "Ваша выручка");

  if (salary.salaryType === "fixed") {
    return t("payroll.hintFixed", "Оклад за выбранный период");
  }
  if (salary.salaryType === "commission") {
    return `${salary.commissionPercent}% ${t("payroll.ofRevenue", "от выручки")} · ${revenueLabel}`;
  }
  if (salary.salaryType === "fixed_plus_commission") {
    return `${t("payroll.fixed", "Оклад")} + ${salary.commissionPercent}% ${t("payroll.ofRevenue", "от выручки")}`;
  }
  if (salary.salaryType === "hourly") {
    return `${t("payroll.hourly", "Почасовая")} · ${Number(salary.workHours ?? 0).toFixed(1)} ч`;
  }
  return "";
}
