import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { createLoginSchema, type LoginFormValues } from "@/lib/schemas";
import { useLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setAuth } = useAuthStore();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const loginSchema = useMemo(() => createLoginSchema(), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (response) => {
        if (response.success) {
          setAuth(response.data.user, response.data.clinic);
          toast({
            title: t("auth.loginSuccessTitle"),
            description: t("auth.loginSuccessDesc", { clinic: response.data.clinic.name }),
          });
          setLocation(getRoleDashboardPath(response.data.user.role));
        }
      },
      onError: (error) => {
        toast({
          title: t("auth.loginErrorTitle"),
          description: (error.data as { error?: string })?.error || t("auth.loginErrorDesc"),
          variant: "destructive",
        });
      },
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ data });
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-4 shadow-lg"
            style={{ backgroundColor: "#98cc1c" }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path
                d="M20 6C16.5 6 14 8 13 10.5C12 9 10 8 8 8.5C5 9.5 4 13 5 16C6 19 9 20.5 9 22C9 24 8 28 9 31C10 34 13 35 15 33C16.5 31.5 17 28 18 26H22C23 28 23.5 31.5 25 33C27 35 30 34 31 31C32 28 31 24 31 22C31 20.5 34 19 35 16C36 13 35 9.5 32 8.5C30 8 28 9 27 10.5C26 8 23.5 6 20 6Z"
                fill="white"
                fillOpacity="0.95"
              />
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold text-gray-900">Dental CRM</h1>
          <p className="text-sm text-gray-400 mt-0.5">Управление клиникой</p>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-7">
          {t("auth.welcome")}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Email field */}
          <div>
            <div className={`
              w-full px-4 py-3.5 rounded-2xl border-2 bg-gray-50 transition-all
              ${errors.email ? "border-destructive bg-red-50" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
            `}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                {t("auth.email")}
              </p>
              <input
                {...register("email")}
                type="email"
                placeholder="doctor@clinic.com"
                autoComplete="email"
                className="w-full bg-transparent text-base text-gray-900 placeholder:text-gray-300 outline-none"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive font-medium mt-1.5 px-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password field */}
          <div>
            <div className={`
              w-full px-4 py-3.5 rounded-2xl border-2 bg-gray-50 transition-all relative
              ${errors.password ? "border-destructive bg-red-50" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
            `}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                {t("auth.password")}
              </p>
              <div className="flex items-center">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive font-medium mt-1.5 px-1">{errors.password.message}</p>
            )}
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-destructive hover:opacity-80 transition-opacity">
              {t("auth.forgotPassword")}
            </Link>
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-4 rounded-2xl text-base font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
            style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
          >
            {loginMutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
          </button>

          {/* Register link */}
          <Link href="/register">
            <button
              type="button"
              className="w-full py-4 rounded-2xl text-base font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all duration-200 active:scale-[0.98]"
            >
              {t("auth.createAccount")}
            </button>
          </Link>
        </form>
      </motion.div>
    </div>
  );
}
