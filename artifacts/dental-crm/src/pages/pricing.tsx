import { useState } from "react";
import { useLocation } from "wouter";
import { useCreatePlanRequest, type Clinic } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Loader2, Clock, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlanCard } from "@/components/pricing/plan-card";
import { PlanGuide } from "@/components/pricing/plan-guide";
import { PlanComparisonTable } from "@/components/pricing/plan-comparison-table";
import { CommonFeaturesAccordion } from "@/components/pricing/common-features-accordion";
import { ImplementationFeeCard } from "@/components/pricing/implementation-fee-card";
import {
  PLANS,
  PLAN_DISPLAY_NAMES,
  formatPlanPrice,
  IMPLEMENTATION_FEE,
  type PlanId,
} from "@/lib/plans";

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

  if (status.kind === "active_plan") {
    return (
      <div className="bg-[#f0fdf4] border border-[#16a34a]/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#16a34a]/15 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-[#16a34a]" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-micro font-bold text-[#16a34a] uppercase tracking-wider">Ваш тариф</p>
            <p className="text-nav-title font-bold text-[#0f172a] mt-0.5">{PLAN_DISPLAY_NAMES[status.plan]}</p>
            {status.expiresAt ? (
              <p className="text-caption text-[#16a34a] mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Действует до {formatExpiryDate(status.expiresAt)}
              </p>
            ) : (
              <p className="text-caption text-[#16a34a] mt-1">Подписка активна</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "active_trial") {
    return (
      <div className="bg-[#e0f2fe] border border-[#0284c7]/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0284c7]/15 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-[#0284c7]" />
          </div>
          <div className="min-w-0">
            <p className="text-micro font-bold text-[#0284c7] uppercase tracking-wider">Пробный период</p>
            <p className="text-nav-title font-bold text-[#0f172a] mt-0.5">Активен</p>
            <p className="text-caption text-[#0284c7] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Действует до {formatExpiryDate(status.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "expired_plan") {
    return (
      <div className="bg-[#fef3c7] border border-[#d97706]/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d97706]/15 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-[#d97706]" />
          </div>
          <div className="min-w-0">
            <p className="text-micro font-bold text-[#d97706] uppercase tracking-wider">Тариф истёк</p>
            <p className="text-nav-title font-bold text-[#0f172a] mt-0.5">{PLAN_DISPLAY_NAMES[status.plan]}</p>
            <p className="text-caption text-[#d97706] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Истёк {formatExpiryDate(status.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "expired_trial") {
    return (
      <div className="bg-[#fef3c7] border border-[#d97706]/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d97706]/15 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-[#d97706]" />
          </div>
          <div className="min-w-0">
            <p className="text-micro font-bold text-[#d97706] uppercase tracking-wider">Пробный период</p>
            <p className="text-nav-title font-bold text-[#0f172a] mt-0.5">Закончился</p>
            <p className="text-caption text-[#d97706] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Истёк {formatExpiryDate(status.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e8e3d9] rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#f1ede4] flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-[#64748b]" />
        </div>
        <div className="min-w-0">
          <p className="text-micro font-bold text-[#64748b] uppercase tracking-wider">Текущий статус</p>
          <p className="text-nav-title font-bold text-[#0f172a] mt-0.5">Тариф не подключён</p>
          <p className="text-caption text-[#64748b] mt-1">Выберите тариф ниже, чтобы подключить систему</p>
        </div>
      </div>
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
  const [requestPlan, setRequestPlan] = useState<string | null>(null);
  const [formName, setFormName] = useState(user?.name ?? "");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState(user?.email ?? "");
  const [formMessage, setFormMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

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

  const orderedPlans = [
    PLANS.find((p) => p.id === "starter")!,
    PLANS.find((p) => p.id === "professional")!,
    PLANS.find((p) => p.id === "enterprise")!,
  ];

  return (
    <PageShell className="pb-10">
      <PageHeader title="Тарифы" onBack={() => setLocation("/menu")} sticky />

      <div className="px-4 pt-6 space-y-5 max-w-lg mx-auto">
        <div className="text-center space-y-1.5">
          <h2 className="text-nav-title font-bold text-[#0f172a]">Тарифы 1Dent</h2>
          <p className="text-body text-[#64748b] leading-relaxed">
            Разовое внедрение + ежемесячная подписка по тарифу
          </p>
        </div>

        <CurrentSubscriptionBanner clinic={clinic} />

        <ImplementationFeeCard />

        <PlanGuide />

        <div className="space-y-4">
          {orderedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={activePaidPlan === plan.id}
              onSelect={() => setRequestPlan(plan.name)}
            />
          ))}
        </div>

        <PlanComparisonTable />

        <CommonFeaturesAccordion />

        <p className="text-center text-caption text-[#94a3b8] leading-relaxed pb-2">
          Внедрение — {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ (разово). Подписка — ежемесячно по тарифу.
          <br />
          Оплата через Kaspi. Есть вопросы? Напишите нам в WhatsApp.
        </p>
      </div>

      {requestPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#e8e3d9] shadow-xl overflow-hidden font-manrope">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e3d9]">
              <div>
                <h3 className="font-bold text-[#0f172a]">Заявка на тариф {requestPlan}</h3>
                <p className="text-caption text-[#64748b] mt-0.5">
                  Внедрение {formatPlanPrice(IMPLEMENTATION_FEE)} ₸ + подписка по тарифу
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequestPlan(null);
                  setSubmitted(false);
                }}
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
                  onClick={() => {
                    setRequestPlan(null);
                    setSubmitted(false);
                  }}
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
