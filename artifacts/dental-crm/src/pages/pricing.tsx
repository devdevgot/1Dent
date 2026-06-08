import { useState } from "react";
import { Link } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { ChevronLeft, Check, Sparkles, Zap, Crown, Rocket, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type PlanId = "free" | "starter" | "professional" | "enterprise";
type BillingCycle = "monthly" | "yearly";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: PlanId;
  name: string;
  description: string;
  icon: typeof Zap;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  highlight?: boolean;
  badge?: string;
  gradient: string;
  iconBg: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Для знакомства с системой",
    icon: Zap,
    monthlyPrice: 0,
    yearlyPrice: 0,
    gradient: "from-slate-50 to-slate-100",
    iconBg: "bg-slate-200 text-slate-600",
    features: [
      { text: "До 20 пациентов", included: true },
      { text: "1 врач", included: true },
      { text: "Карта зубов", included: true },
      { text: "Планы лечения", included: true },
      { text: "WhatsApp интеграция", included: false },
      { text: "ИИ чат-бот", included: false },
      { text: "Аналитика", included: false },
      { text: "Филиалы", included: false },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    description: "Для небольших клиник",
    icon: Sparkles,
    monthlyPrice: 14990,
    yearlyPrice: 149900,
    gradient: "from-blue-50 to-indigo-50",
    iconBg: "bg-blue-100 text-blue-600",
    features: [
      { text: "До 200 пациентов", included: true },
      { text: "До 3 врачей", included: true },
      { text: "Карта зубов", included: true },
      { text: "Планы лечения", included: true },
      { text: "WhatsApp интеграция", included: true },
      { text: "Базовая аналитика", included: true },
      { text: "ИИ чат-бот", included: false },
      { text: "Филиалы", included: false },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    description: "Для растущих клиник",
    icon: Crown,
    monthlyPrice: 29990,
    yearlyPrice: 299900,
    highlight: true,
    badge: "Популярный",
    gradient: "from-primary/5 to-blue-50",
    iconBg: "bg-primary/15 text-primary",
    features: [
      { text: "Безлимит пациентов", included: true },
      { text: "До 10 врачей", included: true },
      { text: "Карта зубов", included: true },
      { text: "Планы лечения", included: true },
      { text: "WhatsApp интеграция", included: true },
      { text: "Полная аналитика", included: true },
      { text: "ИИ чат-бот", included: true },
      { text: "До 3 филиалов", included: true },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Для сети клиник",
    icon: Rocket,
    monthlyPrice: 59990,
    yearlyPrice: 599900,
    gradient: "from-amber-50 to-orange-50",
    iconBg: "bg-amber-100 text-amber-600",
    features: [
      { text: "Безлимит пациентов", included: true },
      { text: "Безлимит врачей", included: true },
      { text: "Карта зубов", included: true },
      { text: "Планы лечения", included: true },
      { text: "WhatsApp интеграция", included: true },
      { text: "Расширенная аналитика", included: true },
      { text: "ИИ чат-бот + обучение", included: true },
      { text: "Безлимит филиалов", included: true },
    ],
  },
];

function formatPrice(amount: number): string {
  if (amount === 0) return "Бесплатно";
  return amount.toLocaleString("ru-KZ") + " ₸";
}

export default function PricingPage() {
  const { clinic } = useAuthStore();
  const currentPlan = ((clinic as any)?.plan as PlanId) ?? "free";
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  return (
    <div className="min-h-screen bg-[#f2f2f7] pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-[17px] font-semibold text-gray-900">Тарифы</h1>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Star className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-[22px] font-bold text-gray-900">Выберите тариф</h2>
          <p className="text-[14px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Подберите план, который подходит именно вашей клинике
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-1 bg-white rounded-2xl p-1 max-w-[280px] mx-auto border border-gray-100 shadow-sm">
          <button
            onClick={() => setBilling("monthly")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all",
              billing === "monthly"
                ? "bg-primary text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            Помесячно
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all relative",
              billing === "yearly"
                ? "bg-primary text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            Годовой
            <span className={cn(
              "absolute -top-2.5 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full",
              billing === "yearly" ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700",
            )}>
              -17%
            </span>
          </button>
        </div>

        {/* Plan cards */}
        <div className="space-y-4">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative bg-white rounded-2xl border-2 overflow-hidden transition-all",
                  plan.highlight
                    ? "border-primary shadow-lg shadow-primary/10"
                    : isCurrentPlan
                    ? "border-emerald-400 shadow-md"
                    : "border-gray-100 shadow-sm",
                )}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                      {plan.badge}
                    </div>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                      Текущий
                    </div>
                  </div>
                )}

                <div className={cn("p-5 bg-gradient-to-br", plan.gradient)}>
                  {/* Plan header */}
                  <div className="flex items-start gap-3.5 mb-4">
                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", plan.iconBg)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-[17px] font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-[12px] text-gray-500 mt-0.5">{plan.description}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    {price === 0 ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-[28px] font-black text-gray-900">Бесплатно</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[28px] font-black text-gray-900">
                          {(billing === "monthly" ? price : Math.round(price / 12)).toLocaleString("ru-KZ")}
                        </span>
                        <span className="text-[14px] text-gray-500 font-medium">₸ / мес</span>
                      </div>
                    )}
                    {billing === "yearly" && price > 0 && (
                      <p className="text-[12px] text-gray-400 mt-1">
                        {formatPrice(price)} в год
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="space-y-2.5 mb-5">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                          feature.included
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-gray-100 text-gray-300",
                        )}>
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </div>
                        <span className={cn(
                          "text-[13px]",
                          feature.included ? "text-gray-700" : "text-gray-400",
                        )}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action button */}
                  <button
                    disabled={isCurrentPlan}
                    className={cn(
                      "w-full py-3 rounded-xl text-[14px] font-semibold transition-all",
                      isCurrentPlan
                        ? "bg-emerald-100 text-emerald-700 cursor-default"
                        : plan.highlight
                        ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-md"
                        : "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]",
                    )}
                  >
                    {isCurrentPlan ? "Текущий план" : price === 0 ? "Начать бесплатно" : "Выбрать план"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Все цены указаны в тенге (₸). Оплата через Kaspi.
            <br />
            Есть вопросы? Напишите нам в WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
