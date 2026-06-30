import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";

import { useResetPassword } from "@workspace/api-client-react";
import { PageShell } from "@/components/layout/page-shell";
import { AppDialog } from "@/components/layout/app-dialog";

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
      <PageShell className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-6">
          <h2 className="text-xl font-bold text-[var(--text)] mb-3">Недействительная ссылка</h2>
          <p className="text-body text-[var(--text-secondary)] mb-6">Эта ссылка для сброса пароля недействительна или устарела.</p>
          <button
            onClick={() => setLocation("/forgot-password")}
            className="dash-btn dash-btn-primary w-full py-4 rounded-full text-base font-semibold hover:scale-105 active:scale-95"
          >
            Запросить новую ссылку
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="min-h-screen flex flex-col items-center justify-start px-6 py-12">
      {/* Back button */}
      {!success && (
        <div className="w-full max-w-sm mb-6">
          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="w-full max-w-sm bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-2xl font-bold text-[var(--text)] text-center mb-8">
            Придумайте новый пароль
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* New password */}
            <div className={`
              w-full px-4 py-3.5 rounded-xl border bg-[var(--ds-surface)] transition-all
              ${error ? "border-[var(--danger)] bg-red-50" : "border-[var(--ds-border)] focus-within:border-[var(--ds-primary)] focus-within:ring-2 focus-within:ring-[var(--ds-primary)]/20"}
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
                  className="flex-1 bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="text-[var(--text-subtle)] hover:text-[var(--text-secondary)] transition-colors ml-2"
                >
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className={`
              w-full px-4 py-3.5 rounded-xl border bg-[var(--ds-surface)] transition-all
              ${error ? "border-[var(--danger)] bg-red-50" : "border-[var(--ds-border)] focus-within:border-[var(--ds-primary)] focus-within:ring-2 focus-within:ring-[var(--ds-primary)]/20"}
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
                  className="flex-1 bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-[var(--text-subtle)] hover:text-[var(--text-secondary)] transition-colors ml-2"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-caption text-[var(--danger)] font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={resetMutation.isPending}
              className="dash-btn dash-btn-primary w-full py-4 rounded-full text-base font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-105 active:scale-95 mt-2"
            >
              {resetMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Success modal */}
      <AppDialog
        open={success}
        onOpenChange={(open) => { if (!open) setLocation("/login"); }}
        title="Ваш новый пароль сохранён"
        size="sm"
        showClose={false}
        footer={
          <button
            onClick={() => setLocation("/login")}
            className="dash-btn dash-btn-ghost w-full text-base font-semibold text-[var(--ds-primary)]"
          >
            Отлично!
          </button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[var(--primary-light)] mb-4">
            <CheckCircle2 className="w-8 h-8 text-[var(--ds-primary)]" />
          </div>
        </div>
      </AppDialog>
    </PageShell>
  );
}
