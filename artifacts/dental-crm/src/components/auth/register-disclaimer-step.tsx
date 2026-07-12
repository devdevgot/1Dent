import { motion } from "framer-motion";
import { Building2, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthLink, AuthPrimaryButton } from "@/components/auth/auth-ui";

type RegisterDisclaimerStepProps = {
  onContinue: () => void;
};

export function RegisterDisclaimerStep({ onContinue }: RegisterDisclaimerStepProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-x-4 -top-6 h-40 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/2 top-6 h-28 w-28 -translate-x-1/2 rounded-full bg-[#1f75fe]/10 blur-2xl" />
        <div className="absolute right-4 top-10 h-20 w-20 rounded-full bg-[#25D366]/10 blur-xl" />
      </div>

      <div className="relative flex flex-col items-center text-center mb-6">
        <div className="relative mb-6 [perspective:900px]">
          <motion.div
            className="relative mx-auto h-28 w-28"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: [0, 10, 0, -10, 0], rotateX: [0, 4, 0, -2, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="absolute inset-2 rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#1555cc] opacity-25 blur-[1px]"
              style={{ transform: "translateZ(-18px) scale(0.92)" }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border border-[#e8e3d9] bg-white shadow-[0_22px_44px_-14px_rgba(31,117,254,0.45)]"
              style={{ transform: "translateZ(20px)" }}
            >
              <ShieldCheck className="h-10 w-10 text-[#1f75fe]" strokeWidth={2.2} />
            </div>
            <motion.div
              className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white shadow-[0_12px_24px_-8px_rgba(37,211,102,0.55)]"
              style={{ transform: "translateZ(36px)" }}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <MessageCircle className="h-4 w-4" />
            </motion.div>
            <motion.div
              className="absolute -bottom-2 -left-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[#faf8f4] border border-[#e8e3d9] shadow-md"
              style={{ transform: "translateZ(28px)" }}
              animate={{ y: [0, 3, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            >
              <Building2 className="h-4 w-4 text-[#1f75fe]" />
            </motion.div>
          </motion.div>
        </div>

        <h2 className="text-xl font-bold text-[#0f172a] mb-2">{t("register.disclaimerTitle")}</h2>
        <p className="text-sm text-[#64748b] leading-relaxed max-w-sm">
          {t("register.disclaimerBody")}
        </p>
      </div>

      <div className="space-y-3 mb-5">
        <motion.div
          whileHover={{ rotateX: 2, rotateY: -2, scale: 1.01 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="rounded-2xl border border-[#e8e3d9] bg-gradient-to-br from-white to-[#faf8f4] p-4 shadow-[0_10px_30px_-16px_rgba(15,23,42,0.25)]"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f75fe]/15 to-[#1f75fe]/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
              style={{ transform: "translateZ(8px)" }}
            >
              <Building2 className="h-5 w-5 text-[#1f75fe]" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1f75fe] mb-1">
                {t("register.disclaimerOwnerLabel")}
              </p>
              <p className="text-sm text-[#0f172a] leading-relaxed">
                {t("register.disclaimerOwner")}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ rotateX: 2, rotateY: 2, scale: 1.01 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="rounded-2xl border border-[#e8e3d9] bg-white p-4 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.18)]"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="flex items-start gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#25D366]/15 to-[#25D366]/5"
              style={{ transform: "translateZ(8px)" }}
            >
              <Users className="h-5 w-5 text-[#128C7E]" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#128C7E] mb-1">
                {t("register.disclaimerStaffLabel")}
              </p>
              <p className="text-sm text-[#64748b] leading-relaxed">
                {t("register.disclaimerStaff")}
              </p>
            </div>
          </div>
        </motion.div>
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
