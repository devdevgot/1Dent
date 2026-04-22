import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  usePreviewPayroll,
  useApprovePayrollPeriod,
  type PayrollPreviewRow,
} from "@workspace/api-client-react";

interface PayrollApproveModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

export default function PayrollApproveModal({ onClose, onSuccess }: PayrollApproveModalProps) {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const { data: previewData, isFetching } = usePreviewPayroll(year, month);
  const { mutateAsync: approvePeriod, isPending: approving } = useApprovePayrollPeriod();

  const rows: PayrollPreviewRow[] = previewData?.data?.preview ?? [];

  const getApproved = (row: PayrollPreviewRow) =>
    overrides[row.userId] !== undefined ? overrides[row.userId] : row.calculatedAmount;

  const totalFot = rows.reduce((sum, r) => sum + getApproved(r), 0);

  const handleOverride = (userId: string, value: number) => {
    setOverrides((prev) => ({ ...prev, [userId]: value }));
  };

  const handleApprove = async () => {
    if (rows.length === 0) return;
    await approvePeriod({
      year,
      month,
      employees: rows.map((r) => ({
        userId: r.userId,
        approvedAmount: getApproved(r),
      })),
    });
    onSuccess?.();
    onClose();
  };

  const MONTH_NAMES = [
    t("months.january", "Январь"),
    t("months.february", "Февраль"),
    t("months.march", "Март"),
    t("months.april", "Апрель"),
    t("months.may", "Май"),
    t("months.june", "Июнь"),
    t("months.july", "Июль"),
    t("months.august", "Август"),
    t("months.september", "Сентябрь"),
    t("months.october", "Октябрь"),
    t("months.november", "Ноябрь"),
    t("months.december", "Декабрь"),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold font-display">{t("payroll.approveTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("payroll.approveSubtitle", "Утвердите ФОТ за период и зафиксируйте расход")}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-border shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">{t("payroll.year", "Год")}</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setOverrides({}); }}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">{t("payroll.month", "Месяц")}</label>
            <select
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setOverrides({}); }}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isFetching ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t("common.loading", "Загрузка...")}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t("payroll.noStaffSettings", "Нет сотрудников с настроенной зарплатой")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{t("payroll.employee", "Сотрудник")}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">{t("payroll.revenueBase")}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">{t("payroll.calculated")}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">{t("payroll.approved")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.userName || "—"}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{row.userRole}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      ₸{row.revenueBase.toLocaleString("ru-KZ")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      ₸{row.calculatedAmount.toLocaleString("ru-KZ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        value={getApproved(row)}
                        onChange={(e) => handleOverride(row.userId, Number(e.target.value))}
                        className="w-28 h-8 px-2 rounded-lg border border-border bg-background text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-foreground">
                    {t("payroll.fotTotal", "Итого ФОТ")}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-primary">
                    ₸{totalFot.toLocaleString("ru-KZ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleApprove}
            disabled={approving || rows.length === 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {approving ? t("payroll.approving") : t("payroll.approveAndRecord", `Утвердить ФОТ ${MONTH_NAMES[month - 1]} ${year}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
