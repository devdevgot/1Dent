import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Sparkles, CreditCard, MessageCircle, Loader2,
  Users, BarChart3, Bot,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { canStartTrial, getSubscriptionStatus } from "@/lib/subscription-status";
import { PlanPaywallIllustration } from "./plan-paywall-illustration";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

const SUPPORT_WHATSAPP = "77071234567";

/** Staging only: set VITE_SKIP_PLAN_PAYWALL=true on dev Railway service (not production). */
const SKIP_PLAN_PAYWALL = import.meta.env.VITE_SKIP_PLAN_PAYWALL === "true";

const FEATURE_KEYS = ["patients", "whatsapp", "analytics"] as const;
const FEATURE_ICONS = {
  patients: Users,
  whatsapp: Bot,
  analytics: BarChart3,
} as const;

export function PlanPaywall() {
  const { t } = useTranslation();
  const { clinic, user, setAuth } = useAuthStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loc] = useLocation();
  const [startingTrial, setStartingTrial] = useState(false);

  if (SKIP_PLAN_PAYWALL) return null;

  const status = getSubscriptionStatus(clinic);
  const isOwner = user?.role === "owner";
  const showTrialCta = isOwner && canStartTrial(clinic);

  const startTrialMutation = useMutation({
    mutationFn: async () => {
      return customFetch<{
        success: boolean;
        data: { user: typeof user; clinic: typeof clinic };
      }>("/api/auth/start-trial", { method: "POST" });
    },
    onMutate: () => setStartingTrial(true),
    onSuccess: (response) => {
      if (response.success && response.data?.user && response.data?.clinic) {
        setAuth(response.data.user, response.data.clinic);
        toast({
          title: t("paywall.trialStartedTitle"),
          description: t("paywall.trialStartedDesc"),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t("paywall.trialErrorTitle"),
        description: getApiErrorMessage(error, t("paywall.trialErrorDesc")),
        variant: "destructive",
      });
    },
    onSettled: () => setStartingTrial(false),
  });

  if (status.kind === "active_plan" || status.kind === "active_trial") return null;
  if (loc === "/pricing") return null;

  const titleKey =
    status.kind === "expired_plan"
      ? "paywall.titleExpiredPlan"
      : status.kind === "expired_trial"
        ? "paywall.titleExpiredTrial"
        : "paywall.titleNoPlan";

  const descKey =
    status.kind === "expired_plan"
      ? "paywall.descExpiredPlan"
      : status.kind === "expired_trial"
        ? "paywall.descExpiredTrial"
        : isOwner
          ? "paywall.descNoPlanOwner"
          : "paywall.descNoPlanStaff";

  return (
    <div className="fixed inset-0 z-[200] bg-[#faf8f4] font-manrope flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md dash-card dash-card-padded text-center"
      >
        <PlanPaywallIllustration className="w-44 h-44 mx-auto mb-5" />

        <span className="inline-flex items-center gap-1.5 bg-[var(--warning-light)] text-[#d97706] rounded-full px-3 py-1 text-xs font-semibold mb-3">
          <CreditCard className="w-3.5 h-3.5" />
          {t("paywall.badge")}
        </span>

        <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight leading-tight">
          {t(titleKey)}
        </h1>
        <p className="text-sm text-[#64748b] mt-3 leading-relaxed max-w-sm mx-auto">
          {t(descKey, { app: SITE.name })}
        </p>

        <ul className="mt-6 space-y-2.5 text-left max-w-xs mx-auto">
          {FEATURE_KEYS.map((key) => {
            const Icon = FEATURE_ICONS[key];
            return (
              <li key={key} className="flex items-center gap-3 text-sm text-[#64748b]">
                <div className="w-8 h-8 rounded-xl bg-[var(--primary-light)] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[#1f75fe]" />
                </div>
                {t(`paywall.features.${key}`)}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2.5 mt-8">
          {showTrialCta && (
            <button
              type="button"
              disabled={startingTrial}
              onClick={() => startTrialMutation.mutate()}
              className="dash-btn dash-btn-primary w-full py-3.5 shadow-md bg-[#1f75fe] hover:bg-[#1a65e8] text-white disabled:opacity-65"
            >
              {startingTrial ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {t("paywall.startTrial")}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate("/pricing")}
            className={showTrialCta ? "dash-btn dash-btn-secondary w-full py-3.5" : "dash-btn dash-btn-primary w-full py-3.5"}
          >
            <CreditCard className="w-4 h-4" />
            {t("paywall.viewPlans")}
          </button>

          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="dash-btn dash-btn-ghost w-full py-3 text-[#64748b]"
          >
            <MessageCircle className="w-4 h-4" />
            {t("paywall.contactUs")}
          </a>
        </div>

        <p className="text-[11px] text-[#94a3b8] mt-5 leading-relaxed">
          {t("paywall.footer", { app: SITE.name })}
        </p>
      </motion.div>
    </div>
  );
}
