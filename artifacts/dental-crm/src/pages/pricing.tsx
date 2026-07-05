import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreatePlanRequest, type Clinic } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Loader2, Clock, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlanCard } from "@/components/pricing/plan-card";
import { PlanComparisonAccordion } from "@/components/pricing/plan-comparison-accordion";
import { ImplementationFeeNote } from "@/components/pricing/implementation-fee-note";
import {
  PLANS,
  PLAN_DISPLAY_NAMES,
  COMMON_FEATURES_SUMMARY,
  formatPlanPrice,
  IMPLEMENTATION_FEE,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

type SubscriptionStatus =
  | { kind: "active_plan"; plan: PlanId; expiresAt: Date | null }
  | { kind: "active_trial"; expiresAt: Date }
  | { kind: "expired_plan"; plan: PlanId; expiresAt: Date }
  | { kind: "expired_trial"; expiresAt: Date }
  | { kind: "none" };

function formatExpiryDate(date: Date): string {
  return date.toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getClinicPlanFields(clinic: Clinic | null) {
  const clinicAny = clinic as (Clinic & {
    plan?: PlanId;
    trialEndsAt?: string | null;
    planExpiresAt?: string | null;
  }) | null;

  return {
    plan: clinicAny?.plan ?? "free",
    trialEndsAt: clinicAny?.trialEndsAt ?? null,
    planExpiresAt: clinicAny?.planExpiresAt ?? null,
  };
}

function getSubscriptionStatus(clinic: Clinic | null): SubscriptionStatus {
  const { plan, trialEndsAt, planExpiresAt } = getClinicPlanFields(clinic);
  const now = new Date();
  const hasPaidPlan = plan !== "free";
  const planNotExpired = !planExpiresAt || new Date(planExpiresAt) > now;
  const trialActive = !!trialEndsAt && new Date(trialEndsAt) > now;

  if (hasPaidPlan && planNotExpired) {
    return {
      kind: "active_plan",
      plan,
      expiresAt: planExpiresAt ? new Date(planExpiresAt) : null,
    };
  }

  if (trialActive) {
    return { kind: "active_trial", expiresAt: new Date(trialEndsAt) };
  }

  if (hasPaidPlan && planExpiresAt && new Date(planExpiresAt) <= now) {
    return { kind: "expired_plan", plan, expiresAt: new Date(planExpiresAt) };
  }

  if (trialEndsAt && new Date(trialEndsAt) <= now) {
    return { kind: "expired_trial", expiresAt: new Date(trialEndsAt) };
  }

  return { kind: "none" };
}

function CurrentSubscriptionBanner({ clinic }: { clinic: Clinic | null }) {
  const status = getSubscriptionStatus(clinic);

  const config = {
    active_plan: {
      bg: "bg-[#f0fdf4] border-[#16a34a]/25 text-[#16a34a]",
      icon: Check,
      label: "Ваш тариф",
      title: status.kind === "active_plan" ? PLAN_DISPLAY_NAMES[status.plan] : "",
      detail:
        status.kind === "active_plan"
          ? status.expiresAt
            ? `до ${formatExpiryDate(status.expiresAt)}`
            : "активна"
          : "",
    },
    active_trial: {
      bg: "bg-[#e0f2fe] border-[#0284c7]/25 text-[#0284c7]",
      icon: Clock,
      label: "Пробный период",
      title: "Активен",
      detail:
        status.kind === "active_trial" ? `до ${formatExpiryDate(status.expiresAt)}` : "",
    },
    expired_plan: {
      bg: "bg-[#fef3c7] border-[#d97706]/25 text-[#d97706]",
      icon: AlertCircle,
      label: "Тариф истёк",
      title: status.kind === "expired_plan" ? PLAN_DISPLAY_NAMES[status.plan] : "",
      detail:
        status.kind === "expired_plan" ? formatExpiryDate(status.expiresAt) : "",
    },
    expired_trial: {
      bg: "bg-[#fef3c7] border-[#d97706]/25 text-[#d97706]",
      icon: AlertCircle,
      label: "Пробный период",
      title: "Закончился",
      detail:
        status.kind === "expired_trial" ? formatExpiryDate(status.expiresAt) : "",
    },
    none: {
      bg: "bg-white border-[#e8e3d9] text-[#64748b]",
      icon: AlertCircle,
      label: "Статус",
      title: "Тариф не подключён",
      detail: "Выберите план ниже",
    },
  }[status.kind];

  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-2.5", config.bg)}>
      <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
      <div className="min-w-0 flex-1">
        <p className="text-micro font-semibold uppercase tracking-wide opacity-80">{config.label}</p>
        <p className="text-caption font-semibold text-[#0f172a] truncate">{config.title}</p>
      </div>
      {config.detail ? (
        <p className="text-caption font-medium shrink-0">{config.detail}</p>
      ) : null}
    </div>
  );
}

export default function PricingPage() {
  const { clinic, user } = useAuthStore();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const subscriptionStatus = getSubscriptionStatus(clinic);
  const activePaidPlan =
    subscriptionStatus.kind === "active_plan" ? subscriptionStatus.plan : null;
  const [requestPlan, setRequestPlan] = useState<PlanId | null>(null);
  const [formName, setFormName] = useState(user?.name ?? "");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState(user?.email ?? "");
  const [formMessage, setFormMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user?.name) setFormName(user.name);
    if (user?.email) setFormEmail(user.email);
  }, [user?.name, user?.email]);

  const closeRequestModal = () => {
    setRequestPlan(null);
    setSubmitted(false);
    setFormMessage("");
  };

  const createPlanMutation = useCreatePlanRequest({
    mutation: {
      onSuccess: () => {
        setSubmitted(true);
        toast({ title: "Заявка отправлена!" });
      },
      onError: () => {
        toast({ title: "Ошибка отправки", variant: "destructive" });
      },
    },
  });

  const handleSubmitRequest = () => {
    if (!formName.trim() || !formPhone.trim() || !requestPlan) return;
    createPlanMutation.mutate({
      data: {
        plan: requestPlan,
        contactName: formName.trim(),
        contactPhone: formPhone.trim(),
        contactEmail: formEmail.trim() || undefined,
        message: formMessage.trim() || undefined,
      },
    });
  };

  const orderedPlans = (["starter", "professional", "enterprise"] as const)
    .map((id) => PLANS.find((p) => p.id === id))
    .filter((plan): plan is NonNullable<typeof plan> => plan != null);

  return (
    <PageShell className="pb-10" animate={false}>
      <PageHeader title="Тарифы" onBack={() => setLocation("/menu")} sticky />

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        <CurrentSubscriptionBanner clinic={clinic} />
        <ImplementationFeeNote />

        <div className="space-y-3">
          {orderedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={activePaidPlan === plan.id}
              onSelect={() => setRequestPlan(plan.id)}
            />
          ))}
        </div>

        <PlanComparisonAccordion />

        <p className="text-center text-caption text-[#94a3b8] leading-relaxed pb-2 px-1">
          {COMMON_FEATURES_SUMMARY}. Оплата через Kaspi.
        </p>
      </div>

      {requestPlan && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeRequestModal}
          role="presentation"
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl border border-[#e8e3d9] shadow-xl overflow-hidden font-manrope"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-request-title"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e3d9]">
              <div>
                <h3 id="plan-request-title" className="font-bold text-[#0f172a]">
                  Заявка на тариф {PLAN_DISPLAY_NAMES[requestPlan]}
                </h3>
                <p className="text-caption text-[#64748b] mt-0.5">
                  Внедрение {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ + подписка
                </p>
              </div>
              <button
                type="button"
                onClick={closeRequestModal}
                aria-label="Закрыть"
                className="p-1.5 rounded-xl hover:bg-[#f1ede4] transition-colors"
              >
                <X className="w-5 h-5 text-[#94a3b8]" />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-[#16a34a]" strokeWidth={3} />
                </div>
                <h4 className="text-nav-title font-bold text-[#0f172a] mb-1">Заявка отправлена!</h4>
                <p className="text-body text-[#64748b] mb-5">
                  Мы свяжемся с вами в ближайшее время для подключения тарифа.
                </p>
                <button
                  type="button"
                  onClick={closeRequestModal}
                  className="px-6 py-2.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white rounded-full text-body font-semibold transition-colors"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-caption font-medium text-[#64748b] mb-1 block">
                    Имя <span className="text-[#dc2626]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ваше имя"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-body text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-caption font-medium text-[#64748b] mb-1 block">
                    Телефон <span className="text-[#dc2626]">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-body text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-caption font-medium text-[#64748b] mb-1 block">Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-body text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-caption font-medium text-[#64748b] mb-1 block">Комментарий</label>
                  <textarea
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    placeholder="Дополнительная информация..."
                    rows={2}
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-body text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 resize-none transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSubmitRequest()}
                  disabled={createPlanMutation.isPending || !formName.trim() || !formPhone.trim()}
                  className="w-full py-3 bg-[#1f75fe] hover:bg-[#1a65e8] text-white rounded-full text-body font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createPlanMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Отправить заявку
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
