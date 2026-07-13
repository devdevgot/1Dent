import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  createRegisterSchema,
  REGISTRATION_USE_CASES,
  type RegisterFormValues,
} from "@/lib/schemas";
import { getGetMeQueryKey, customFetch } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { persistAuthSession } from "@/lib/auth-session";
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
  Sparkles,
  UserRound,
  Wallet,
  Megaphone,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";
import {
  AuthField,
  AuthLink,
  AuthPageShell,
  AuthPrimaryButton,
} from "@/components/auth/auth-ui";
import { RegisterDisclaimerStep } from "@/components/auth/register-disclaimer-step";
import { WhatsappOtpFlow } from "@/components/auth/whatsapp-otp-flow";
import { formatPhoneInput } from "@/lib/whatsapp-auth";
import { cn } from "@/lib/utils";

const STEPS = [0, 1, 2, 3] as const;
type Step = (typeof STEPS)[number];

const USE_CASE_ICONS = {
  crm: UserRound,
  schedule: CalendarDays,
  whatsapp: MessageCircle,
  finance: Wallet,
  analytics: BarChart2,
  marketing: Megaphone,
} as const;

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-5">
      {[1, 2, 3].map((s) => (
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
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [phoneVerificationToken, setPhoneVerificationToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleUseCase = (id: string) =>
    setSelectedUseCases((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
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

  const goForward = (to: Step) => {
    setDir(1);
    setStep(to);
  };

  const goBack = (to: Step) => {
    setDir(-1);
    setStep(to);
  };

  const handleStep2Next = async () => {
    const valid = await trigger(["name", "password"]);
    if (valid) goForward(3);
  };

  const onSubmit = async (data: RegisterFormValues) => {
    setSubmitting(true);
    try {
      const response = await customFetch<{
        success: boolean;
        data?: {
          user: Parameters<typeof persistAuthSession>[0]["user"];
          clinic: Parameters<typeof persistAuthSession>[0]["clinic"];
          token: string;
        };
      }>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          phone: verifiedPhone,
          phoneVerificationToken,
          useCases: selectedUseCases,
        }),
      });

      if (!response.success || !response.data?.user || !response.data?.clinic) {
        toast({
          title: t("register.errorTitle"),
          description: t("register.errorDesc"),
          variant: "destructive",
        });
        return;
      }

      persistAuthSession(response.data);
      setAuth(response.data.user, response.data.clinic);
      queryClient.setQueryData(getGetMeQueryKey(), {
        success: true,
        data: { user: response.data.user, clinic: response.data.clinic },
      });
      toast({
        title: t("register.successTitle"),
        description: t("register.successDesc", { name: response.data.user.name }),
      });
      setLocation(getRoleDashboardPath(response.data.user.role));
    } catch (error) {
      toast({
        title: t("register.errorTitle"),
        description: getApiErrorMessage(error, t("register.errorDesc")),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageShell wide={step === 3} hero="register" hideMobileBranding={step === 0}>
      <div className="h-8 mb-2 flex items-center justify-between">
        {step > 0 ? (
          <button
            onClick={() => goBack((step - 1) as Step)}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors duration-200 p-1 -ml-1 rounded-lg hover:bg-[#faf8f4]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <span />
        )}
        {step > 0 && (
          <AuthLink href="/login">
            <span className="text-xs">{t("register.backToLogin")}</span>
          </AuthLink>
        )}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
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
            <RegisterDisclaimerStep onContinue={() => goForward(1)} />
          </motion.div>
        )}

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
            <WhatsappOtpFlow
              purpose="register"
              title={t("register.whatsappTitle")}
              subtitle={t("register.whatsappSubtitle")}
              onRegisterVerified={({ phone, verificationToken }) => {
                setVerifiedPhone(phone);
                setPhoneVerificationToken(verificationToken);
                goForward(2);
              }}
            />
          </motion.div>
        )}

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
                <UserRound className="w-4 h-4 text-[#1f75fe]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0f172a] leading-tight">{t("register.profileTitle")}</h2>
                <p className="text-xs text-[#94a3b8]">
                  {t("register.profileSubtitle", { phone: formatPhoneInput(verifiedPhone) })}
                </p>
              </div>
            </div>

            <form className="space-y-2.5">
              <AuthField label={t("register.ownerName")} error={errors.name?.message}>
                <input
                  {...register("name")}
                  type="text"
                  placeholder={t("register.ownerNamePlaceholder")}
                  autoComplete="name"
                  className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                />
              </AuthField>

              <AuthField label={t("register.password")} error={errors.password?.message}>
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
                    className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2 p-1 rounded-md hover:bg-[#faf8f4]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </AuthField>

              <p className="text-xs text-[#94a3b8] px-1">{t("register.passwordHint")}</p>

              <AuthPrimaryButton type="button" onClick={handleStep2Next}>
                {t("register.next")}
              </AuthPrimaryButton>
            </form>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <StepDots step={3} />

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-[#1f75fe]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0f172a] leading-tight">{t("register.clinicStepTitle")}</h2>
                <p className="text-xs text-[#94a3b8]">{t("register.clinicStepSubtitle")}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <AuthField label={t("register.clinicName")} error={errors.clinicName?.message}>
                <input
                  {...register("clinicName")}
                  type="text"
                  placeholder={t("register.clinicNamePlaceholder")}
                  autoComplete="organization"
                  className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                />
              </AuthField>

              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#1f75fe]" />
                  <p className="text-xs font-semibold text-[#64748b]">
                    {t("register.useCaseTitle")}
                  </p>
                </div>
                <p className="text-xs text-[#94a3b8] mb-3">{t("register.useCaseHint")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {REGISTRATION_USE_CASES.map(({ id, labelKey, subKey }) => {
                    const selected = selectedUseCases.includes(id);
                    const Icon = USE_CASE_ICONS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleUseCase(id)}
                        className={cn(
                          "flex flex-col items-start gap-2 px-3 py-3 rounded-xl border text-left transition-all duration-200 active:translate-y-px min-h-[88px]",
                          selected
                            ? "border-[#1f75fe] bg-[#1f75fe]/5 shadow-sm"
                            : "border-[#e8e3d9] bg-white hover:border-[#cfc9bd] hover:bg-[#faf8f4]",
                        )}
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
                            className={`text-xs font-semibold leading-tight ${
                              selected ? "text-[#0f172a]" : "text-[#64748b]"
                            }`}
                          >
                            {t(labelKey)}
                          </p>
                          <p className="text-[11px] text-[#94a3b8] leading-tight mt-0.5">{t(subKey)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <AuthPrimaryButton type="submit" disabled={submitting}>
                {submitting ? t("register.submitting") : t("register.submit")}
              </AuthPrimaryButton>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthPageShell>
  );
}
