import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Mail, User2, Phone, Calendar, ShieldCheck, Activity,
  BarChart3, Package, Wallet, Percent, Layers, Clock,
  ChevronLeft, ChevronDown, Send, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { customFetch, getListUsersAllQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type Role = "admin" | "doctor" | "accountant" | "warehouse";
type SalaryType = "fixed" | "commission" | "fixed_plus_commission" | "hourly";

interface InviteFormData {
  email: string;
  name: string;
  phone: string;
  role: Role;
  specialty: string;
  maxPatientsPerDay: number;
  hireDate: string;
  salaryType: SalaryType;
  fixedAmount: number;
  commissionPercent: number;
  hourlyRate: number;
}

const DEFAULT_FORM: InviteFormData = {
  email: "",
  name: "",
  phone: "",
  role: "doctor",
  specialty: "",
  maxPatientsPerDay: 15,
  hireDate: "",
  salaryType: "fixed",
  fixedAmount: 0,
  commissionPercent: 0,
  hourlyRate: 0,
};

const ROLE_DEFS: {
  value: Role;
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    value: "admin",
    icon: ShieldCheck,
    label: "Администратор",
    desc: "Управляет клиникой и расписанием",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    value: "doctor",
    icon: Activity,
    label: "Врач",
    desc: "Ведёт приём пациентов",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    value: "accountant",
    icon: BarChart3,
    label: "Бухгалтер",
    desc: "Видит финансы",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    value: "warehouse",
    icon: Package,
    label: "Склад",
    desc: "Управляет материалами",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
];

const SALARY_DEFS: {
  value: SalaryType;
  icon: React.ElementType;
  label: string;
  desc: string;
}[] = [
  { value: "fixed",                icon: Wallet,  label: "Оклад",           desc: "Фиксированная сумма в месяц" },
  { value: "commission",           icon: Percent, label: "Процент",          desc: "Процент от выручки" },
  { value: "fixed_plus_commission",icon: Layers,  label: "Оклад + Процент", desc: "Оба варианта одновременно" },
  { value: "hourly",               icon: Clock,   label: "Почасовая",        desc: "Оплата за рабочий час" },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  doctor: "Врач",
  accountant: "Бухгалтер",
  warehouse: "Склад",
};

const ROLE_COLOR: Record<Role, { bg: string; text: string; border: string }> = {
  admin:      { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200" },
  doctor:     { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  accountant: { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200" },
  warehouse:  { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200" },
};

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function NumericInput({
  value,
  onChange,
  placeholder,
  suffix,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  suffix?: string;
  max?: number;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? "0"}
        value={value || ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          const n = raw === "" ? 0 : Number(raw);
          onChange(max !== undefined ? Math.min(max, n) : n);
        }}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">{suffix}</span>
      )}
    </div>
  );
}

const STEP_LABELS = ["Email", "Информация", "Зарплата", "Приглашение"];

interface InviteStaffDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function InviteStaffDialog({ open, onClose }: InviteStaffDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InviteFormData>(DEFAULT_FORM);
  const [emailError, setEmailError] = useState("");
  const [nameError, setNameError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const isDirty = form.email.trim() !== "" || form.name.trim() !== "";

  const set = <K extends keyof InviteFormData>(k: K, v: InviteFormData[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      return customFetch<{ success: boolean }>("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email.trim().toLowerCase(),
          role: data.role,
          phone: data.phone || undefined,
          specialty: data.role === "doctor" && data.specialty ? data.specialty : undefined,
          maxPatientsPerDay: data.role === "doctor" && data.maxPatientsPerDay > 0 ? data.maxPatientsPerDay : undefined,
          hireDate: data.hireDate || undefined,
          salaryType: data.salaryType,
          fixedAmount: data.salaryType === "fixed" || data.salaryType === "fixed_plus_commission" ? data.fixedAmount : undefined,
          commissionPercent: data.salaryType === "commission" || data.salaryType === "fixed_plus_commission" ? data.commissionPercent : undefined,
          hourlyRate: data.salaryType === "hourly" ? data.hourlyRate : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(false) });
      queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(true) });
      toast.success("Сотрудник добавлен", {
        description: `Приглашение отправлено на ${form.email.trim()}`,
      });
      handleReset();
      onClose();
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number })?.status;
      const msg = status === 409
        ? "Сотрудник с таким email уже существует"
        : status === 429
        ? "Приглашение уже было отправлено. Подождите 60 секунд"
        : "Не удалось добавить сотрудника. Попробуйте ещё раз";
      toast.error("Ошибка", { description: msg });
    },
  });

  function handleReset() {
    setStep(1);
    setForm(DEFAULT_FORM);
    setEmailError("");
    setNameError("");
    setConfirmClose(false);
  }

  function tryClose() {
    if (isDirty) {
      setConfirmClose(true);
    } else {
      handleReset();
      onClose();
    }
  }

  function forceClose() {
    handleReset();
    onClose();
  }

  function goNext() {
    if (step === 1) {
      if (!isValidEmail(form.email)) {
        setEmailError("Введите корректный email");
        return;
      }
      setEmailError("");
      setStep(2);
    } else if (step === 2) {
      if (!form.name.trim()) {
        setNameError("Введите ФИО сотрудника");
        return;
      }
      setNameError("");
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  }

  if (!open) return null;

  const roleColor = ROLE_COLOR[form.role];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="invite-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) tryClose(); }}
        >
          <motion.div
            key="invite-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="w-full max-w-lg bg-white rounded-t-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: "92dvh" }}
          >
            {/* Close confirm overlay */}
            <AnimatePresence>
              {confirmClose && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 rounded-t-3xl"
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                  </div>
                  <p className="text-base font-bold text-gray-900 text-center mb-1">Закрыть без сохранения?</p>
                  <p className="text-sm text-gray-400 text-center mb-6">Введённые данные будут потеряны</p>
                  <div className="flex gap-3 w-full max-w-xs">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-gray-100 text-gray-700"
                    >
                      Продолжить
                    </button>
                    <button
                      onClick={forceClose}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-red-500"
                    >
                      Закрыть
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Добавить сотрудника</h2>
                <p className="text-xs text-gray-400 mt-0.5">Шаг {step} из 4 — {STEP_LABELS[step - 1]}</p>
              </div>
              <button
                onClick={tryClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-5 pb-4 shrink-0">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "flex-1 h-1 rounded-full transition-all duration-300",
                      s <= step ? "bg-primary" : "bg-gray-100",
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Steps */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <AnimatePresence mode="wait">
                {/* ── Step 1: Email ── */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col items-center pt-4 pb-2"
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "#1f75fe22" }}>
                      <Mail className="w-7 h-7" style={{ color: "#1f75fe" }} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Email сотрудника</h3>
                    <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
                      На этот адрес придёт приглашение<br />войти в систему
                    </p>
                    <div className="w-full max-w-sm">
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => {
                          set("email", e.target.value);
                          if (emailError) setEmailError("");
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") goNext(); }}
                        placeholder="doctor@clinic.kz"
                        className={cn(
                          "w-full border rounded-2xl px-5 py-4 text-base font-medium text-gray-800 text-center focus:outline-none focus:ring-2 transition-all",
                          emailError
                            ? "border-red-300 focus:ring-red-200"
                            : "border-gray-200 focus:ring-primary/30",
                        )}
                      />
                      {emailError && (
                        <p className="text-xs text-red-500 mt-2 text-center">{emailError}</p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── Step 2: Info ── */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    {/* Name */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                        <User2 className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        ФИО *
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => { set("name", e.target.value); if (nameError) setNameError(""); }}
                        placeholder="Др. Иванова Мария"
                        className={cn(
                          "w-full border rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 transition-all",
                          nameError ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:ring-primary/30",
                        )}
                      />
                      {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                        <Phone className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        Телефон
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="+7 700 000 00 00"
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {/* Role cards */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-2">Роль *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLE_DEFS.map((r) => {
                          const Icon = r.icon;
                          const selected = form.role === r.value;
                          return (
                            <button
                              key={r.value}
                              type="button"
                              onClick={() => set("role", r.value)}
                              className={cn(
                                "flex flex-col items-start gap-2 p-3.5 rounded-2xl border text-left transition-all",
                                selected
                                  ? `${r.bg} ${r.border} border-2`
                                  : "border-gray-200 bg-white hover:bg-gray-50",
                              )}
                            >
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", selected ? r.bg : "bg-gray-100")}>
                                <Icon className={cn("w-4 h-4", selected ? r.color : "text-gray-400")} />
                              </div>
                              <div>
                                <p className={cn("text-xs font-bold", selected ? r.color : "text-gray-700")}>{r.label}</p>
                                <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{r.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Doctor-specific */}
                    {form.role === "doctor" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4"
                      >
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Специализация
                          </label>
                          <div className="relative">
                            <input
                              value={form.specialty}
                              onChange={(e) => set("specialty", e.target.value)}
                              placeholder="Терапевт, Ортодонт..."
                              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Макс. пациентов в день
                          </label>
                          <NumericInput
                            value={form.maxPatientsPerDay}
                            onChange={(v) => set("maxPatientsPerDay", v)}
                            placeholder="15"
                            max={50}
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Hire date */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                        <Calendar className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        Дата приёма на работу
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

                {/* ── Step 3: Salary ── */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-2">Тип оплаты</label>
                      <div className="grid grid-cols-2 gap-2">
                        {SALARY_DEFS.map((s) => {
                          const Icon = s.icon;
                          const selected = form.salaryType === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => set("salaryType", s.value)}
                              className={cn(
                                "flex flex-col items-start gap-2 p-3.5 rounded-2xl border text-left transition-all",
                                selected
                                  ? "border-primary bg-primary/5 border-2"
                                  : "border-gray-200 bg-white hover:bg-gray-50",
                              )}
                            >
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", selected ? "bg-primary/10" : "bg-gray-100")}>
                                <Icon className={cn("w-4 h-4", selected ? "text-primary" : "text-gray-400")} />
                              </div>
                              <div>
                                <p className={cn("text-xs font-bold", selected ? "text-primary" : "text-gray-700")}>{s.label}</p>
                                <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{s.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dynamic salary fields */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={form.salaryType}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3"
                      >
                        {(form.salaryType === "fixed" || form.salaryType === "fixed_plus_commission") && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Оклад (₸/мес)</label>
                            <NumericInput
                              value={form.fixedAmount}
                              onChange={(v) => set("fixedAmount", v)}
                              placeholder="0"
                              suffix="₸"
                            />
                          </div>
                        )}
                        {(form.salaryType === "commission" || form.salaryType === "fixed_plus_commission") && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Процент от выручки</label>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                value={form.commissionPercent || ""}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^0-9.]/g, "");
                                  const n = parseFloat(v);
                                  set("commissionPercent", v === "" || isNaN(n) ? 0 : Math.min(100, n));
                                }}
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-9 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
                            </div>
                          </div>
                        )}
                        {form.salaryType === "hourly" && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ставка (₸/час)</label>
                            <NumericInput
                              value={form.hourlyRate}
                              onChange={(v) => set("hourlyRate", v)}
                              placeholder="0"
                              suffix="₸"
                            />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ── Step 4: Summary ── */}
                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <div className="flex flex-col items-center pt-2 pb-2">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-white text-xl font-bold"
                        style={{ backgroundColor: "#1f75fe" }}>
                        {form.name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("")}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{form.name}</h3>
                      <span className={cn(
                        "inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border",
                        roleColor.bg, roleColor.text, roleColor.border,
                      )}>
                        {ROLE_LABEL[form.role]}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Email</p>
                          <p className="text-sm font-medium text-gray-800">{form.email}</p>
                        </div>
                      </div>
                      {form.phone && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Телефон</p>
                            <p className="text-sm font-medium text-gray-800">{form.phone}</p>
                          </div>
                        </div>
                      )}
                      {form.role === "doctor" && form.specialty && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Activity className="w-4 h-4 text-gray-400 shrink-0" />
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Специализация</p>
                            <p className="text-sm font-medium text-gray-800">{form.specialty}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Оплата</p>
                          <p className="text-sm font-medium text-gray-800">
                            {form.salaryType === "fixed" && `${form.fixedAmount.toLocaleString("ru-KZ")} ₸/мес`}
                            {form.salaryType === "commission" && `${form.commissionPercent}%`}
                            {form.salaryType === "fixed_plus_commission" && `${form.fixedAmount.toLocaleString("ru-KZ")} ₸ + ${form.commissionPercent}%`}
                            {form.salaryType === "hourly" && `${form.hourlyRate.toLocaleString("ru-KZ")} ₸/час`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
                      <Send className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#1f75fe" }} />
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Сотрудник получит письмо с временным паролем и ссылкой для входа. После первого входа он сможет сменить пароль.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 pt-3 flex flex-col gap-2.5 shrink-0 border-t border-gray-50">
              <div className="flex gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Назад
                  </button>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#1f75fe" }}
                  >
                    Далее
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate(form)}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: "#1f75fe" }}
                  >
                    <Send className="w-4 h-4" />
                    {inviteMutation.isPending ? "Добавление..." : "Добавить и отправить приглашение"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
