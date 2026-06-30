import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCreatePlanRequest, type Clinic } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Check, Star, Sparkles, Rocket, Shield, X, Loader2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

type PlanId = "free" | "starter" | "professional" | "enterprise";

interface PlanFeature {
  title: string;
  description?: string;
}

interface PlanLimit {
  text: string;
}

interface Plan {
  id: PlanId;
  name: string;
  price: number;
  subtitle: string;
  icon: typeof Star;
  badge?: string;
  gradient: string;
  iconBg: string;
  accentColor: string;
  includesFrom?: string;
  features: PlanFeature[];
  limits: PlanLimit[];
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "START",
    price: 99000,
    subtitle: "Для небольших стоматологий до 10 сотрудников.",
    icon: Sparkles,
    gradient: "from-[#e0f2fe]/50 to-[#1f75fe]/5",
    iconBg: "bg-[#1f75fe]/15 text-[#1f75fe]",
    accentColor: "#1f75fe",
    features: [
      { title: "Все пациенты в одной системе", description: "Больше не нужно искать информацию в разных программах, таблицах и чатах." },
      { title: "Полный контроль расписания", description: "Все записи, переносы и отмены находятся в одном месте." },
      { title: "Общение с пациентами через WhatsApp", description: "Администраторы могут вести переписку прямо из системы." },
      { title: "Автоматические напоминания пациентам", description: "Система помогает снижать количество неявок." },
      { title: "Искусственный интеллект для ежедневной работы", description: "Помогает сотрудникам быстрее выполнять рутинные задачи." },
      { title: "Умный чат-бот для обработки обращений", description: "Отвечает пациентам и помогает записаться на прием." },
      { title: "Контроль финансов клиники", description: "Вы всегда видите доходы, расходы и прибыль." },
      { title: "Контроль эффективности сотрудников", description: "Понимайте, кто приносит результат, а кто требует внимания." },
      { title: "Электронные договоры", description: "Документы создаются автоматически за несколько секунд." },
      { title: "Автоматические рассылки пациентам", description: "Система самостоятельно напоминает о профилактике и возвращает пациентов в клинику." },
    ],
    limits: [
      { text: "До 10 сотрудников" },
      { text: "До 5 шаблонов документов" },
      { text: "До 1 000 AI-кредитов в месяц" },
      { text: "До 300 диалогов чат-бота в месяц" },
    ],
  },
  {
    id: "professional",
    name: "PRO",
    price: 159000,
    subtitle: "Для клиник, которые хотят расти быстрее.",
    icon: Star,
    badge: "Рекомендуемый",
    gradient: "from-[#1f75fe]/5 to-[#e0f2fe]/50",
    iconBg: "bg-[#1f75fe]/15 text-[#1f75fe]",
    accentColor: "#1f75fe",
    includesFrom: "START",
    features: [
      { title: "До 30 сотрудников" },
      { title: "Больше возможностей искусственного интеллекта", description: "ИИ помогает автоматизировать больше задач и экономить время команды." },
      { title: "Более мощный чат-бот", description: "Обрабатывает значительно больше обращений пациентов." },
      { title: "Подробная аналитика клиники", description: "Показывает, откуда приходят пациенты и какие каналы рекламы приносят деньги." },
      { title: "Глубокий контроль сотрудников", description: "Помогает видеть эффективность каждого врача и администратора." },
      { title: "Приоритетная поддержка", description: "Быстрая помощь от нашей команды." },
    ],
    limits: [
      { text: "До 30 сотрудников" },
      { text: "До 20 шаблонов документов" },
      { text: "До 5 000 AI-кредитов в месяц" },
      { text: "До 1 500 диалогов чат-бота в месяц" },
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: 199000,
    subtitle: "Для крупных клиник и сетей.",
    icon: Rocket,
    gradient: "from-[#fef3c7]/50 to-[#fff7ed]",
    iconBg: "bg-[#fef3c7] text-[#d97706]",
    accentColor: "#d97706",
    includesFrom: "PRO",
    features: [
      { title: "Неограниченное количество сотрудников" },
      { title: "Работа с несколькими филиалами", description: "Управляйте всей сетью клиник из одного кабинета." },
      { title: "Единая база пациентов", description: "История лечения доступна во всех филиалах." },
      { title: "Максимальные возможности искусственного интеллекта" },
      { title: "Максимальные лимиты чат-бота" },
      { title: "Персональный менеджер сопровождения" },
      { title: "Индивидуальная настройка системы под вашу сеть" },
    ],
    limits: [
      { text: "Неограниченное количество сотрудников" },
      { text: "Неограниченное количество шаблонов документов" },
      { text: "До 15 000 AI-кредитов в месяц" },
      { text: "До 5 000 диалогов чат-бота в месяц" },
    ],
  },
];

