import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useCreateExpense, useUpdateExpense, useListUsersAll, type ClinicExpense, type ExpenseCategory, type CreateExpenseRequest } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">
            {expense ? t("expenses.editTitle") : t("expenses.addTitle")}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              {t("expenses.category")}
            </label>
            <select
              value={uiCategory}
              onChange={(e) => handleUiCategoryChange(e.target.value)}
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {UI_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>
              ))}
            </select>
          </div>

          {(uiCategory === "advance" || (uiCategory === "salary" && !expense?.payrollRef)) && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {t("expenses.employee")} *
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                {t("expenses.subcategory")}
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder={t("expenses.subcategoryPlaceholder")}
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
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
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              {t("expenses.date")} *
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              {t("expenses.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("expenses.descriptionPlaceholder")}
              rows={2}
              className="w-full text-sm px-3 py-2.5 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? t("common.saving") : expense ? t("common.save") : t("expenses.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
