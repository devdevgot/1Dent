import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateExpense, useUpdateExpense, useListUsersAll, type ClinicExpense, type ExpenseCategory, type CreateExpenseRequest } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { AppDialog } from "@/components/layout/app-dialog";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  doctor: "Врач",
  accountant: "Бухгалтер",
  warehouse: "Склад",
  assistant: "Ассистент",
  nurse: "Медсестра",
};

const CATEGORIES: ExpenseCategory[] = ["salary", "materials", "rent", "utilities", "equipment", "marketing", "other"];
const UI_CATEGORIES = ["salary", "advance", "materials", "rent", "utilities", "equipment", "marketing", "other"];

interface ExpenseDialogProps {
  expense?: ClinicExpense | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExpenseDialog({ expense, onClose, onSuccess }: ExpenseDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [uiCategory, setUiCategory] = useState<string>(() => {
    if (expense?.category === "salary" && expense?.subcategory?.startsWith("аванс")) {
      return "advance";
    }
    return expense?.category ?? "other";
  });
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "other");
  const [subcategory, setSubcategory] = useState(expense?.subcategory ?? "");
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (expense?.subcategory?.startsWith("аванс:")) {
      return expense.subcategory.split(":")[1] || "";
    }
    if (expense?.category === "salary" && expense?.subcategory?.startsWith("зарплата:")) {
      return expense.subcategory.split(":")[1] || "";
    }
    return "";
  });
  const [amount, setAmount] = useState(expense ? String(Number(expense.amount)) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expenseDate
      ? format(new Date(expense.expenseDate), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
  );

  const { mutateAsync: create, isPending: creating } = useCreateExpense();
  const { mutateAsync: update, isPending: updating } = useUpdateExpense();
  const isPending = creating || updating;

  const { data: usersData } = useListUsersAll({ includeInactive: false });
  const allUsers = usersData?.data?.users ?? [];
  const employees = allUsers.filter((u) => u.role !== "owner");

  const handleUiCategoryChange = (val: string) => {
    setUiCategory(val);
    if (val === "advance") {
      setCategory("salary");
      setSubcategory(`аванс:${selectedUserId}`);
    } else if (val === "salary") {
      setCategory("salary");
      setSubcategory(`зарплата:${selectedUserId}`);
    } else {
      setCategory(val as ExpenseCategory);
      if (subcategory.startsWith("аванс") || subcategory.startsWith("зарплата")) {
        setSubcategory("");
      }
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast({ title: t("expenses.amountInvalid"), variant: "destructive" });
      return;
    }

    if (uiCategory === "advance" && !selectedUserId) {
      toast({ title: t("expenses.selectEmployee"), variant: "destructive" });
      return;
    }

    if (uiCategory === "salary" && !expense?.payrollRef && !selectedUserId) {
      toast({ title: t("expenses.selectEmployee"), variant: "destructive" });
      return;
    }

    const payload: CreateExpenseRequest = {
      category,
      subcategory: uiCategory === "advance"
        ? `аванс:${selectedUserId}`
        : (uiCategory === "salary" && !expense?.payrollRef)
          ? `зарплата:${selectedUserId}`
          : (subcategory || undefined),
      amount: amountNum,
      description: description || undefined,
      expenseDate: new Date(expenseDate).toISOString(),
    };

    try {
      if (expense) {
        await update({ id: expense.id, data: payload });
        toast({ title: t("expenses.updated") });
      } else {
        await create(payload);
        toast({ title: t("expenses.created") });
      }
      onSuccess();
      onClose();
    } catch {
      toast({ title: t("expenses.error"), variant: "destructive" });
    }
  }

  return (
    <AppDialog
      open
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={expense ? t("expenses.editTitle") : t("expenses.addTitle")}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="dash-btn dash-btn-secondary flex-1"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="expense-form"
            disabled={isPending}
            className="dash-btn dash-btn-primary flex-1"
          >
            {isPending ? t("common.saving") : expense ? t("common.save") : t("expenses.add")}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
            {t("expenses.category")}
          </label>
          <select
            value={uiCategory}
            onChange={(e) => handleUiCategoryChange(e.target.value)}
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30"
          >
            {UI_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>
            ))}
          </select>
        </div>

        {(uiCategory === "advance" || (uiCategory === "salary" && !expense?.payrollRef)) && (
          <div>
            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
              {t("expenses.employee")} *
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30"
            >
              <option value="">{t("expenses.selectEmployee")}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({ROLE_LABELS[emp.role] || emp.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {uiCategory !== "advance" && uiCategory !== "salary" && (
          <div>
            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
              {t("expenses.subcategory")}
            </label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder={t("expenses.subcategoryPlaceholder")}
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
            {t("expenses.amount")} (₸) *
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            required
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
            {t("expenses.date")} *
          </label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
            {t("expenses.description")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("expenses.descriptionPlaceholder")}
            rows={2}
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-[#f1ede4] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/30 resize-none"
          />
        </div>
      </form>
    </AppDialog>
  );
}
