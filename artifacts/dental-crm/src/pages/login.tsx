import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { createLoginSchema, createResetPasswordSchema, type LoginFormValues } from "@/lib/schemas";
import { customFetch, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { persistAuthSession } from "@/lib/auth-session";
import { clearPersistedQueryCache } from "@/lib/query-persist";
import { clearBranchContext } from "@/lib/branch-context";
import { getPostLoginRedirectPath } from "@/lib/auth-redirect";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";
import {
  AuthField,
  AuthLink,
  AuthPageShell,
  AuthPrimaryButton,
} from "@/components/auth/auth-ui";
import { AppDialog } from "@/components/layout/app-dialog";
import { WhatsappOtpFlow } from "@/components/auth/whatsapp-otp-flow";
import { formatPhoneInput, phoneToApi, resetPasswordViaWhatsapp } from "@/lib/whatsapp-auth";

type LoginMode = "password" | "whatsapp-recovery";
type RecoveryStep = "otp" | "password";

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo");
  const initialMode: LoginMode =
    new URLSearchParams(search).get("mode") === "whatsapp" ? "whatsapp-recovery" : "password";
  const { setAuth } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("otp");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loginSchema = useMemo(() => createLoginSchema(), [t]);
  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(), [t]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  const phoneValue = watch("phone");

  function completeLogin(data: {
    user: Parameters<typeof persistAuthSession>[0]["user"];
    clinic: Parameters<typeof persistAuthSession>[0]["clinic"];
    token: string;
  }) {
    const cachedMe = queryClient.getQueryData<{ data?: { user?: { id?: string } } }>(
      getGetMeQueryKey(),
    );
    if (cachedMe?.data?.user?.id && cachedMe.data.user.id !== data.user.id) {
      clearPersistedQueryCache();
      clearBranchContext();
    }

    persistAuthSession({ user: data.user, clinic: data.clinic, token: data.token });
    setAuth(data.user, data.clinic);
    queryClient.setQueryData(getGetMeQueryKey(), {
      success: true,
      data: { user: data.user, clinic: data.clinic },
    });
    toast({
      title: t("auth.loginSuccessTitle"),
      description: t("auth.loginSuccessDesc", { clinic: data.clinic.name }),
    });
    setLocation(getPostLoginRedirectPath(returnTo, data.user.role, getRoleDashboardPath));
  }

  function resetRecoveryFlow() {
    setRecoveryStep("otp");
    setRecoveryPhone("");
    setRecoveryToken("");
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetSuccess(false);
  }

  function switchToPasswordLogin() {
    setMode("password");
    resetRecoveryFlow();
  }

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitting(true);
    try {
      const response = await customFetch<{
        success: boolean;
        data?: {
          user: Parameters<typeof persistAuthSession>[0]["user"];
          clinic: Parameters<typeof persistAuthSession>[0]["clinic"];
          token: string;
        };
      }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneToApi(data.phone),
          password: data.password,
        }),
      });

      if (!response.success || !response.data?.user || !response.data?.clinic || !response.data?.token) {
        toast({
          title: t("auth.loginErrorTitle"),
          description: t("auth.loginErrorDesc"),
          variant: "destructive",
        });
        return;
      }

      completeLogin(response.data);
    } catch (error) {
      toast({
        title: t("auth.loginErrorTitle"),
        description: getApiErrorMessage(error, t("auth.loginErrorDesc")),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");

    const parsed = resetPasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setResetError(parsed.error.errors[0]?.message ?? t("auth.resetValidationError"));
      return;
    }

    setResetting(true);
    try {
      await resetPasswordViaWhatsapp({
        phone: recoveryPhone,
        verificationToken: recoveryToken,
        newPassword: parsed.data.newPassword,
      });
      setResetSuccess(true);
    } catch (error) {
      setResetError(getApiErrorMessage(error, t("auth.resetError")));
    } finally {
      setResetting(false);
    }
  };

  return (
    <AuthPageShell hero="auth">
      {mode === "password" ? (
        <>
          <h2 className="text-xl font-bold text-[#0f172a] text-center mb-1">{t("auth.welcome")}</h2>
          <p className="text-sm text-[#64748b] text-center mb-5">{t("auth.subtitle")}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
            <AuthField label={t("auth.whatsappPhone")} error={errors.phone?.message}>
              <input
                type="tel"
                value={phoneValue}
                onChange={(e) => setValue("phone", formatPhoneInput(e.target.value), { shouldValidate: true })}
                placeholder="+7 700 000 00 00"
                autoComplete="tel"
                className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
              />
            </AuthField>

            <AuthField label={t("auth.password")} error={errors.password?.message}>
              <div className="flex items-center">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
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

            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  resetRecoveryFlow();
                  setMode("whatsapp-recovery");
                }}
                className="text-xs font-medium text-[#1f75fe] hover:underline transition-all duration-200"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>

            <AuthPrimaryButton type="submit" disabled={submitting}>
              {submitting ? t("auth.signingIn") : t("auth.signIn")}
            </AuthPrimaryButton>
          </form>

          <div className="text-center mt-4">
            <AuthLink href="/register">
              {t("auth.noAccount")}{" "}
              <span className="font-semibold text-[#1f75fe] hover:underline">{t("auth.createAccount")}</span>
            </AuthLink>
          </div>
        </>
      ) : recoveryStep === "otp" ? (
        <>
          <button
            type="button"
            onClick={switchToPasswordLogin}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors mb-4 -ml-1 p-1 rounded-lg hover:bg-[#faf8f4]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t("auth.backToPasswordLogin")}</span>
          </button>

          <WhatsappOtpFlow
            purpose="reset_password"
            title={t("auth.forgotTitle")}
            subtitle={t("auth.forgotWhatsappSubtitle")}
            onResetVerified={({ phone, verificationToken }) => {
              setRecoveryPhone(phone);
              setRecoveryToken(verificationToken);
              setRecoveryStep("password");
            }}
          />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRecoveryStep("otp")}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors mb-4 -ml-1 p-1 rounded-lg hover:bg-[#faf8f4]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t("auth.backToPasswordLogin")}</span>
          </button>

          <h2 className="text-xl font-bold text-[#0f172a] text-center mb-5">{t("auth.resetTitle")}</h2>

          <form onSubmit={handleResetPassword} className="space-y-2.5">
            <AuthField label={t("auth.resetNewPassword")}>
              <div className="flex items-center">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (resetError) setResetError("");
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={resetting}
                  className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2 p-1"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </AuthField>

            <AuthField label={t("auth.resetConfirmPassword")}>
              <div className="flex items-center">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (resetError) setResetError("");
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={resetting}
                  className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2 p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </AuthField>

            {resetError && (
              <p className="text-xs text-[#dc2626] font-medium px-1">{resetError}</p>
            )}

            <AuthPrimaryButton type="submit" disabled={resetting}>
              {resetting ? t("auth.resetSaving") : t("auth.resetSave")}
            </AuthPrimaryButton>
          </form>
        </>
      )}

      <AppDialog
        open={resetSuccess}
        onOpenChange={(open) => {
          if (!open) switchToPasswordLogin();
        }}
        title={t("auth.resetSuccessTitle")}
        size="sm"
        showClose={false}
        footer={
          <button
            type="button"
            onClick={switchToPasswordLogin}
            className="w-full text-base font-semibold text-[#1f75fe] py-2"
          >
            {t("auth.resetSuccessCta")}
          </button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1f75fe]/10 mb-4">
            <CheckCircle2 className="w-8 h-8 text-[#1f75fe]" />
          </div>
        </div>
      </AppDialog>
    </AuthPageShell>
  );
}
