import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";

import { useForgotPassword } from "@workspace/api-client-react";
import { createForgotPasswordSchema } from "@/lib/schemas";
import { getApiErrorMessage } from "@/lib/api-error-message";

type Step = "form" | "sent";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState("");

  const forgotPasswordSchema = useMemo(() => createForgotPasswordSchema(), []);

  const forgotMutation = useForgotPassword({
    mutation: {
      onSuccess: (data) => {
        if (data.devToken) setDevToken(data.devToken);
        setStep("sent");
      },
      onError: (err) => {
        setError(getApiErrorMessage(err, "Произошла ошибка. Проверьте подключение."));
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Введите корректный email");
      return;
    }

    forgotMutation.mutate({ data: { email: parsed.data.email } });
  };

  return (
    <div className="min-h-screen w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      <div className="w-full max-w-sm mb-6">
        <Link href="/login">
          <button type="button" className="flex items-center gap-1.5 text-[#64748b] hover:text-[#0f172a] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6">
        <AnimatePresence mode="wait">
          {step === "form" ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-2xl font-bold text-[#0f172a] text-center mb-3">
                Восстановить пароль
              </h2>
              <p className="text-sm text-[#64748b] text-center mb-8 leading-relaxed">
                Введите email, который вы использовали при регистрации, чтобы установить новый пароль.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className={`
                  w-full px-4 py-3.5 rounded-xl border bg-white transition-all
                  ${error ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"}
                `}>
                  <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-0.5">
                    Email
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="doctor@clinic.com"
                    autoComplete="email"
                    disabled={forgotMutation.isPending}
                    className="w-full bg-transparent text-base text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
                  />
                </div>
                {error && (
                  <p className="text-xs text-[#dc2626] font-medium px-1">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={forgotMutation.isPending}
                  className="w-full py-4 rounded-full text-base font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 mt-2 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
                >
                  {forgotMutation.isPending ? "Отправляем..." : "Восстановить"}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20 rounded-full flex items-center justify-center bg-[#1f75fe]/10">
                  <Mail className="w-9 h-9 text-[#1f75fe]" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-[#0f172a] mb-3">
                Ссылка отправлена
              </h2>
              <p className="text-sm text-[#64748b] leading-relaxed mb-8">
                Если аккаунт с адресом{" "}
                <span className="font-semibold text-[#0f172a]">{email.trim()}</span>{" "}
                зарегистрирован, мы отправили ссылку для сброса пароля.
                Проверьте ящик входящих и папку «Спам».
              </p>

              {/* Dev mode: show direct link */}
              {devToken && (
                <div className="mb-6 p-4 rounded-2xl border border-dashed border-[#e8e3d9] bg-[#faf8f4] text-left">
                  <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">
                    Режим разработки
                  </p>
                  <p className="text-xs text-[#64748b] mb-3">
                    Email не настроен — используйте ссылку напрямую:
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setLocation(`/reset-password?token=${encodeURIComponent(devToken)}`)
                    }
                    className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 bg-[#1f75fe] hover:bg-[#1a65e8]"
                  >
                    Перейти к сбросу пароля →
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="w-full py-4 rounded-full text-base font-semibold text-[#64748b] border border-[#e8e3d9] hover:bg-[#f1ede4] transition-all duration-200 active:scale-95"
              >
                Вернуться ко входу
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
