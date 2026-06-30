import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";

import { useResetPassword } from "@workspace/api-client-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();

  // Extract token from query string
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resetMutation = useResetPassword({
    mutation: {
      onSuccess: () => setSuccess(true),
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        setError(msg ?? "Ссылка недействительна или истекла. Запросите сброс повторно.");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
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

    resetMutation.mutate({ data: { token, newPassword } });
  };

  if (!token) {
    return (
      <div className="min-h-screen w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6">
          <h2 className="text-xl font-bold text-[#0f172a] mb-3">Недействительная ссылка</h2>
          <p className="text-body text-[#64748b] mb-6">Эта ссылка для сброса пароля недействительна или устарела.</p>
          <button
            onClick={() => setLocation("/forgot-password")}
            className="w-full py-4 rounded-full text-base font-semibold hover:scale-105 active:scale-95 bg-[#1f75fe] hover:bg-[#1a65e8] text-white transition-all"
          >
            Запросить новую ссылку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      {!success && (
        <div className="w-full max-w-sm mb-6">
          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-2xl font-bold text-[#0f172a] text-center mb-8">
            Придумайте новый пароль
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* New password */}
            <div className={`
              w-full px-4 py-3.5 rounded-xl border bg-white transition-all
              ${error ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"}
            `}>
              <p className="section-label mb-0.5">
                Придумайте новый пароль
              </p>
              <div className="flex items-center">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-base text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2"
                >
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className={`
              w-full px-4 py-3.5 rounded-xl border bg-white transition-all
              ${error ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/20"}
            `}>
              <p className="section-label mb-0.5">
                Повторите новый пароль
              </p>
              <div className="flex items-center">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-base text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-caption text-[#dc2626] font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={resetMutation.isPending}
              className="w-full py-4 rounded-full text-base font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 mt-2 bg-[#1f75fe] hover:bg-[#1a65e8] text-white"
            >
              {resetMutation.isPending ? "Сохраняем..." : "Сохранить"}
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white w-full max-w-sm rounded-2xl border border-[#e8e3d9] shadow-xl p-8 text-center mb-4"
            >
              <button
                onClick={() => setLocation("/login")}
                className="absolute top-4 right-4 text-[#94a3b8] hover:text-[#64748b] transition-colors"
              />

              <div className="flex items-center justify-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1f75fe]/10">
                  <CheckCircle2 className="w-8 h-8 text-[#1f75fe]" />
                </div>
              </div>

              <h3 className="text-lg font-bold text-[#0f172a] mb-6">
                Ваш новый пароль сохранён
              </h3>

              <div className="h-px bg-[#e8e3d9] mb-4" />

              <button
                onClick={() => setLocation("/login")}
                className="text-base font-semibold transition-colors text-[#1f75fe] hover:text-[#1a65e8]"
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
