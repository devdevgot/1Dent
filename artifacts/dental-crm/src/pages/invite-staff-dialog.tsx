import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Mail, User2, Phone, Calendar, ShieldCheck, Activity,
  BarChart3, Package, Wallet, Percent, Layers, Clock,
  ChevronLeft, ChevronDown, Send, AlertCircle, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { customFetch, getListUsersAllQueryKey } from "@workspace/api-client-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { AppDialog } from "@/components/layout/app-dialog";
import { cn } from "@/lib/utils";
import { formatPhoneInput, phoneToApi } from "@/lib/whatsapp-auth";

type Role = "admin" | "doctor" | "accountant" | "warehouse" | "assistant" | "nurse";
type SalaryType = "fixed" | "commission" | "fixed_plus_commission" | "hourly";

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
        <div className="flex flex-wrap gap-1.5 mb-2 animate-fade-in">
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
    color: "text-[#0284c7]",
    bg: "bg-[#e0f2fe]",
    border: "border-[#e0f2fe]",
  },
  {
    value: "doctor",
    icon: Activity,
    label: "Врач",
    desc: "Ведёт приём пациентов",
    color: "text-[#16a34a]",
    bg: "bg-[#f0fdf4]",
    border: "border-[#f0fdf4]",
  },
  {
    value: "accountant",
    icon: BarChart3,
    label: "Бухгалтер",
    desc: "Видит финансы",
    color: "text-[#d97706]",
    bg: "bg-[#fef3c7]",
    border: "border-[#fef3c7]",
  },
  {
    value: "warehouse",
    icon: Package,
    label: "Склад",
    desc: "Управляет материалами",
    color: "text-[#7c3aed]",
    bg: "bg-[#f5f3ff]",
    border: "border-[#f5f3ff]",
  },
  {
    value: "assistant",
    icon: User2,
    label: "Ассистент",
    desc: "Помогает врачу на приёме",
    color: "text-[#4f46e5]",
    bg: "bg-[#e0e7ff]",
    border: "border-[#e0e7ff]",
  },
  {
    value: "nurse",
    icon: User2,
    label: "Медсестра",
    desc: "Обеспечивает уход и порядок",
    color: "text-[#db2777]",
    bg: "bg-[#fce7f3]",
    border: "border-[#fce7f3]",
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
  assistant: "Ассистент",
  nurse: "Медсестра",
};

const ROLE_COLOR: Record<Role, { bg: string; text: string; border: string }> = {
  admin:      { bg: "bg-[#e0f2fe]",    text: "text-[#0284c7]",    border: "border-[#e0f2fe]" },
  doctor:     { bg: "bg-[#f0fdf4]", text: "text-[#16a34a]", border: "border-[#f0fdf4]" },
  accountant: { bg: "bg-[#fef3c7]",   text: "text-[#d97706]",   border: "border-[#fef3c7]" },
  warehouse:  { bg: "bg-[#f5f3ff]",   text: "text-[#7c3aed]",   border: "border-[#f5f3ff]" },
  assistant:  { bg: "bg-[#e0e7ff]",  text: "text-[#4f46e5]",  border: "border-[#e0e7ff]" },
  nurse:      { bg: "bg-[#fce7f3]",    text: "text-[#db2777]",    border: "border-[#fce7f3]" },
};

function isValidPhone(p: string) {
  return phoneToApi(p).length >= 11;
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
        className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-10 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm font-bold">{suffix}</span>
      )}
    </div>
  );
}

const STEP_LABELS = ["WhatsApp", "Информация", "Зарплата", "Приглашение"];

