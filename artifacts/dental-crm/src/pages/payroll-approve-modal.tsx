import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  usePreviewPayroll,
  useApprovePayrollPeriod,
  type PayrollPreviewRow,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 font-manrope">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#e8e3d9]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e3d9] shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#0f172a]">{t("payroll.approveTitle")}</h3>
            <p className="text-xs text-[#64748b] mt-0.5">{t("payroll.approveSubtitle", "Утвердите ФОТ за период и зафиксируйте расход")}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[#f1ede4] transition-colors">
            <X className="w-4 h-4 text-[#64748b]" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-[#e8e3d9] shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-[#64748b] block mb-1">{t("payroll.year", "Год")}</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setOverrides({}); }}
              className="w-full h-9 px-3 rounded-xl border border-[#e8e3d9] bg-white text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-[#64748b] block mb-1">{t("payroll.month", "Месяц")}</label>
            <select
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setOverrides({}); }}
              className="w-full h-9 px-3 rounded-xl border border-[#e8e3d9] bg-white text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isFetching ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#64748b]">
              {t("common.loading", "Загрузка...")}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[#64748b]">
              {t("payroll.noStaffSettings", "Нет сотрудников с настроенной зарплатой")}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-[#faf8f4]">
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
                      <p className="font-medium text-[#0f172a]">{row.userName || "—"}</p>
                      <p className="text-[11px] text-[#94a3b8] capitalize">{row.userRole}</p>
                    </TableCell>
                    <TableCell className="text-right text-[#64748b]">
                      ₸{row.revenueBase.toLocaleString("ru-KZ")}
                    </TableCell>
                    <TableCell className="text-right text-[#64748b]">
                      ₸{row.calculatedAmount.toLocaleString("ru-KZ")}
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="number"
                        min={0}
                        value={getApproved(row)}
                        onChange={(e) => handleOverride(row.userId, Number(e.target.value))}
                        className="w-28 h-8 px-2 rounded-xl border border-[#e8e3d9] bg-white text-sm text-right text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent border-t-2 border-[#e8e3d9] bg-[#faf8f4]">
                  <TableCell colSpan={3} className="font-bold text-[#0f172a]">
                    {t("payroll.fotTotal", "Итого ФОТ")}
                  </TableCell>
                  <TableCell className="text-right font-bold text-[#1f75fe]">
                    ₸{totalFot.toLocaleString("ru-KZ")}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#e8e3d9] shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleApprove}
            disabled={approving || rows.length === 0}
            className="px-5 py-2 rounded-full text-sm font-semibold bg-[#1f75fe] text-white hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {approving ? t("payroll.approving") : t("payroll.approveAndRecord", `Утвердить ФОТ ${MONTH_NAMES[month - 1]} ${year}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
