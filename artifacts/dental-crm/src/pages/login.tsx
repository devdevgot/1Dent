import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { createLoginSchema, type LoginFormValues } from "@/lib/schemas";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { persistAuthSession } from "@/lib/auth-session";
import { clearPersistedQueryCache } from "@/lib/query-persist";
import { clearBranchContext } from "@/lib/branch-context";
import { getPostLoginRedirectPath } from "@/lib/auth-redirect";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
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

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo");
  const { setAuth } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"whatsapp" | "email">("whatsapp");

  const loginSchema = useMemo(() => createLoginSchema(), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (response) => {
        if (!response.success || !response.data?.user || !response.data?.clinic) {
          toast({
            title: t("auth.loginErrorTitle"),
            description: t("auth.loginErrorDesc"),
            variant: "destructive",
          });
          return;
        }

        const cachedMe = queryClient.getQueryData<{ data?: { user?: { id?: string } } }>(
          getGetMeQueryKey(),
        );
        if (cachedMe?.data?.user?.id && cachedMe.data.user.id !== response.data.user.id) {
          clearPersistedQueryCache();
          clearBranchContext();
        }

        persistAuthSession(response.data);
        setAuth(response.data.user, response.data.clinic);
        queryClient.setQueryData(getGetMeQueryKey(), {
          success: true,
          data: { user: response.data.user, clinic: response.data.clinic },
        });
        toast({
          title: t("auth.loginSuccessTitle"),
          description: t("auth.loginSuccessDesc", { clinic: response.data.clinic.name }),
        });
        setLocation(
          getPostLoginRedirectPath(returnTo, response.data.user.role, getRoleDashboardPath),
        );
      },
      onError: (error) => {
        toast({
          title: t("auth.loginErrorTitle"),
          description: getApiErrorMessage(error, t("auth.loginErrorDesc")),
          variant: "destructive",
        });
      },
    },
  });

  function handleWhatsappLogin(data: {
    user: Parameters<typeof persistAuthSession>[0]["user"];
    clinic: Parameters<typeof persistAuthSession>[0]["clinic"];
    token: string;
  }) {
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

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ data });
  };

  return (
    <AuthPageShell>
      {mode === "whatsapp" ? (
        <>
          <WhatsappOtpFlow
            purpose="login"
            title={t("auth.welcome")}
            subtitle="Мы отправим одноразовый код в WhatsApp с номера 1Dent"
            onLoginSuccess={handleWhatsappLogin}
          />

          <div className="mt-5 pt-4 border-t border-[#f1ede4] space-y-2 text-center">
            <button
              type="button"
              onClick={() => setMode("email")}
              className="text-sm font-medium text-[#64748b] hover:text-[#1f75fe] transition-colors duration-200"
            >
              Войти по email и паролю
            </button>
            <div>
              <AuthLink href="/register">
                Нет аккаунта? <span className="font-semibold text-[#1f75fe] hover:underline">Создать</span>
              </AuthLink>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-[#0f172a] text-center mb-5">{t("auth.welcome")}</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
            <AuthField label={t("auth.email")} error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="doctor@clinic.com"
                autoComplete="email"
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
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[#1f75fe] hover:underline transition-all duration-200"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <AuthPrimaryButton type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
            </AuthPrimaryButton>
          </form>

          <div className="mt-5 pt-4 border-t border-[#f1ede4] space-y-2 text-center">
            <button
              type="button"
              onClick={() => setMode("whatsapp")}
              className="text-sm font-medium text-[#64748b] hover:text-[#128C7E] transition-colors duration-200"
            >
              Войти через WhatsApp
            </button>
            <div>
              <AuthLink href="/register">
                Нет аккаунта? <span className="font-semibold text-[#1f75fe] hover:underline">Создать</span>
              </AuthLink>
            </div>
          </div>
        </>
      )}
    </AuthPageShell>
  );
}