interface InviteStaffDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function InviteStaffDialog({ open, onClose }: InviteStaffDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InviteFormData>(DEFAULT_FORM);
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [nameError, setNameError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const isDirty = form.phone.trim() !== "" || form.name.trim() !== "" || form.email.trim() !== "";

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
          phone: phoneToApi(data.phone),
          specialty: (data.role === "doctor" || data.role === "assistant" || data.role === "nurse") && data.specialty ? data.specialty : undefined,
          maxPatientsPerDay: data.role === "doctor" && data.maxPatientsPerDay > 0 ? data.maxPatientsPerDay : undefined,
          hireDate: data.hireDate || undefined,
          salaryType: data.salaryType,
          fixedAmount: data.salaryType === "fixed" || data.salaryType === "fixed_plus_commission" ? data.fixedAmount : undefined,
          commissionPercent:
            data.salaryType === "commission"
            || data.salaryType === "fixed_plus_commission"
            || data.salaryType === "hourly"
              ? data.commissionPercent
              : undefined,
          hourlyRate: data.salaryType === "hourly" ? data.hourlyRate : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(false) });
      queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(true) });
      toast.success("Сотрудник добавлен", {
        description: `Данные для входа отправлены в WhatsApp на ${formatPhoneInput(form.phone)}`,
      });
      handleReset();
      onClose();
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number })?.status;
      const fallback = status === 429
        ? "Приглашение уже было отправлено. Подождите 60 секунд"
        : "Не удалось добавить сотрудника. Попробуйте ещё раз";
      const msg = getApiErrorMessage(
        err as { data?: unknown; message?: string },
        fallback,
      );
      toast.error("Ошибка", { description: msg });
    },
  });

  function handleReset() {
    setStep(1);
    setForm(DEFAULT_FORM);
    setPhoneError("");
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
      if (!isValidPhone(form.phone)) {
        setPhoneError("Введите корректный номер WhatsApp");
        return;
      }
      setPhoneError("");
      setStep(2);
    } else if (step === 2) {
      if (!form.name.trim()) {
        setNameError("Введите ФИО сотрудника");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setEmailError("Введите корректный email");
        return;
      }
      setNameError("");
      setEmailError("");
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  }

  const roleColor = ROLE_COLOR[form.role];

  return (
    <AppDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) tryClose(); }}
      title="Добавить сотрудника"
      description={`Шаг ${step} из 4 — ${STEP_LABELS[step - 1]}`}
      size="lg"
      bodyClassName="relative !py-0"
      footer={
        <div className="flex gap-3 w-full">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="dash-btn dash-btn-secondary flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              className="dash-btn dash-btn-primary flex-1 flex items-center justify-center gap-2"
            >
              Далее
              <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          ) : (
            <button
              type="button"
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate(form)}
              className="dash-btn dash-btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {inviteMutation.isPending ? "Добавление..." : "Добавить и отправить приглашение"}
            </button>
          )}
        </div>
      }
    >
      <AnimatePresence>
        {confirmClose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-[#d97706]" />
            </div>
            <p className="text-base font-bold text-[#0f172a] text-center mb-1">Закрыть без сохранения?</p>
            <p className="text-sm text-[#64748b] text-center mb-6">Введённые данные будут потеряны</p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="dash-btn dash-btn-secondary flex-1"
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={forceClose}
                className="dash-btn flex-1 rounded-full text-sm font-bold text-white bg-[var(--danger)] hover:bg-[#b91c1c]"
              >
                Закрыть
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pb-4 shrink-0">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "flex-1 h-1 rounded-full transition-all duration-300",
                s <= step ? "bg-[var(--ds-primary)]" : "bg-[#f1ede4]",
              )}
            />
          ))}
        </div>
      </div>

      <div className="pb-4">
              <AnimatePresence mode="wait">
                {/* ── Step 1: WhatsApp ── */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col items-center pt-4 pb-2"
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 bg-[#25D366]/10">
                      <MessageCircle className="w-7 h-7 text-[#128C7E]" />
                    </div>
                    <h3 className="text-lg font-bold text-[#0f172a] mb-1 text-center">WhatsApp сотрудника</h3>
                    <p className="text-sm text-[#94a3b8] text-center mb-6 leading-relaxed">
                      На этот номер придёт временный пароль<br />с официального номера 1Dent
                    </p>
                    <div className="w-full max-w-sm">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => {
                          set("phone", formatPhoneInput(e.target.value));
                          if (phoneError) setPhoneError("");
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") goNext(); }}
                        placeholder="+7 700 000 00 00"
                        className={cn(
                          "w-full border rounded-2xl px-5 py-4 text-base font-medium text-[#0f172a] text-center focus:outline-none focus:ring-2 transition-all duration-200",
                          "hover:border-[#cfc9bd]",
                          phoneError
                            ? "border-[#dc2626] focus:ring-[#dc2626]/20"
                            : "border-[#e8e3d9] focus:ring-[#25D366]/20 focus:border-[#25D366]",
                        )}
                      />
                      {phoneError && (
                        <p className="text-xs text-[#dc2626] mt-2 text-center">{phoneError}</p>
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
                      <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                        <User2 className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        ФИО *
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => { set("name", e.target.value); if (nameError) setNameError(""); }}
                        placeholder="Др. Иванова Мария"
                        className={cn(
                          "w-full border rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 transition-all duration-200 hover:border-[#cfc9bd]",
                          nameError ? "border-[#dc2626] focus:ring-[#dc2626]/20" : "border-[#e8e3d9] focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]",
                        )}
                      />
                      {nameError && <p className="text-xs text-[#dc2626] mt-1">{nameError}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                        <Mail className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        Email *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => { set("email", e.target.value); if (emailError) setEmailError(""); }}
                        placeholder="doctor@clinic.kz"
                        className={cn(
                          "w-full border rounded-xl px-4 py-3 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 transition-all duration-200 hover:border-[#cfc9bd]",
                          emailError ? "border-[#dc2626] focus:ring-[#dc2626]/20" : "border-[#e8e3d9] focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]",
                        )}
                      />
                      {emailError && <p className="text-xs text-[#dc2626] mt-1">{emailError}</p>}
                    </div>

                    {/* Phone summary */}
                    <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-4 py-3 flex items-center gap-3">
                      <MessageCircle className="w-4 h-4 text-[#128C7E] shrink-0" />
                      <div>
                        <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-wide">WhatsApp</p>
                        <p className="text-sm font-medium text-[#0f172a]">{formatPhoneInput(form.phone)}</p>
                      </div>
                    </div>

                    {/* Role cards */}
                    <div>
                      <label className="block text-xs font-semibold text-[#64748b] mb-2">Роль *</label>
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
                                "flex flex-col items-start gap-2 p-3.5 rounded-2xl border text-left transition-all duration-200",
                                selected
                                  ? `${r.bg} ${r.border} border-2`
                                  : "border-[#e8e3d9] bg-white hover:border-[#cfc9bd] hover:bg-[#faf8f4]",
                              )}
                            >
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", selected ? r.bg : "bg-[#f1ede4]")}>
                                <Icon className={cn("w-4 h-4", selected ? r.color : "text-[#94a3b8]")} />
                              </div>
                              <div>
                                <p className={cn("text-xs font-bold", selected ? r.color : "text-[#0f172a]")}>{r.label}</p>
                                <p className="text-[10px] text-[#94a3b8] leading-snug mt-0.5">{r.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Doctor-specific */}
                    {(form.role === "doctor" || form.role === "assistant" || form.role === "nurse") && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4"
                      >
                        <div>
                          <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                            Специализация
                          </label>
                          <SpecialtyTagInput
                            values={form.specialty ? form.specialty.split(",").map(s => s.trim()).filter(Boolean) : []}
                            onChange={(tags) => set("specialty", tags.join(", "))}
                            placeholder="Терапевт, Ортодонт..."
                          />
                        </div>
                        {form.role === "doctor" && (
                          <div>
                            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                              Макс. пациентов в день
                            </label>
                            <NumericInput
                              value={form.maxPatientsPerDay}
                              onChange={(v) => set("maxPatientsPerDay", v)}
                              placeholder="15"
                              max={50}
                            />
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Hire date */}
                    <div>
                      <label className="block text-xs font-semibold text-[#64748b] mb-1.5">
                        <Calendar className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                        Дата приёма на работу
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
                      <label className="block text-xs font-semibold text-[#64748b] mb-2">Тип оплаты</label>
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
                                "flex flex-col items-start gap-2 p-3.5 rounded-2xl border text-left transition-all duration-200",
                                selected
                                  ? "border-[#1f75fe] bg-[#1f75fe]/10 border-2"
                                  : "border-[#e8e3d9] bg-white hover:border-[#cfc9bd] hover:bg-[#faf8f4]",
                              )}
                            >
                              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", selected ? "bg-[#1f75fe]/10" : "bg-[#f1ede4]")}>
                                <Icon className={cn("w-4 h-4", selected ? "text-[#1f75fe]" : "text-[#94a3b8]")} />
                              </div>
                              <div>
                                <p className={cn("text-xs font-bold", selected ? "text-[#1f75fe]" : "text-[#0f172a]")}>{s.label}</p>
                                <p className="text-[10px] text-[#94a3b8] leading-snug mt-0.5">{s.desc}</p>
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
                            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">Оклад (₸/мес)</label>
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
                            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">Процент от выручки</label>
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
                                className="w-full border border-[#e8e3d9] rounded-xl px-4 py-3 pr-9 text-sm font-medium text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-sm font-bold">%</span>
                            </div>
                          </div>
                        )}
                        {form.salaryType === "hourly" && (
                          <div>
                            <label className="block text-xs font-semibold text-[#64748b] mb-1.5">Ставка (₸/час)</label>
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
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-white text-xl font-bold bg-[#1f75fe]">
                        {form.name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("")}
                      </div>
                      <h3 className="text-lg font-bold text-[#0f172a]">{form.name}</h3>
                      <span className={cn(
                        "inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border",
                        roleColor.bg, roleColor.text, roleColor.border,
                      )}>
                        {ROLE_LABEL[form.role]}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-[#e8e3d9] bg-[#faf8f4] divide-y divide-[#e8e3d9]">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Mail className="w-4 h-4 text-[#94a3b8] shrink-0" />
                        <div>
                          <p className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wide">Email</p>
                          <p className="text-sm font-medium text-[#0f172a]">{form.email}</p>
                        </div>
                      </div>
                      {form.phone && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Phone className="w-4 h-4 text-[#94a3b8] shrink-0" />
                          <div>
                            <p className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wide">Телефон</p>
                            <p className="text-sm font-medium text-[#0f172a]">{form.phone}</p>
                          </div>
                        </div>
                      )}
                      {(form.role === "doctor" || form.role === "assistant" || form.role === "nurse") && form.specialty && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <Activity className="w-4 h-4 text-[#94a3b8] shrink-0" />
                          <div>
                            <p className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wide">Специализация</p>
                            <p className="text-sm font-medium text-[#0f172a]">{form.specialty}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Wallet className="w-4 h-4 text-[#94a3b8] shrink-0" />
                        <div>
                          <p className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wide">Оплата</p>
                          <p className="text-sm font-medium text-[#0f172a]">
                            {form.salaryType === "fixed" && `${form.fixedAmount.toLocaleString("ru-KZ")} ₸/мес`}
                            {form.salaryType === "commission" && `${form.commissionPercent}%`}
                            {form.salaryType === "fixed_plus_commission" && `${form.fixedAmount.toLocaleString("ru-KZ")} ₸ + ${form.commissionPercent}%`}
                            {form.salaryType === "hourly" && `${form.hourlyRate.toLocaleString("ru-KZ")} ₸/час`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 px-4 py-3 flex items-start gap-3">
                      <MessageCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#128C7E]" />
                      <p className="text-xs text-[#64748b] leading-relaxed">
                        Сотрудник получит временный пароль в WhatsApp с номера 1Dent. Для входа используйте подтверждённый номер телефона.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
      </div>
    </AppDialog>
  );
}
