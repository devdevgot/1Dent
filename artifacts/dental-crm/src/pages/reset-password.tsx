import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useResetPassword } from "@workspace/api-client-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { createResetPasswordSchema } from "@/lib/schemas";
import { getApiErrorMessage } from "@/lib/api-error-message";
import {
  AuthField,
  AuthPageShell,
  AuthPrimaryButton,
} from "@/components/auth/auth-ui";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resetPasswordSchema = useMemo(() => createResetPasswordSchema(), []);

  const resetMutation = useResetPassword({
    mutation: {
      onSuccess: () => setSuccess(true),
      onError: (err) => {
        setError(
          getApiErrorMessage(err, t("auth.resetError")),
        );
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = resetPasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t("auth.resetValidationError"));
      return;
    }

    if (!token) {
      setError(t("auth.resetInvalidLink"));
      return;
    }

    resetMutation.mutate({ data: { token, newPassword: parsed.data.newPassword } });
  };

  if (!token) {
    return (
      <AuthPageShell hero="auth">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#0f172a] mb-3">{t("auth.resetInvalidTitle")}</h2>
          <p className="text-sm text-[#64748b] mb-6">{t("auth.resetInvalidBody")}</p>
          <AuthPrimaryButton onClick={() => setLocation("/forgot-password")}>
            {t("auth.resetRequestNew")}
          </AuthPrimaryButton>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell hero="auth">
      {!success && (
        <Link href="/login">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[#64748b] hover:text-[#0f172a] transition-colors mb-4 -ml-1 p-1 rounded-lg hover:bg-[#faf8f4]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t("register.backToLogin")}</span>
          </button>
        </Link>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="text-xl font-bold text-[#0f172a] text-center mb-5">
          {t("auth.resetTitle")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <AuthField label={t("auth.resetNewPassword")}>
            <div className="flex items-center">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={resetMutation.isPending || success}
                className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2 p-1"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </AuthField>

          <AuthField label={t("auth.resetConfirmPassword")}>
            <div className="flex items-center">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={resetMutation.isPending || success}
                className="flex-1 bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="text-[#94a3b8] hover:text-[#64748b] transition-colors ml-2 p-1"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </AuthField>

          {error && error.trim() && (
            <p className="text-xs text-[#dc2626] font-medium px-1">{error}</p>
          )}

          <AuthPrimaryButton type="submit" disabled={resetMutation.isPending || success}>
            {resetMutation.isPending ? t("auth.resetSaving") : t("auth.resetSave")}
          </AuthPrimaryButton>
        </form>
      </motion.div>

      <AppDialog
        open={success}
        onOpenChange={(open) => { if (!open) setLocation("/login"); }}
        title={t("auth.resetSuccessTitle")}
        size="sm"
        showClose={false}
        footer={
          <button
            type="button"
            onClick={() => setLocation("/login")}
            className="w-full text-base font-semibold text-[#1f75fe] py-2"
          >
            {t("auth.resetSuccessCta")}
          </button>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1f75fe]/10 mb-4">
            <CheckCircle2 className="w-8 h-8 text-[#1f75fe]" />
          </div>
        </div>
      </AppDialog>
    </AuthPageShell>
  );
}
