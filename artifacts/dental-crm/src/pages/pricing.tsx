import { useState } from "react";
import { Link } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Check, Star, Sparkles, Rocket, Building2, Shield, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
    gradient: "from-blue-50 to-indigo-50",
    iconBg: "bg-blue-100 text-blue-600",
    accentColor: "#3b82f6",
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
    gradient: "from-primary/5 to-blue-50",
    iconBg: "bg-primary/15 text-primary",
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
    gradient: "from-amber-50 to-orange-50",
    iconBg: "bg-amber-100 text-amber-600",
    accentColor: "#f59e0b",
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

export default function PricingPage() {
  const { clinic, user } = useAuthStore();
  const { toast } = useToast();
  const currentPlan = ((clinic as any)?.plan as PlanId) ?? "free";
  const [requestPlan, setRequestPlan] = useState<string | null>(null);
  const [formName, setFormName] = useState(user?.name ?? "");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState(user?.email ?? "");
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitRequest = async () => {
    if (!formName.trim() || !formPhone.trim() || !requestPlan) return;
    setSubmitting(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch("/api/plan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        credentials: "include",
        body: JSON.stringify({
          plan: requestPlan,
          contactName: formName.trim(),
          contactPhone: formPhone.trim(),
          contactEmail: formEmail.trim() || undefined,
          message: formMessage.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
      toast({ title: "Заявка отправлена!" });
    } catch {
      toast({ title: "Ошибка отправки", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-[17px] font-semibold text-gray-900">Тарифы</h1>
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h2 className="text-[22px] font-bold text-gray-900">Тарифы 1Dent</h2>
          <p className="text-[14px] text-gray-500 leading-relaxed max-w-xs mx-auto">
            Подберите план, который подходит именно вашей клинике
          </p>
        </div>

        {/* Plan cards */}
        <div className="space-y-5">
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative bg-white rounded-2xl border-2 overflow-hidden",
                  plan.badge
                    ? "border-primary shadow-lg shadow-primary/10"
                    : isCurrentPlan
                    ? "border-emerald-400 shadow-md"
                    : "border-gray-100 shadow-sm",
                )}
              >
                {plan.badge && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                      <Star className="w-3 h-3" /> {plan.badge}
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
                      <h3 className="text-[20px] font-black text-gray-900 tracking-tight">{plan.name}</h3>
                      <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{plan.subtitle}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[30px] font-black text-gray-900">
                        {plan.price.toLocaleString("ru-KZ")}
                      </span>
                      <span className="text-[14px] text-gray-500 font-medium">₸ / мес</span>
                    </div>
                  </div>

                  {/* Includes from */}
                  {plan.includesFrom && (
                    <div className="mb-4 px-3 py-2 bg-white/60 border border-gray-200/60 rounded-xl">
                      <p className="text-[12px] text-gray-600 font-medium">
                        Всё из тарифа <span className="font-bold text-gray-900">{plan.includesFrom}</span>, а также:
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
                          <p className="text-[13px] font-semibold text-gray-800 leading-snug">{feature.title}</p>
                          {feature.description && (
                            <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{feature.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Limits */}
                  <div className="bg-white/70 border border-gray-100 rounded-xl p-3.5 mb-5">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Лимиты</p>
                    <div className="space-y-1.5">
                      {plan.limits.map((limit, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                          <span className="text-[12px] text-gray-600">{limit.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action button */}
                  <button
                    disabled={isCurrentPlan}
                    onClick={() => !isCurrentPlan && setRequestPlan(plan.name)}
                    className={cn(
                      "w-full py-3.5 rounded-xl text-[14px] font-bold transition-all",
                      isCurrentPlan
                        ? "bg-emerald-100 text-emerald-700 cursor-default"
                        : plan.badge
                        ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-md"
                        : "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]",
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <h3 className="text-[15px] font-bold text-gray-900">Во все тарифы входит</h3>
          </div>
          <div className="space-y-2.5">
            {COMMON_FEATURES.map((feature, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-emerald-600" strokeWidth={3} />
                </div>
                <span className="text-[13px] text-gray-700">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Все цены указаны в тенге (₸). Оплата через Kaspi.
            <br />
            Есть вопросы? Напишите нам в WhatsApp.
          </p>
        </div>
      </div>

      {/* Request form modal */}
      {requestPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Заявка на тариф {requestPlan}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Мы свяжемся с вами для подключения</p>
              </div>
              <button onClick={() => { setRequestPlan(null); setSubmitted(false); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-emerald-600" strokeWidth={3} />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-1">Заявка отправлена!</h4>
                <p className="text-sm text-gray-500 mb-5">Мы свяжемся с вами в ближайшее время для подключения тарифа.</p>
                <button
                  onClick={() => { setRequestPlan(null); setSubmitted(false); }}
                  className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Имя <span className="text-red-400">*</span></label>
                  <input
                    type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ваше имя"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Телефон <span className="text-red-400">*</span></label>
                  <input
                    type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
                  <input
                    type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Комментарий</label>
                  <textarea
                    value={formMessage} onChange={(e) => setFormMessage(e.target.value)}
                    placeholder="Дополнительная информация..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>
                <button
                  onClick={() => void handleSubmitRequest()}
                  disabled={submitting || !formName.trim() || !formPhone.trim()}
                  className="w-full py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Отправить заявку
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
