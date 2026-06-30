import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  usePreviewPayroll,
  useApprovePayrollPeriod,
  type PayrollPreviewRow,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { AppDialog } from "@/components/layout/app-dialog";

interface PayrollApproveModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  filterUserId?: string;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

export default function PayrollApproveModal({ onClose, onSuccess, filterUserId }: PayrollApproveModalProps) {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const { data: previewData, isFetching } = usePreviewPayroll(year, month);
  const { mutateAsync: approvePeriod, isPending: approving } = useApprovePayrollPeriod();

  const allRows: PayrollPreviewRow[] = previewData?.data?.preview ?? [];
  const rows = filterUserId ? allRows.filter((r) => r.userId === filterUserId) : allRows;

  const getApproved = (row: PayrollPreviewRow) =>
    overrides[row.userId] !== undefined ? overrides[row.userId] : row.calculatedAmount;

  const totalFot = rows.reduce((sum, r) => sum + getApproved(r), 0);

  const handleOverride = (userId: string, value: number) => {
    setOverrides((prev) => ({ ...prev, [userId]: value }));
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

  const handleApprove = async () => {
    if (rows.length === 0) return;
    try {
      await approvePeriod({
        year,
        month,
        employees: rows.map((r) => ({
          userId: r.userId,
          approvedAmount: getApproved(r),
        })),
      });
      toast.success(
        t("payroll.fotApprovedSuccess", `ФОТ за ${MONTH_NAMES[month - 1]} ${year} утверждён — ₸${totalFot.toLocaleString("ru-KZ")}`),
      );
      onSuccess?.();
      onClose();
    } catch {
      toast.error(t("common.errorGeneric", "Произошла ошибка. Попробуйте снова."));
    }
  };

  return (
    <AppDialog
      open
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={t("payroll.approveTitle")}
      description={t("payroll.approveSubtitle", "Утвердите ФОТ за период и зафиксируйте расход")}
      size="xl"
      bodyClassName="!p-0"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="dash-btn dash-btn-secondary"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving || rows.length === 0}
            className="dash-btn dash-btn-primary"
          >
            {approving ? t("payroll.approving") : t("payroll.approveAndRecord", `Утвердить ФОТ ${MONTH_NAMES[month - 1]} ${year}`)}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3 shrink-0">
        <div className="flex-1">
          <label className="text-caption font-semibold text-[var(--text-secondary)] block mb-1">{t("payroll.year", "Год")}</label>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setOverrides({}); }}
            className="w-full h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-caption font-semibold text-[var(--text-secondary)] block mb-1">{t("payroll.month", "Месяц")}</label>
          <select
            value={month}
            onChange={(e) => { setMonth(Number(e.target.value)); setOverrides({}); }}
            className="w-full h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[50vh]">
        {isFetching ? (
          <div className="flex items-center justify-center py-12 text-sm text-[var(--text-secondary)]">
            {t("common.loading", "Загрузка...")}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[var(--text-secondary)]">
            {t("payroll.noStaffSettings", "Нет сотрудников с настроенной зарплатой")}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-[var(--surface-2)]">
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("payroll.employee", "Сотрудник")}</TableHead>
                <TableHead className="text-right">{t("payroll.revenueBase")}</TableHead>
                <TableHead className="text-right">{t("payroll.calculated")}</TableHead>
                <TableHead className="text-right">{t("payroll.approved")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <p className="font-medium text-[var(--text)]">{row.userName || "—"}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] capitalize">{row.userRole}</p>
                  </TableCell>
                  <TableCell className="text-right text-[var(--text-secondary)]">
                    ₸{row.revenueBase.toLocaleString("ru-KZ")}
                  </TableCell>
                  <TableCell className="text-right text-[var(--text-secondary)]">
                    ₸{row.calculatedAmount.toLocaleString("ru-KZ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      min={0}
                      value={getApproved(row)}
                      onChange={(e) => handleOverride(row.userId, Number(e.target.value))}
                      className="w-28 h-8 px-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-right text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent border-t-2 border-[var(--border)] bg-[var(--surface-2)]">
                <TableCell colSpan={3} className="font-bold text-[var(--text)]">
                  {t("payroll.fotTotal", "Итого ФОТ")}
                </TableCell>
                <TableCell className="text-right font-bold text-[var(--primary)]">
                  ₸{totalFot.toLocaleString("ru-KZ")}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </AppDialog>
  );
}
