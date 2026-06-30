import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { createRegisterSchema, type RegisterFormValues } from "@/lib/schemas";
import { useRegister } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { saveAuthToken } from "@/lib/auth-token";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  BarChart2,
  Building2,
  CalendarDays,
  Eye,
  EyeOff,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  Megaphone,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

const STEPS = [0, 1, 2] as const;
type Step = (typeof STEPS)[number];

const USE_CASES = [
  { id: "crm", label: "CRM", sub: "Управление пациентами", icon: UserRound },
  { id: "schedule", label: "Расписание", sub: "Онлайн-запись", icon: CalendarDays },
  { id: "whatsapp", label: "WhatsApp", sub: "Чат с пациентами", icon: MessageCircle },
  { id: "finance", label: "Финансы", sub: "Учёт платежей", icon: Wallet },
  { id: "analytics", label: "Аналитика", sub: "Отчёты и метрики", icon: BarChart2 },
  { id: "marketing", label: "Маркетинг", sub: "Привлечение пациентов", icon: Megaphone },
] as const;

function InputField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white transition-all ${
          error
            ? "border-[#dc2626] bg-[#fef2f2]"
            : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"
        }`}
      >
        <p className="section-label mb-0.5">
          {label}
        </p>
        {children}
      </div>
      {error && (
        <p className="text-caption text-[#dc2626] font-medium mt-1 px-1">{error}</p>
      )}
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-5">
      {[1, 2].map((s) => (
        <div
          key={s}
          className={`rounded-full transition-all duration-300 ${
            step >= s ? "w-5 h-1.5 bg-[#1f75fe]" : "w-1.5 h-1.5 bg-[#e8e3d9]"
          }`}
        />
      ))}
    </div>
  );
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
};

export default function Register() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setAuth } = useAuthStore();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);

  const toggleUseCase = (id: string) =>
    setSelectedUseCases((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );

  const registerSchema = useMemo(() => createRegisterSchema(), [t]);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (response) => {
        if (response.success) {
          const token = (response.data as typeof response.data & { token?: string }).token;
          if (token) saveAuthToken(token);
          setAuth(response.data.user, response.data.clinic);
          toast({
            title: t("register.successTitle"),
            description: t("register.successDesc", { name: response.data.user.name }),
          });
          localStorage.setItem("show_onboarding_wizard", "true");
          setLocation(getRoleDashboardPath(response.data.user.role));
        }
      },
      onError: (error) => {
        toast({
          title: t("register.errorTitle"),
          description: getApiErrorMessage(error, t("register.errorDesc")),
          variant: "destructive",
        });
      },
    },
  });

  const goForward = (to: Step) => {
    setDir(1);
    setStep(to);
  };

  const goBack = (to: Step) => {
    setDir(-1);
    setStep(to);
  };

  const handleStep1Next = async () => {
    const valid = await trigger(["name", "email", "password"]);
    if (valid) goForward(2);
  };

  const onSubmit = (data: RegisterFormValues) => {
    registerMutation.mutate({ data });
  };

  return (
    <div className="h-[100dvh] w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6">
        {/* Back button row */}
        <div className="h-8 mb-3 flex items-center">
          {step > 0 && (
            <button
              onClick={() => goBack((step - 1) as Step)}
              className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          {/* ───── STEP 0: Notice ───── */}
          {step === 0 && (
            <motion.div
              key="step0"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-sm bg-[#1f75fe]/10"
                >
                  <ShieldCheck className="w-7 h-7 text-[#1f75fe]" />
                </div>
                <h2 className="text-xl font-bold text-[#0f172a] mb-3">
                  Прежде чем начать
                </h2>
                <p className="text-body text-[#64748b] leading-relaxed">
                  Регистрация в <span className="font-semibold text-[#0f172a]">1Dent</span> предназначена
                  исключительно для <span className="font-semibold text-[#0f172a]">владельцев клиник</span>.
                </p>
                <p className="text-body text-[#64748b] leading-relaxed mt-2">
                  Если вы являетесь сотрудником клиники, пожалуйста, не создавайте новый аккаунт —
                  войдите в систему с помощью данных, которые вам предоставил руководитель.
                </p>
              </div>

              <button
                onClick={() => goForward(1)}
                className="w-full py-3 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
              >
                Я владелец клиники — продолжить
              </button>

              <div className="text-center mt-3">
                <Link href="/login" className="text-body text-[#94a3b8]">
                  Уже есть аккаунт?{" "}
                  <span className="font-semibold text-[#1f75fe]">Войти</span>
                </Link>
              </div>
            </motion.div>
          )}

          {/* ───── STEP 1: Personal info ───── */}
          {step === 1 && (
            <motion.div
              key="step1"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <StepDots step={1} />

              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                  <UserRound className="w-4 h-4 text-[#1f75fe]" />
                </div>
                <div>
                  <h2 className="text-body font-bold text-[#0f172a] leading-tight">
                    Личные данные
                  </h2>
                  <p className="text-caption text-[#94a3b8]">Шаг 1 из 2</p>
                </div>
              </div>

              <form className="space-y-2.5">
                <InputField label={t("register.ownerName")} error={errors.name?.message}>
                  <input
                    {...register("name")}
                    type="text"
                    placeholder={t("register.ownerNamePlaceholder")}
                    autoComplete="name"
                    className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                  />
                </InputField>

                <InputField label={t("register.adminEmail")} error={errors.email?.message}>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder={t("register.emailPlaceholder")}
                    autoComplete="email"
                    className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                  />
                </InputField>

                <InputField label={t("register.password")} error={errors.password?.message}>
                  <div className="flex items-center">
                    <input
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </InputField>

                <button
                  type="button"
                  onClick={handleStep1Next}
                  className="w-full py-3 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 mt-1 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
                >
                  Далее
                </button>
              </form>
            </motion.div>
          )}

          {/* ───── STEP 2: Clinic info ───── */}
          {step === 2 && (
            <motion.div
              key="step2"
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <StepDots step={2} />

              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#1f75fe]" />
                </div>
                <div>
                  <h2 className="text-body font-bold text-[#0f172a] leading-tight">
                    Данные клиники
                  </h2>
                  <p className="text-caption text-[#94a3b8]">Шаг 2 из 2</p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <InputField label={t("register.clinicName")} error={errors.clinicName?.message}>
                  <input
                    {...register("clinicName")}
                    type="text"
                    placeholder={t("register.clinicNamePlaceholder")}
                    autoComplete="organization"
                    className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                  />
                </InputField>

                {/* Use-case multi-select */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#1f75fe]" />
                    <p className="text-caption font-semibold text-[#64748b]">
                      Для чего планируете использовать?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {USE_CASES.map(({ id, label, sub, icon: Icon }) => {
                      const selected = selectedUseCases.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleUseCase(id)}
                          className={`
                            flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left
                            transition-all duration-150 active:scale-[0.97]
                            ${selected
                              ? "border-[#1f75fe] bg-[#1f75fe]/5"
                              : "border-[#e8e3d9] bg-white hover:border-[#d4cfc6]"}
                          `}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              selected ? "bg-[#1f75fe]/15" : "bg-[#faf8f4]"
                            }`}
                          >
                            <Icon
                              className={`w-3.5 h-3.5 transition-colors ${
                                selected ? "text-[#1f75fe]" : "text-[#94a3b8]"
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`text-caption font-semibold leading-tight truncate ${
                                selected ? "text-[#0f172a]" : "text-[#64748b]"
                              }`}
                            >
                              {label}
                            </p>
                            <p className="text-micro text-[#94a3b8] leading-tight truncate">{sub}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full py-3 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
                >
                  {registerMutation.isPending ? t("register.submitting") : "Создать клинику"}
                </button>
              </form>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
