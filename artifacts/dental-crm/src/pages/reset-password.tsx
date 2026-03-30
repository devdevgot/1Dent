import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [location, setLocation] = useLocation();

  // Extract token from query string
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Пароль должен быть не менее 6 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (!token) {
      setError("Неверная ссылка для сброса пароля");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
        credentials: "include",
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error ?? "Ссылка недействительна или истекла. Запросите сброс повторно.");
      }
    } catch {
      setError("Произошла ошибка. Проверьте подключение.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="text-xl font-display font-bold text-gray-900 mb-3">Недействительная ссылка</h2>
          <p className="text-sm text-gray-500 mb-6">Эта ссылка для сброса пароля недействительна или устарела.</p>
          <button
            onClick={() => setLocation("/forgot-password")}
            className="w-full py-4 rounded-2xl text-base font-bold"
            style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
          >
            Запросить новую ссылку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      {!success && (
        <div className="w-full max-w-sm mb-6">
          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-8">
            Придумайте новый пароль
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* New password */}
            <div className={`
              w-full px-4 py-3.5 rounded-2xl border-2 bg-gray-50 transition-all
              ${error ? "border-destructive" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
            `}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                Придумайте новый пароль
              </p>
              <div className="flex items-center">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                >
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className={`
              w-full px-4 py-3.5 rounded-2xl border-2 bg-gray-50 transition-all
              ${error ? "border-destructive" : "border-gray-200 focus-within:border-primary focus-within:bg-white"}
            `}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                Повторите новый пароль
              </p>
              <div className="flex items-center">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl text-base font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
              style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
            >
              {loading ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Success modal overlay */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center mb-4"
            >
              <button
                onClick={() => setLocation("/login")}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors"
              />

              <div className="flex items-center justify-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f0fad0" }}>
                  <CheckCircle2 className="w-8 h-8" style={{ color: "#98cc1c" }} />
                </div>
              </div>

              <h3 className="text-lg font-display font-bold text-gray-900 mb-6">
                Ваш новый пароль сохранён
              </h3>

              <div className="h-px bg-gray-100 mb-4" />

              <button
                onClick={() => setLocation("/login")}
                className="text-base font-semibold transition-colors"
                style={{ color: "#98cc1c" }}
              >
                Отлично!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
