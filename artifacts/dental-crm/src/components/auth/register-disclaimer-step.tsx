import { motion } from "framer-motion";
import { AlertCircle, Building2, MessageCircle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLink, AuthPrimaryButton } from "@/components/auth/auth-ui";

type RegisterDisclaimerStepProps = {
  onContinue: () => void;
};

const floatTransition = (delay = 0) => ({
  duration: 3.2,
  repeat: Infinity,
  ease: "easeInOut" as const,
  delay,
});

export function RegisterDisclaimerStep({ onContinue }: RegisterDisclaimerStepProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <div className="relative flex flex-col items-center text-center mb-6">
        <div className="relative w-full max-w-[280px] mb-6 px-2">
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 rounded-full bg-[#1f75fe]/8 blur-2xl"
            aria-hidden
          />

          <div className="relative flex items-end justify-between gap-4">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={floatTransition(0)}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#e8e3d9] bg-white shadow-[0_8px_20px_-10px_rgba(37,211,102,0.45)]"
            >
              <MessageCircle className="h-6 w-6 text-[#128C7E]" />
            </motion.div>

            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={floatTransition(0.5)}
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl border border-[#1f75fe]/20 bg-gradient-to-b from-white to-[#f0f6ff] shadow-[0_14px_32px_-12px_rgba(31,117,254,0.35)]"
            >
              <Building2 className="h-8 w-8 text-[#1f75fe]" strokeWidth={2} />
            </motion.div>

            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={floatTransition(1)}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#e8e3d9] bg-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.12)]"
            >
              <Users className="h-6 w-6 text-[#64748b]" />
            </motion.div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-[#0f172a] mb-2">{t("register.disclaimerTitle")}</h2>
        <p className="text-sm text-[#64748b] leading-relaxed max-w-sm">
          {t("register.disclaimerBody")}
        </p>
      </div>

      <div className="rounded-2xl border border-[#e8e3d9] bg-gradient-to-br from-white to-[#faf8f4] p-4 mb-5 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.2)]">
        <div className="flex items-start gap-3.5 pb-4 border-b border-[#f1ede4]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1f75fe]/10">
            <Building2 className="h-5 w-5 text-[#1f75fe]" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1f75fe] mb-1">
              {t("register.disclaimerOwnerLabel")}
            </p>
            <p className="text-sm text-[#0f172a] leading-relaxed">
              {t("register.disclaimerOwner")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 pt-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fef2f2]">
            <AlertCircle className="h-5 w-5 text-[#dc2626]" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-[#dc2626] leading-snug mb-1">
              {t("register.disclaimerStaffForbidden")}
            </p>
            <p className="text-sm text-[#64748b] leading-relaxed">
              {t("register.disclaimerStaff")}
            </p>
          </div>
        </div>
      </div>

      <AuthPrimaryButton onClick={onContinue}>{t("register.disclaimerCta")}</AuthPrimaryButton>

      <div className="text-center mt-4">
        <AuthLink href="/login">
          {t("register.hasAccount")}{" "}
          <span className="font-semibold text-[#1f75fe] hover:underline">{t("register.signIn")}</span>
        </AuthLink>
      </div>
    </div>
  );
}
