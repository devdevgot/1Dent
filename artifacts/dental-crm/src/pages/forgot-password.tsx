import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

import { getBaseUrl } from "@/lib/base-url";

type Step = "form" | "sent";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBase = getBaseUrl();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Введите email");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      const data = await res.json() as { success?: boolean; devToken?: string };
      if (data.success) {
        if (data.devToken) setDevToken(data.devToken);
        setStep("sent");
      } else {
        setError("Произошла ошибка. Попробуйте снова.");
      }
    } catch {
      setError("Произошла ошибка. Проверьте подключение.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      <div className="w-full max-w-sm mb-6">
        <Link href="/login">
          <button className="flex items-center gap-1.5 text-[#64748b] hover:text-[#0f172a] transition-colors">
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
              <h2 className="text-2xl font-manrope font-bold text-[#0f172a] text-center mb-3">
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
                  <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-0.5">
                    Email
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@clinic.com"
                    autoComplete="email"
                    className="w-full bg-transparent text-base text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                  />
                </div>
                {error && (
                  <p className="text-xs text-[#dc2626] font-medium px-1">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-full text-base font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 mt-2 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
                >
                  {loading ? "Отправляем..." : "Восстановить"}
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

              <h2 className="text-2xl font-manrope font-bold text-[#0f172a] mb-3">
                Ссылка отправлена
              </h2>
              <p className="text-sm text-[#64748b] leading-relaxed mb-8">
                Мы отправили ссылку для сброса пароля на{" "}
                <span className="font-semibold text-[#0f172a]">{email}</span>.
                Проверьте ящик входящих и папку «Спам».
              </p>

              {/* Dev mode: show direct link */}
              {devToken && (
                <div className="mb-6 p-4 rounded-2xl border border-dashed border-[#e8e3d9] bg-[#faf8f4] text-left">
                  <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">
                    Режим разработки
                  </p>
                  <p className="text-xs text-[#64748b] mb-3">
                    Email не настроен — используйте ссылку напрямую:
                  </p>
                  <button
                    onClick={() => setLocation(`/reset-password?token=${devToken}`)}
                    className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 bg-[#1f75fe] hover:bg-[#1a65e8]"
                  >
                    Перейти к сбросу пароля →
                  </button>
                </div>
              )}

              <button
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
