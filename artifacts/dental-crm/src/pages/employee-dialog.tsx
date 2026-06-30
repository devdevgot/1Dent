import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User2, Briefcase, Wallet, Eye, EyeOff, ToggleLeft, ToggleRight, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { User } from "@workspace/api-client-react";
import { AppDialog } from "@/components/layout/app-dialog";

const ROLES = ["admin", "doctor", "accountant", "warehouse", "assistant", "nurse"] as const;
type Role = (typeof ROLES)[number];

interface EmployeeDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EmployeeFormData) => void;
  isSaving?: boolean;
  editUser?: User | null;
}

export interface EmployeeFormData {
  name: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
  phone: string;
  position: string;
  specialty: string;
  specialties: string[];
  hireDate: string;
  maxPatientsPerDay: number;
  maxPatientsChanged: boolean;
  salaryType: "fixed" | "commission" | "fixed_plus_commission" | "hourly";
  fixedAmount: number;
  commissionPercent: number;
  hourlyRate: number;
}

const DENTAL_SPECIALTIES = [
  "Терапевт",
  "Ортодонт",
  "Хирург",
  "Имплантолог",
  "Ортопед",
  "Пародонтолог",
  "Эндодонтист",
  "Детский стоматолог",
  "Рентгенолог",
  "Стоматолог общей практики",
  "Гигиенист",
  "Анестезиолог",
];

function SpecialtyTagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = DENTAL_SPECIALTIES.filter(
    (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase()),
  );
  const customNotInList =
    inputValue.trim() !== "" &&
    !DENTAL_SPECIALTIES.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !values.includes(inputValue.trim());

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20 px-2.5 py-1 rounded-full text-xs font-semibold"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-[#16a34a] hover:text-[#15803d] ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder ?? "Введите или выберите..."}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              if (inputValue.trim()) addTag(inputValue.trim());
            }
            if (e.key === " " || e.key === "Spacebar") {
              const val = inputValue.trim();
              if (val) {
                e.preventDefault();
                addTag(val);
              }
            }
            if (e.key === "Escape") setIsOpen(false);
          }}
          className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-10 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (filtered.length > 0 || customNotInList) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e3d9] rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={() => addTag(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-[#0f172a] hover:bg-[#faf8f4] transition-colors"
              >
                {s}
              </button>
            ))}
            {customNotInList && (
              <button
                type="button"
                onMouseDown={() => addTag(inputValue.trim())}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold border-t border-[#e8e3d9] hover:bg-[#faf8f4] transition-colors text-[#1f75fe]"
              >
                + Добавить «{inputValue.trim()}»
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type TabKey = "personal" | "position" | "salary";

const TABS: { key: TabKey; icon: React.ElementType; labelKey: string }[] = [
  { key: "personal",  icon: User2,     labelKey: "employees.tabPersonal" },
  { key: "position",  icon: Briefcase, labelKey: "employees.tabPosition" },
  { key: "salary",    icon: Wallet,    labelKey: "employees.tabSalary" },
];

const ROLE_COLORS: Record<string, string> = {
  admin:      "bg-[#e0f2fe] text-[#0284c7] border-[#e0f2fe]",
  doctor:     "bg-[#f0fdf4] text-[#16a34a] border-[#f0fdf4]",
  accountant: "bg-[#fef3c7] text-[#d97706] border-[#fef3c7]",
  warehouse:  "bg-[#f5f3ff] text-[#7c3aed] border-[#f5f3ff]",
  assistant:  "bg-[#e0e7ff] text-[#4f46e5] border-[#e0e7ff]",
  nurse:      "bg-[#fce7f3] text-[#db2777] border-[#fce7f3]",
};

export default function EmployeeDialog({ open, onClose, onSave, isSaving, editUser }: EmployeeDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [showPassword, setShowPassword] = useState(false);

  const defaultForm: EmployeeFormData = {
    name: "", email: "", password: "", role: "doctor",
    isActive: true, phone: "", position: "", specialty: "", specialties: [], hireDate: "",
    maxPatientsPerDay: 15, maxPatientsChanged: false,
    salaryType: "fixed", fixedAmount: 0, commissionPercent: 0, hourlyRate: 0,
  };

  const [form, setForm] = useState<EmployeeFormData>(defaultForm);

  useEffect(() => {
    if (!open) {
      setActiveTab("personal");
      setShowPassword(false);
    }
    if (editUser) {
      setForm({
        name: editUser.name ?? "",
        email: editUser.email ?? "",
        password: "",
        role: (editUser.role as Role) ?? "doctor",
        isActive: editUser.isActive !== false,
        phone: editUser.phone ?? "",
        position: editUser.position ?? "",
        specialty: editUser.specialty ?? "",
        specialties: editUser.specialty
          ? editUser.specialty.split(",").map((s) => s.trim()).filter(Boolean)
          : editUser.position
          ? [editUser.position]
          : [],
        hireDate: editUser.hireDate ?? "",
        maxPatientsPerDay: 15,
        maxPatientsChanged: false,
        salaryType: (editUser.salarySettings?.salaryType as EmployeeFormData["salaryType"]) ?? "fixed",
        fixedAmount: (editUser.salarySettings?.salaryType as string) === "hourly" ? 0 : Number(editUser.salarySettings?.fixedAmount ?? 0),
        commissionPercent: Number(editUser.salarySettings?.commissionPercent ?? 0),
        hourlyRate: (editUser.salarySettings?.salaryType as string) === "hourly" ? Number(editUser.salarySettings?.fixedAmount ?? 0) : 0,
      });
    } else {
      setForm(defaultForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editUser]);

  const set = (field: keyof EmployeeFormData, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));
  
  const setMaxPatients = (value: number) =>
    setForm((prev) => ({ ...prev, maxPatientsPerDay: value, maxPatientsChanged: true }));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter") e.preventDefault();
  };

  const isEdit = !!editUser;

  return (
    <AppDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={isEdit ? t("employees.editTitle", "Редактировать сотрудника") : t("employees.addTitle", "Добавить сотрудника")}
      size="lg"
      bodyClassName="!py-0"
      footer={
        <div className="flex flex-col gap-2.5 w-full">
          <div className="flex gap-3 w-full">
            {activeTab !== "personal" && (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "salary" ? "position" : "personal")}
                className="dash-btn dash-btn-secondary flex-1"
              >
                {t("common.back", "Назад")}
              </button>
            )}
            {activeTab !== "salary" ? (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "personal" ? "position" : "salary")}
                className="dash-btn dash-btn-primary flex-1"
              >
                {t("employees.next", "Далее")}
              </button>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onSave(form)}
                className="dash-btn dash-btn-primary flex-1"
              >
                {isSaving ? t("common.saving", "Сохранение...") : (isEdit ? t("employees.save", "Сохранить") : t("employees.create", "Создать"))}
              </button>
            )}
          </div>
          {activeTab === "salary" && !isEdit && (
            <p className="text-xs text-[var(--text-secondary)] text-center">
              {t("employees.passwordNote", "После создания пароль будет показан — скопируйте его.")}
            </p>
          )}
        </div>
      }
    >
      <div className="flex gap-1 pb-3 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all ${isActive ? "bg-[var(--ds-primary)]/10 text-[var(--ds-primary)]" : "text-[var(--text-secondary)]"}`}
            >
              <Icon className="w-4 h-4" />
              {t(tab.labelKey, tab.key)}
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => e.preventDefault()} onKeyDown={handleKeyDown}>
        <div className="space-y-4 pb-2">
                <AnimatePresence mode="wait">
                  {/* ─── Tab: Personal ───────────────────────────────── */}
                  {activeTab === "personal" && (
                    <motion.div
                      key="personal"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                          {t("employees.name", "ФИО")} *
                        </label>
                        <input
                          required
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          placeholder={t("employees.namePlaceholder", "Др. Иванова Мария")}
                          className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                          Email {!isEdit && "*"}
                        </label>
                        {isEdit ? (
                          <div className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm text-[#94a3b8] bg-[#faf8f4] cursor-not-allowed select-none">
                            {form.email}
                          </div>
                        ) : (
                          <input
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => set("email", e.target.value)}
                            placeholder="maria@clinic.kz"
                            className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                          />
                        )}
                        {isEdit && (
                          <p className="text-[11px] text-[#94a3b8] mt-1">
                            {t("employees.emailReadonly", "Email нельзя изменить после создания")}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                          {t("employees.password", "Пароль")} {!isEdit && "*"}
                        </label>
                        <div className="relative">
                          <input
                            required={!isEdit}
                            type={showPassword ? "text" : "password"}
                            value={form.password}
                            onChange={(e) => set("password", e.target.value)}
                            placeholder={isEdit ? t("employees.passwordEditHint", "Оставьте пустым, чтобы не менять") : t("employees.passwordPlaceholder", "Минимум 6 символов")}
                            className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-11 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                          {t("employees.phone", "Телефон")}
                        </label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => set("phone", e.target.value)}
                          placeholder="+7 700 000 00 00"
                          className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                        />
                      </div>

                      {isEdit && (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-2">
                            {t("employees.status", "Статус")}
                          </label>
                          <button
                            type="button"
                            onClick={() => set("isActive", !form.isActive)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${form.isActive ? "border-[#1f75fe] bg-[#1f75fe]/10" : "border-[#e8e3d9] bg-[#faf8f4]"}`}
                          >
                            <div className="flex items-center gap-2.5">
                              {form.isActive
                                ? <ToggleRight className="w-5 h-5 text-[#1f75fe]" />
                                : <ToggleLeft className="w-5 h-5 text-[#94a3b8]" />}
                              <span className={`text-sm font-semibold ${form.isActive ? "text-[#1f75fe]" : "text-[#64748b]"}`}>
                                {form.isActive
                                  ? t("employees.statusActive", "Активен")
                                  : t("employees.statusInactive", "Неактивен")}
                              </span>
                            </div>
                            <span className="text-xs text-[#94a3b8]">
                              {form.isActive
                                ? t("employees.statusActiveHint", "Может входить в систему")
                                : t("employees.statusInactiveHint", "Доступ заблокирован")}
                            </span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ─── Tab: Position ───────────────────────────────── */}
                  {activeTab === "position" && (
                    <motion.div
                      key="position"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-2">
                          {t("employees.role", "Роль")} *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {ROLES.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => set("role", r)}
                              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                                form.role === r
                                  ? ROLE_COLORS[r]
                                  : "border-[#e8e3d9] text-[#64748b] bg-white"
                              }`}
                            >
                              {t(`role.${r}`, r)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(form.role === "doctor" || form.role === "assistant" || form.role === "nurse") ? (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            {t("employees.specialty", "Должность / Специализация")}
                          </label>
                          <SpecialtyTagInput
                            values={form.specialties}
                            onChange={(v) => setForm((prev) => ({ ...prev, specialties: v }))}
                            placeholder={t("employees.specialtyPlaceholder", "Выберите или введите специализацию...")}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            {t("employees.position", "Должность")}
                          </label>
                          <input
                            value={form.position}
                            onChange={(e) => set("position", e.target.value)}
                            placeholder={t("employees.positionPlaceholder", "Главный врач, Бухгалтер...")}
                            className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                          />
                        </div>
                      )}

                      {form.role === "doctor" && (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            {t("employees.maxPatients", "Макс. пациентов в день")}
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="15"
                            value={form.maxPatientsPerDay === 15 && !form.maxPatientsChanged ? "" : form.maxPatientsPerDay || ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "");
                              const n = v === "" ? 15 : Math.min(50, Math.max(1, Number(v)));
                              setMaxPatients(n);
                            }}
                            className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                          {t("employees.hireDate", "Дата приёма")}
                        </label>
                        <input
                          type="date"
                          value={form.hireDate}
                          onChange={(e) => set("hireDate", e.target.value)}
                          className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Tab: Salary ─────────────────────────────────── */}
                  {activeTab === "salary" && (
                    <motion.div
                      key="salary"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-xs font-semibold text-[#64748b] mb-2">
                          {t("employees.salaryType", "Тип оплаты")}
                        </label>
                        <div className="space-y-2">
                          {(["fixed", "commission", "fixed_plus_commission", "hourly"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => set("salaryType", type)}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                form.salaryType === type
                                  ? "border-[#1f75fe] bg-[#1f75fe]/10"
                                  : "border-[#e8e3d9] bg-white"
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.salaryType === type ? "border-[#1f75fe]" : "border-[#d4cfc6]"}`}>
                                {form.salaryType === type && <span className="w-2 h-2 rounded-full bg-[#1f75fe]" />}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-[#0f172a]">
                                  {type === "fixed" ? "Оклад" : type === "commission" ? "Процент" : type === "fixed_plus_commission" ? "Оклад + Процент" : "Почасовая"}
                                </p>
                                <p className="text-xs text-[#94a3b8]">
                                  {type === "fixed" ? "Фиксированная сумма в месяц" : type === "commission" ? "Процент от выручки" : type === "fixed_plus_commission" ? "Оба варианта" : "Ставка за рабочий час"}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {(form.salaryType === "fixed" || form.salaryType === "fixed_plus_commission") && (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            {t("employees.fixedAmount", "Оклад (₸/мес)")}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={form.fixedAmount || ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                set("fixedAmount", v === "" ? 0 : Number(v));
                              }}
                              className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-8 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm font-bold">₸</span>
                          </div>
                        </div>
                      )}

                      {(form.salaryType === "commission" || form.salaryType === "fixed_plus_commission") && (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            {t("employees.commissionPercent", "Процент от выручки")}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={form.commissionPercent || ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                const parts = v.split(".");
                                const clean = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v;
                                const n = parseFloat(clean);
                                set("commissionPercent", clean === "" || isNaN(n) ? 0 : Math.min(100, n));
                              }}
                              className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-8 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm font-bold">%</span>
                          </div>
                        </div>
                      )}

                      {form.salaryType === "hourly" && (
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            Ставка (₸/час)
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={form.hourlyRate || ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                set("hourlyRate", v === "" ? 0 : Number(v));
                              }}
                              className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-8 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm font-bold">₸</span>
                          </div>
                        </div>
                      )}

                      {form.salaryType !== "fixed" && form.salaryType !== "hourly" && form.role !== "doctor" && (
                        <p className="text-xs text-[#d97706] bg-[#fef3c7] rounded-xl px-4 py-3">
                          {t("employees.commissionNoteNonDoctor", "Для не-врачебных ролей процент от выручки = 0 (процедуры не назначаются).")}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
        </div>
      </form>
    </AppDialog>
  );
}
