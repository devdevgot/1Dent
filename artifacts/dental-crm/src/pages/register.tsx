import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { createRegisterSchema, type RegisterFormValues } from "@/lib/schemas";
import { useRegister } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Building2, User, Mail, Lock, ArrowRight } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { useTranslation } from "react-i18next";

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

  const features = [
    t("register.feature1"),
    t("register.feature2"),
    t("register.feature3"),
    t("register.feature4"),
  ];

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
        <div className="absolute top-8 left-8">
          <Link
            href="/login"
            className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center"
          >
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" /> {t("register.backToLogin")}
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md pt-16 lg:pt-0"
        >
          <div className="mb-10">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">{t("register.title")}</h2>
            <p className="text-muted-foreground">{t("register.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t("register.clinicName")}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("clinicName")}
                  type="text"
                  placeholder={t("register.clinicNamePlaceholder")}
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.clinicName ? "border-destructive" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.clinicName && (
                <p className="text-sm text-destructive font-medium mt-1">{errors.clinicName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t("register.ownerName")}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("name")}
                  type="text"
                  placeholder={t("register.ownerNamePlaceholder")}
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.name ? "border-destructive" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.name && (
                <p className="text-sm text-destructive font-medium mt-1">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t("register.adminEmail")}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("email")}
                  type="email"
                  placeholder={t("register.emailPlaceholder")}
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.email ? "border-destructive" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive font-medium mt-1">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t("register.password")}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("password")}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.password ? "border-destructive" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive font-medium mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full mt-6 group flex items-center justify-center px-6 py-3.5 text-base font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {registerMutation.isPending ? t("register.submitting") : t("register.submit")}
              {!registerMutation.isPending && (
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              )}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Right branding panel */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-slate-900 items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
            alt="Dental CRM"
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent" />
        </div>
        <div className="relative z-10 p-12 max-w-lg text-white">
          <h2 className="font-display font-bold text-4xl mb-4 leading-tight">{t("register.heroTitle")}</h2>
          <ul className="space-y-4 mt-8">
            {features.map((feature, i) => (
              <li key={i} className="flex items-center text-lg text-white/90">
                <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center mr-4 shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