const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: "Без тарифа",
  starter: "START",
  professional: "PRO",
  enterprise: "ENTERPRISE",
};

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

const COMMON_FEATURES = [
  "Полноценная система управления стоматологией",
  "База пациентов и история лечения",
  "Запись пациентов и расписание врачей",
  "WhatsApp для общения с пациентами",
  "Финансовый учет и аналитика",
  "Контроль сотрудников",
  "Электронные договоры",
  "Автоматические рассылки пациентам",
  "Искусственный интеллект",
  "Облачное хранение данных",
  "Регулярные обновления системы",
  "Защита и резервное копирование данных",
];

function CurrentSubscriptionBanner({ clinic }: { clinic: Clinic | null }) {
  const status = getSubscriptionStatus(clinic);

  if (status.kind === "active_plan") {
    return (
      <div className="bg-[var(--success-light)] border border-[var(--success)]/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--success)]/15 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-[var(--success)]" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--success)] uppercase tracking-wider">Ваш тариф</p>
            <p className="text-[18px] font-black text-[var(--text)] mt-0.5">{PLAN_DISPLAY_NAMES[status.plan]}</p>
            {status.expiresAt ? (
              <p className="text-[13px] text-[var(--success)] mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Действует до {formatExpiryDate(status.expiresAt)}
              </p>
            ) : (
              <p className="text-[13px] text-[var(--success)] mt-1">Подписка активна</p>
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
            <p className="text-[11px] font-bold text-[#0284c7] uppercase tracking-wider">Пробный период</p>
            <p className="text-[18px] font-black text-[#0f172a] mt-0.5">Активен</p>
            <p className="text-[13px] text-[#0284c7] mt-1 flex items-center gap-1.5">
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
            <p className="text-[11px] font-bold text-[#d97706] uppercase tracking-wider">Тариф истёк</p>
            <p className="text-[18px] font-black text-[#0f172a] mt-0.5">{PLAN_DISPLAY_NAMES[status.plan]}</p>
            <p className="text-[13px] text-[#d97706] mt-1 flex items-center gap-1.5">
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
            <p className="text-[11px] font-bold text-[#d97706] uppercase tracking-wider">Пробный период</p>
            <p className="text-[18px] font-black text-[#0f172a] mt-0.5">Закончился</p>
            <p className="text-[13px] text-[#d97706] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Истёк {formatExpiryDate(status.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-[var(--text-secondary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Текущий статус</p>
          <p className="text-[18px] font-black text-[var(--text)] mt-0.5">Тариф не подключён</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Выберите тариф ниже, чтобы подключить систему</p>
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

  return (
    <PageShell className="pb-10">
      <PageHeader
        title="Тарифы"
        onBack={() => setLocation("/menu")}
        sticky
      />

      <div className="px-4 pt-6 space-y-5">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h2 className="text-[22px] font-bold text-[var(--text)]">Тарифы 1Dent</h2>
          <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-xs mx-auto">
            Подберите план, который подходит именно вашей клинике
          </p>
        </div>

        <CurrentSubscriptionBanner clinic={clinic} />

        {/* Plan cards */}
        <div className="space-y-5">
          {PLANS.map((plan) => {
            const isCurrentPlan = activePaidPlan === plan.id;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative bg-[var(--ds-surface)] rounded-2xl border-2 overflow-hidden",
                  plan.badge
                    ? "border-[var(--ds-primary)] shadow-md shadow-[var(--ds-primary)]/10"
                    : isCurrentPlan
                    ? "border-[var(--success)] shadow-md"
                    : "border-[var(--ds-border)] shadow-md",
                )}
              >
                {plan.badge && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-[var(--ds-primary)] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                      <Star className="w-3 h-3" /> {plan.badge}
                    </div>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-[var(--success)] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
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
                      <h3 className="text-[20px] font-black text-[var(--text)] tracking-tight">{plan.name}</h3>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{plan.subtitle}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[30px] font-black text-[var(--text)]">
                        {plan.price.toLocaleString("ru-KZ")}
                      </span>
                      <span className="text-[14px] text-[var(--text-secondary)] font-medium">₸ / мес</span>
                    </div>
                  </div>

                  {/* Includes from */}
                  {plan.includesFrom && (
                    <div className="mb-4 px-3 py-2 bg-[var(--ds-surface)]/60 border border-[var(--ds-border)]/60 rounded-xl">
                      <p className="text-[12px] text-[var(--text-secondary)] font-medium">
                        Всё из тарифа <span className="font-bold text-[var(--text)]">{plan.includesFrom}</span>, а также:
                      </p>
                    </div>
                  )}

                  {/* Features */}
                  <div className="space-y-3 mb-5">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: plan.accentColor + "18" }}>
                          <Check className="w-3 h-3" strokeWidth={3} style={{ color: plan.accentColor }} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[var(--text)] leading-snug">{feature.title}</p>
                          {feature.description && (
                            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mt-0.5">{feature.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Limits */}
                  <div className="bg-[var(--ds-surface)]/70 border border-[var(--ds-border)] rounded-xl p-3.5 mb-5">
                    <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Лимиты</p>
                    <div className="space-y-1.5">
                      {plan.limits.map((limit, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)] shrink-0" />
                          <span className="text-[12px] text-[var(--text-secondary)]">{limit.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action button */}
                  <button
                    disabled={isCurrentPlan}
                    onClick={() => !isCurrentPlan && setRequestPlan(plan.name)}
                    className={cn(
                      "w-full py-3.5 rounded-full text-[14px] font-semibold transition-all",
                      isCurrentPlan
                        ? "bg-[var(--success-light)] text-[var(--success)] cursor-default"
                        : plan.badge
                        ? "bg-[var(--ds-primary)] text-white hover:bg-[var(--primary-hover)] hover:scale-105 active:scale-95 shadow-md"
                        : "bg-[var(--text)] text-white hover:opacity-90 hover:scale-105 active:scale-95",
                    )}
                  >
                    {isCurrentPlan ? "Текущий план" : "Выбрать план"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Common features */}
        <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[var(--success-light)] flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 text-[var(--success)]" />
            </div>
            <h3 className="text-[15px] font-bold text-[var(--text)]">Во все тарифы входит</h3>
          </div>
          <div className="space-y-2.5">
            {COMMON_FEATURES.map((feature, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[var(--success-light)] flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-[var(--success)]" strokeWidth={3} />
                </div>
                <span className="text-[13px] text-[var(--text)]">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[12px] text-[var(--text-subtle)] leading-relaxed">
            Все цены указаны в тенге (₸). Оплата через Kaspi.
            <br />
            Есть вопросы? Напишите нам в WhatsApp.
          </p>
        </div>
      </div>

      {/* Request form modal */}
      {requestPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#e8e3d9] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e3d9]">
              <div>
                <h3 className="font-bold text-[#0f172a]">Заявка на тариф {requestPlan}</h3>
                <p className="text-xs text-[#64748b] mt-0.5">Мы свяжемся с вами для подключения</p>
              </div>
              <button onClick={() => { setRequestPlan(null); setSubmitted(false); }} className="p-1.5 rounded-xl hover:bg-[#f1ede4] transition-colors">
                <X className="w-5 h-5 text-[#94a3b8]" />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-[#16a34a]" strokeWidth={3} />
                </div>
                <h4 className="text-lg font-bold text-[#0f172a] mb-1">Заявка отправлена!</h4>
                <p className="text-sm text-[#64748b] mb-5">Мы свяжемся с вами в ближайшее время для подключения тарифа.</p>
                <button
                  onClick={() => { setRequestPlan(null); setSubmitted(false); }}
                  className="px-6 py-2.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white rounded-full text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#64748b] mb-1 block">Имя <span className="text-[#dc2626]">*</span></label>
                  <input
                    type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ваше имя"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#64748b] mb-1 block">Телефон <span className="text-[#dc2626]">*</span></label>
                  <input
                    type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#64748b] mb-1 block">Email</label>
                  <input
                    type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#64748b] mb-1 block">Комментарий</label>
                  <textarea
                    value={formMessage} onChange={(e) => setFormMessage(e.target.value)}
                    placeholder="Дополнительная информация..."
                    rows={2}
                    className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 resize-none transition-colors"
                  />
                </div>
                <button
                  onClick={() => void handleSubmitRequest()}
                  disabled={createPlanMutation.isPending || !formName.trim() || !formPhone.trim()}
                  className="w-full py-3 bg-[#1f75fe] hover:bg-[#1a65e8] text-white rounded-full text-sm font-semibold hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
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
