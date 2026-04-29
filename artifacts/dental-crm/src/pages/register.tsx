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
import { ArrowLeft, Building2, Eye, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

const STEPS = [0, 1, 2] as const;
type Step = (typeof STEPS)[number];

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
        className={`w-full px-3.5 py-2.5 rounded-xl border-2 bg-gray-50 transition-all ${
          error
            ? "border-destructive bg-red-50"
            : "border-gray-200 focus-within:border-primary focus-within:bg-white"
        }`}
      >
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
          {label}
        </p>
        {children}
      </div>
      {error && (
        <p className="text-xs text-destructive font-medium mt-1 px-1">{error}</p>
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
            step >= s ? "w-5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-gray-200"
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
          setLocation(getRoleDashboardPath(response.data.user.role));
        }
      },
      onError: (error) => {
        toast({
          title: t("register.errorTitle"),
          description: (error.data as { error?: string })?.error || t("register.errorDesc"),
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
    <div className="h-[100dvh] w-full bg-white flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="w-full max-w-sm">
        {/* Back button row */}
        <div className="h-8 mb-3 flex items-center">
          {step > 0 && (
            <button
              onClick={() => goBack((step - 1) as Step)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors"
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
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
                  style={{ backgroundColor: "#f0f9d6" }}
                >
                  <ShieldCheck className="w-7 h-7" style={{ color: "#98cc1c" }} />
                </div>
                <h2 className="text-xl font-display font-bold text-gray-900 mb-3">
                  Прежде чем начать
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Регистрация в <span className="font-semibold text-gray-700">1Dent</span> предназначена
                  исключительно для <span className="font-semibold text-gray-700">владельцев клиник</span>.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed mt-2">
                  Если вы являетесь сотрудником клиники, пожалуйста, не создавайте новый аккаунт —
                  войдите в систему с помощью данных, которые вам предоставил руководитель.
                </p>
              </div>

              <button
                onClick={() => goForward(1)}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]"
                style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
              >
                Я владелец клиники — продолжить
              </button>

              <div className="text-center mt-3">
                <Link href="/login" className="text-sm text-gray-400">
                  Уже есть аккаунт?{" "}
                  <span className="font-semibold text-gray-600">Войти</span>
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
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UserRound className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-display font-bold text-gray-900 leading-tight">
                    Личные данные
                  </h2>
                  <p className="text-xs text-gray-400">Шаг 1 из 2</p>
                </div>
              </div>

              <form className="space-y-2.5">
                <InputField label={t("register.ownerName")} error={errors.name?.message}>
                  <input
                    {...register("name")}
                    type="text"
                    placeholder={t("register.ownerNamePlaceholder")}
                    autoComplete="name"
                    className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                </InputField>

                <InputField label={t("register.adminEmail")} error={errors.email?.message}>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder={t("register.emailPlaceholder")}
                    autoComplete="email"
                    className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                </InputField>

                <InputField label={t("register.password")} error={errors.password?.message}>
                  <div className="flex items-center">
                    <input
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </InputField>

                <button
                  type="button"
                  onClick={handleStep1Next}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98] mt-1"
                  style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
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
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-display font-bold text-gray-900 leading-tight">
                    Данные клиники
                  </h2>
                  <p className="text-xs text-gray-400">Шаг 2 из 2</p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
                <InputField label={t("register.clinicName")} error={errors.clinicName?.message}>
                  <input
                    {...register("clinicName")}
                    type="text"
                    placeholder={t("register.clinicNamePlaceholder")}
                    autoComplete="organization"
                    className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                </InputField>

                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-1"
                  style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
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
