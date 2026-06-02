import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

type Step = "form" | "sent";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

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
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      <div className="w-full max-w-sm mb-6">
        <Link href="/login">
          <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
      </div>

      <div className="w-full max-w-sm">
        <AnimatePresence mode="wait">
          {step === "form" ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-3">
                Восстановить пароль
              </h2>
              <p className="text-sm text-gray-500 text-center mb-8 leading-relaxed">
                Введите email, который вы использовали при регистрации, чтобы установить новый пароль.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className={`
                  w-full px-4 py-3.5 rounded-2xl border-2 bg-gray-50 transition-all
                  ${error ? "border-destructive bg-red-50" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
                `}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                    Email
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@clinic.com"
                    autoComplete="email"
                    className="w-full bg-transparent text-base text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                </div>
                {error && (
                  <p className="text-xs text-destructive font-medium px-1">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl text-base font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
                  style={{ backgroundColor: "#1f75fe", color: "#ffffff" }}
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
                <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: "#eff6ff" }}>
                  <Mail className="w-9 h-9" style={{ color: "#1f75fe" }} />
                </div>
              </div>

              <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">
                Ссылка отправлена
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-8">
                Мы отправили ссылку для сброса пароля на{" "}
                <span className="font-semibold text-gray-700">{email}</span>.
                Проверьте ящик входящих и папку «Спам».
              </p>

              {/* Dev mode: show direct link */}
              {devToken && (
                <div className="mb-6 p-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Режим разработки
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    Email не настроен — используйте ссылку напрямую:
                  </p>
                  <button
                    onClick={() => setLocation(`/reset-password?token=${devToken}`)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ backgroundColor: "#1f75fe", color: "#ffffff" }}
                  >
                    Перейти к сбросу пароля →
                  </button>
                </div>
              )}

              <button
                onClick={() => setLocation("/login")}
                className="w-full py-4 rounded-2xl text-base font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all duration-200 active:scale-[0.98]"
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
