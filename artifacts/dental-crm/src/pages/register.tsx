import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { createRegisterSchema, type RegisterFormValues } from "@/lib/schemas";
import { useRegister } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { saveAuthToken } from "@/lib/auth-token";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

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
      <div className={`
        w-full px-3.5 py-2.5 rounded-xl border-2 bg-gray-50 transition-all
        ${error ? "border-destructive bg-red-50" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
      `}>
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

export default function Register() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setAuth } = useAuthStore();
  const { toast } = useToast();

  const registerSchema = useMemo(() => createRegisterSchema(), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
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

  const onSubmit = (data: RegisterFormValues) => {
    registerMutation.mutate({ data });
  };

  return (
    <div className="h-[100dvh] w-full bg-white flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="w-full max-w-sm">
        {/* Back button */}
        <div className="mb-4">
          <Link href="/login">
            <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Title */}
          <h2 className="text-xl font-display font-bold text-gray-900 text-center mb-5">
            {t("register.title")}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5">
            {/* Clinic Name */}
            <InputField label={t("register.clinicName")} error={errors.clinicName?.message}>
              <input
                {...register("clinicName")}
                type="text"
                placeholder={t("register.clinicNamePlaceholder")}
                autoComplete="organization"
                className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
              />
            </InputField>

            {/* Owner Name */}
            <InputField label={t("register.ownerName")} error={errors.name?.message}>
              <input
                {...register("name")}
                type="text"
                placeholder={t("register.ownerNamePlaceholder")}
                autoComplete="name"
                className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
              />
            </InputField>

            {/* Email */}
            <InputField label={t("register.adminEmail")} error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder={t("register.emailPlaceholder")}
                autoComplete="email"
                className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
              />
            </InputField>

            {/* Password */}
            <InputField label={t("register.password")} error={errors.password?.message}>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-300 outline-none"
              />
            </InputField>

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-1"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              {registerMutation.isPending ? t("register.submitting") : t("register.submit")}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-4 leading-relaxed">
            {t("users.registrationNote")}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
