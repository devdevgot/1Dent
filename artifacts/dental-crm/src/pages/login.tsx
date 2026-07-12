import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { createLoginSchema, type LoginFormValues } from "@/lib/schemas";
import { customFetch, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { persistAuthSession } from "@/lib/auth-session";
import { clearPersistedQueryCache } from "@/lib/query-persist";
import { clearBranchContext } from "@/lib/branch-context";
import { getPostLoginRedirectPath } from "@/lib/auth-redirect";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";
import {
  AuthField,
  AuthLink,
  AuthPageShell,
  AuthPrimaryButton,
} from "@/components/auth/auth-ui";
import { WhatsappOtpFlow } from "@/components/auth/whatsapp-otp-flow";
import { formatPhoneInput, phoneToApi } from "@/lib/whatsapp-auth";

type LoginMode = "password" | "whatsapp-recovery";

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
  const [submitting, setSubmitting] = useState(false);

  const loginSchema = useMemo(() => createLoginSchema(), [t]);

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
                onClick={() => setMode("whatsapp-recovery")}
                className="text-xs font-medium text-[#1f75fe] hover:underline transition-all duration-200"
              >
                {t("auth.forgotPasswordWhatsapp")}
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
      ) : (
        <>
          <button
            type="button"
            onClick={() => setMode("password")}
            className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors mb-4 -ml-1 p-1 rounded-lg hover:bg-[#faf8f4]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t("auth.backToPasswordLogin")}</span>
          </button>

          <WhatsappOtpFlow
            purpose="login"
            title={t("auth.recoveryTitle")}
            subtitle={t("auth.recoverySubtitle")}
            onLoginSuccess={completeLogin}
          />
        </>
      )}
    </AuthPageShell>
  );
}
