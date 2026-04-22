import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User2, Briefcase, Wallet, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { User } from "@workspace/api-client-react";

const ROLES = ["admin", "doctor", "accountant", "warehouse"] as const;
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
  hireDate: string;
  maxPatientsPerDay: number;
  maxPatientsChanged: boolean;
  salaryType: "fixed" | "commission" | "fixed_plus_commission";
  fixedAmount: number;
  commissionPercent: number;
}

type TabKey = "personal" | "position" | "salary";

const TABS: { key: TabKey; icon: React.ElementType; labelKey: string }[] = [
  { key: "personal",  icon: User2,     labelKey: "employees.tabPersonal" },
  { key: "position",  icon: Briefcase, labelKey: "employees.tabPosition" },
  { key: "salary",    icon: Wallet,    labelKey: "employees.tabSalary" },
];

const ROLE_COLORS: Record<string, string> = {
  admin:      "bg-blue-100 text-blue-700 border-blue-200",
  doctor:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  accountant: "bg-amber-100 text-amber-700 border-amber-200",
  warehouse:  "bg-slate-100 text-slate-700 border-slate-200",
};

export default function EmployeeDialog({ open, onClose, onSave, isSaving, editUser }: EmployeeDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [showPassword, setShowPassword] = useState(false);

  const defaultForm: EmployeeFormData = {
    name: "", email: "", password: "", role: "doctor",
    isActive: true, phone: "", position: "", specialty: "", hireDate: "",
    maxPatientsPerDay: 15, maxPatientsChanged: false,
    salaryType: "fixed", fixedAmount: 0, commissionPercent: 0,
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
        hireDate: editUser.hireDate ?? "",
        maxPatientsPerDay: 15,
        maxPatientsChanged: false,
        salaryType: editUser.salarySettings?.salaryType ?? "fixed",
        fixedAmount: Number(editUser.salarySettings?.fixedAmount ?? 0),
        commissionPercent: Number(editUser.salarySettings?.commissionPercent ?? 0),
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  if (!open) return null;

  const isEdit = !!editUser;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-lg bg-white rounded-t-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: "92dvh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                {isEdit ? t("employees.editTitle", "Редактировать сотрудника") : t("employees.addTitle", "Добавить сотрудника")}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-5 pt-3 pb-1 gap-1 shrink-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl text-xs font-semibold transition-all"
                    style={isActive ? { backgroundColor: "#98cc1c22", color: "#98cc1c" } : { color: "#9ca3af" }}
                  >
                    <Icon className="w-4 h-4" />
                    {t(tab.labelKey, tab.key)}
                  </button>
                );
              })}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 space-y-4">
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
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {t("employees.name", "ФИО")} *
                        </label>
                        <input
                          required
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          placeholder={t("employees.namePlaceholder", "Др. Иванова Мария")}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          Email *
                        </label>
                        <input
                          required
                          type="email"
                          value={form.email}
                          onChange={(e) => set("email", e.target.value)}
                          placeholder="maria@clinic.kz"
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {t("employees.password", "Пароль")} {!isEdit && "*"}
                        </label>
                        <div className="relative">
                          <input
                            required={!isEdit}
                            type={showPassword ? "text" : "password"}
                            value={form.password}
                            onChange={(e) => set("password", e.target.value)}
                            placeholder={isEdit ? t("employees.passwordEditHint", "Оставьте пустым, чтобы не менять") : t("employees.passwordPlaceholder", "Минимум 6 символов")}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {t("employees.phone", "Телефон")}
                        </label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => set("phone", e.target.value)}
                          placeholder="+7 700 000 00 00"
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      {isEdit && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-2">
                            {t("employees.status", "Статус")}
                          </label>
                          <button
                            type="button"
                            onClick={() => set("isActive", !form.isActive)}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all"
                            style={form.isActive
                              ? { borderColor: "#98cc1c", backgroundColor: "#98cc1c11" }
                              : { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" }}
                          >
                            <div className="flex items-center gap-2.5">
                              {form.isActive
                                ? <ToggleRight className="w-5 h-5" style={{ color: "#98cc1c" }} />
                                : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                              <span className="text-sm font-semibold" style={form.isActive ? { color: "#98cc1c" } : { color: "#6b7280" }}>
                                {form.isActive
                                  ? t("employees.statusActive", "Активен")
                                  : t("employees.statusInactive", "Неактивен")}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
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
                        <label className="block text-xs font-semibold text-gray-500 mb-2">
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
                                  : "border-gray-200 text-gray-500 bg-white"
                              }`}
                            >
                              {t(`role.${r}`, r)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {t("employees.position", "Должность")}
                        </label>
                        <input
                          value={form.position}
                          onChange={(e) => set("position", e.target.value)}
                          placeholder={t("employees.positionPlaceholder", "Главный врач, Терапевт...")}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      {form.role === "doctor" && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                              {t("employees.specialty", "Специализация")}
                            </label>
                            <input
                              value={form.specialty}
                              onChange={(e) => set("specialty", e.target.value)}
                              placeholder={t("employees.specialtyPlaceholder", "Имплантология, Ортодонтия...")}
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                              {t("employees.maxPatients", "Макс. пациентов в день")}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={form.maxPatientsPerDay}
                              onChange={(e) => setMaxPatients(Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          {t("employees.hireDate", "Дата приёма")}
                        </label>
                        <input
                          type="date"
                          value={form.hireDate}
                          onChange={(e) => set("hireDate", e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                        <label className="block text-xs font-semibold text-gray-500 mb-2">
                          {t("employees.salaryType", "Тип оплаты")}
                        </label>
                        <div className="space-y-2">
                          {(["fixed", "commission", "fixed_plus_commission"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => set("salaryType", type)}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                form.salaryType === type
                                  ? "border-primary bg-primary/5"
                                  : "border-gray-200 bg-white"
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.salaryType === type ? "border-primary" : "border-gray-300"}`}>
                                {form.salaryType === type && <span className="w-2 h-2 rounded-full bg-primary" />}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {t(`employees.salaryType_${type}`, type)}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {t(`employees.salaryType_${type}_hint`, "")}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {(form.salaryType === "fixed" || form.salaryType === "fixed_plus_commission") && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            {t("employees.fixedAmount", "Оклад (₸/мес)")}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={form.fixedAmount}
                              onChange={(e) => set("fixedAmount", Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-8 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₸</span>
                          </div>
                        </div>
                      )}

                      {(form.salaryType === "commission" || form.salaryType === "fixed_plus_commission") && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            {t("employees.commissionPercent", "Процент от выручки")}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={form.commissionPercent}
                              onChange={(e) => set("commissionPercent", Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-8 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
                          </div>
                        </div>
                      )}

                      {form.salaryType !== "fixed" && form.role !== "doctor" && (
                        <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-4 py-3">
                          {t("employees.commissionNoteNonDoctor", "Для не-врачебных ролей процент от выручки = 0 (процедуры не назначаются).")}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-5 pb-6 pt-2 flex flex-col gap-2.5 shrink-0 border-t border-gray-50">
                <div className="flex gap-3">
                  {activeTab !== "personal" && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === "salary" ? "position" : "personal")}
                      className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100"
                    >
                      {t("common.back", "Назад")}
                    </button>
                  )}

                  {activeTab !== "salary" ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === "personal" ? "position" : "salary")}
                      className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white"
                      style={{ backgroundColor: "#98cc1c" }}
                    >
                      {t("employees.next", "Далее")}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
                      style={{ backgroundColor: "#98cc1c" }}
                    >
                      {isSaving ? t("common.saving", "Сохранение...") : (isEdit ? t("employees.save", "Сохранить") : t("employees.create", "Создать"))}
                    </button>
                  )}
                </div>

                {activeTab === "salary" && !isEdit && (
                  <p className="text-xs text-gray-400 text-center">
                    {t("employees.passwordNote", "После создания пароль будет показан — скопируйте его.")}
                  </p>
                )}
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
