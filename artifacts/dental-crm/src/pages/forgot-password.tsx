import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useForgotPassword } from "@workspace/api-client-react";
import { createForgotPasswordSchema } from "@/lib/schemas";
import { getApiErrorMessage } from "@/lib/api-error-message";
import {
  AuthField,
  AuthPageShell,
  AuthPrimaryButton,
} from "@/components/auth/auth-ui";

type Step = "form" | "sent";

export default function ForgotPassword() {
  const { t } = useTranslation();
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
        setError(getApiErrorMessage(err, t("auth.forgotError")));
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t("validation.emailInvalid"));
      return;
    }

    forgotMutation.mutate({ data: { email: parsed.data.email } });
  };

  return (
    <AuthPageShell hero="auth">
      <Link href="/login">
        <button
          type="button"
          className="flex items-center gap-1.5 text-[#64748b] hover:text-[#0f172a] transition-colors mb-4 -ml-1 p-1 rounded-lg hover:bg-[#faf8f4]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t("register.backToLogin")}</span>
        </button>
      </Link>

      <AnimatePresence mode="wait">
        {step === "form" ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-xl font-bold text-[#0f172a] text-center mb-2">
              {t("auth.forgotTitle")}
            </h2>
            <p className="text-sm text-[#64748b] text-center mb-6 leading-relaxed">
              {t("auth.forgotSubtitle")}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <AuthField label={t("auth.email")} error={error}>
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
                  className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none disabled:opacity-60"
                />
              </AuthField>

              <AuthPrimaryButton type="submit" disabled={forgotMutation.isPending}>
                {forgotMutation.isPending ? t("auth.forgotSending") : t("auth.forgotSubmit")}
              </AuthPrimaryButton>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <div className="flex items-center justify-center mb-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#1f75fe]/10">
                <Mail className="w-7 h-7 text-[#1f75fe]" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-[#0f172a] mb-2">
              {t("auth.forgotSentTitle")}
            </h2>
            <p className="text-sm text-[#64748b] leading-relaxed mb-6">
              {t("auth.forgotSentBody", { email: email.trim() })}
            </p>

            {devToken && (
              <div className="mb-5 p-4 rounded-xl border border-dashed border-[#e8e3d9] bg-[#faf8f4] text-left">
                <p className="text-xs font-medium text-[#64748b] mb-2">{t("auth.devMode")}</p>
                <button
                  type="button"
                  onClick={() =>
                    setLocation(`/reset-password?token=${encodeURIComponent(devToken)}`)
                  }
                  className="w-full py-2.5 rounded-full text-sm font-semibold text-white bg-[#1f75fe] hover:bg-[#1868eb] transition-colors"
                >
                  {t("auth.devResetLink")}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full py-3 rounded-full text-sm font-medium text-[#64748b] border border-[#e8e3d9] hover:bg-[#faf8f4] transition-colors"
            >
              {t("auth.backToLogin")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthPageShell>
  );
}
