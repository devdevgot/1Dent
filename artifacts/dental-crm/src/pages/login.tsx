import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { createLoginSchema, type LoginFormValues } from "@/lib/schemas";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { persistAuthSession } from "@/lib/auth-session";
import { getPostLoginRedirectPath } from "@/lib/auth-redirect";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo");
  const { setAuth } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

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

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ data });
  };

  return (
    <div className="h-[100dvh] w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-center px-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <img
            src="/logo.png"
            alt="1Dent"
            className="w-20 h-20 mb-3"
          />
          <h1 className="text-lg font-bold text-[#0f172a]">1Dent</h1>
          <p className="text-caption text-[#94a3b8] mt-0.5">Управление клиникой</p>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-[#0f172a] text-center mb-5">
          {t("auth.welcome")}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
          {/* Email field */}
          <div>
            <div className={`
              w-full px-3.5 py-2.5 rounded-xl border bg-white transition-all
              ${errors.email ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"}
            `}>
              <p className="section-label mb-0.5">
                {t("auth.email")}
              </p>
              <input
                {...register("email")}
                type="email"
                placeholder="doctor@clinic.com"
                autoComplete="email"
                className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-[#dc2626] font-medium mt-1 px-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password field */}
          <div>
            <div className={`
              w-full px-3.5 py-2.5 rounded-xl border bg-white transition-all relative
              ${errors.password ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"}
            `}>
              <p className="section-label mb-0.5">
                {t("auth.password")}
              </p>
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
                  className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {errors.password && (
              <p className="text-xs text-[#dc2626] font-medium mt-1 px-1">{errors.password.message}</p>
            )}
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-caption font-medium text-[#1f75fe] hover:opacity-80 transition-opacity">
              {t("auth.forgotPassword")}
            </Link>
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-3 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 mt-1 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
          >
            {loginMutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
          </button>

          {/* Register link */}
          <div className="text-center pt-1">
            <Link href="/register" className="text-body text-[#94a3b8]">
              Нет аккаунта?{" "}
              <span className="font-semibold text-[#1f75fe]">Создать</span>
            </Link>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
