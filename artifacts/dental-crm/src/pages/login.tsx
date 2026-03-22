import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { loginSchema, type LoginFormValues } from "@/lib/schemas";
import { useLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";

export default function Login() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuthStore();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema)
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (response) => {
        if (response.success) {
          setAuth(response.data.user, response.data.clinic);
          toast({
            title: "Добро пожаловать!",
            description: `Вход в ${response.data.clinic.name}`,
          });
          setLocation(getRoleDashboardPath(response.data.user.role));
        }
      },
      onError: (error) => {
        toast({
          title: "Ошибка входа",
          description: (error.data as { error?: string })?.error || "Проверьте данные и попробуйте снова.",
          variant: "destructive"
        });
      }
    }
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({ data });
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Левая панель — брендинг */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-slate-900 items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
            alt="Dental CRM" 
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
        <div className="relative z-10 p-12 max-w-lg text-white">
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.png`} 
            alt="Dental CRM" 
            className="w-16 h-16 object-contain mb-8 bg-white/10 p-2 rounded-2xl backdrop-blur-md"
          />
          <h1 className="font-display font-bold text-5xl mb-6 leading-tight">
            Антивор: операционная система для стоматологических клиник.
          </h1>
          <p className="text-xl text-white/80 font-light">
            Безопасная мультитенантная архитектура. Централизованные AI-коммуникации. Полный контроль над клиническими процессами.
          </p>
        </div>
      </div>

      {/* Правая панель — форма */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute top-8 right-8">
          <span className="text-sm text-muted-foreground mr-2">Новая клиника?</span>
          <Link href="/register" className="text-sm font-semibold text-primary hover:underline">
            Создать аккаунт
          </Link>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-10">
            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Добро пожаловать</h2>
            <p className="text-muted-foreground">Введите ваши данные для входа.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("email")}
                  type="email"
                  placeholder="doctor@clinic.com"
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.email ? "border-destructive focus:ring-destructive/20" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.email && <p className="text-sm text-destructive font-medium mt-1">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-foreground">Пароль</label>
                <a href="#" className="text-sm font-medium text-primary hover:underline">Забыли пароль?</a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  {...register("password")}
                  type="password"
                  placeholder="••••••••"
                  className={`
                    w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border-2 outline-none transition-all
                    ${errors.password ? "border-destructive focus:ring-destructive/20" : "border-transparent focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]"}
                  `}
                />
              </div>
              {errors.password && <p className="text-sm text-destructive font-medium mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full mt-8 group flex items-center justify-center px-6 py-3.5 text-base font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loginMutation.isPending ? "Вход..." : "Войти"}
              {!loginMutation.isPending && <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
