import { motion } from "framer-motion";
import { Sparkles, Star, Rocket, Check, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";

const plans = [
  {
    id: "starter",
    name: "START",
    price: 99000,
    subtitle: "Для небольших стоматологий до 5 сотрудников.",
    icon: Sparkles,
    gradient: "from-blue-50 to-indigo-50",
    accent: "#3b82f6",
    badge: null,
    features: [
      "Все пациенты в одной системе",
      "Полный контроль расписания",
      "Общение с пациентами через WhatsApp",
      "Автоматические напоминания пациентам",
      "ИИ для ежедневной работы",
      "Умный чат-бот для обращений",
      "Контроль финансов клиники",
      "Контроль эффективности сотрудников",
      "Электронные договоры",
      "Автоматические рассылки",
    ],
    limits: [
      "До 5 сотрудников",
      "1 филиал",
      "До 500 AI-кредитов в месяц",
      "До 100 диалогов чат-бота в месяц",
      "До 5 шаблонов договоров",
    ],
  },
  {
    id: "professional",
    name: "PRO",
    price: 159000,
    subtitle: "Для клиник, которые хотят расти быстрее.",
    icon: Star,
    gradient: "from-[#1f75fe]/5 to-blue-50",
    accent: "#1f75fe",
    badge: "Рекомендуемый",
    includesFrom: "START",
    features: [
      "Всё из плана START",
      "До 15 сотрудников",
      "До 3 филиалов",
      "Больше возможностей ИИ",
      "Более мощный чат-бот",
      "Подробная аналитика клиники",
      "Глубокий контроль сотрудников",
      "Приоритетная поддержка",
    ],
    limits: [
      "До 15 сотрудников",
      "До 3 филиалов",
      "До 30 шаблонов договоров",
      "До 3 000 AI-кредитов в месяц",
      "До 1 000 диалогов чат-бота в месяц",
    ],
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: 199000,
    subtitle: "Для крупных клиник и сетей.",
    icon: Rocket,
    gradient: "from-amber-50 to-orange-50",
    accent: "#f59e0b",
    badge: null,
    includesFrom: "PRO",
    features: [
      "Всё из плана PRO",
      "До 30 сотрудников",
      "До 10 филиалов",
      "Единая база пациентов",
      "Максимальные лимиты ИИ",
      "Максимальные лимиты чат-бота",
      "Персональный менеджер",
      "Индивидуальная настройка",
    ],
    limits: [
      "До 30 сотрудников",
      "До 10 филиалов",
      "Безлимит шаблонов договоров",
      "До 7 000 AI-кредитов в месяц",
      "До 5 000 диалогов чат-бота в месяц",
    ],
  },
];

function formatPrice(price: number) {
  return price.toLocaleString("ru-KZ") + " ₸";
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-[#f1ede4] landing-section-sm px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <div className="landing-badge landing-badge-light font-manrope mb-6">
            <CreditCard size={14} />
            <span>Простые тарифы</span>
          </div>
          <h2 className="landing-h2 font-manrope text-[#0f172a] mb-4">
            Выберите план
          </h2>
          <p className="landing-lead font-manrope max-w-xl mx-auto">
            3 дня бесплатного пробного периода. Без карты.
          </p>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid lg:grid-cols-3 gap-6"
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              variants={staggerChildVariants}
              style={{ willChange: "transform, opacity" }}
              whileHover={{ y: -4 }}
              className={`relative landing-card p-8 ${
                plan.badge ? "landing-pricing-featured" : ""
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[var(--ds-primary)] text-white text-xs font-manrope font-semibold px-4 py-1.5 rounded-full whitespace-nowrap shadow-[var(--shadow-sm)]">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: plan.accent + "20" }}
                >
                  <plan.icon size={20} style={{ color: plan.accent }} />
                </div>
                <div>
                  <h3 className="font-manrope font-bold text-[#0f172a] text-xl tracking-tight">{plan.name}</h3>
                  <p className="font-manrope text-[#94a3b8] text-xs">{plan.subtitle}</p>
                </div>
              </div>

              <div className="mb-6 pb-6 border-b border-[var(--surface-2)]">
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-manrope font-extrabold text-4xl tracking-tight"
                    style={{ color: plan.accent }}
                  >
                    {formatPrice(plan.price)}
                  </span>
                </div>
                <span className="font-manrope text-[#94a3b8] text-sm">/месяц</span>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: plan.accent + "20" }}
                    >
                      <Check size={11} style={{ color: plan.accent }} strokeWidth={3} />
                    </div>
                    <span className="font-manrope text-[#0f172a] text-sm leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-[#faf8f4] rounded-2xl p-4 mb-6 border border-[#e8e3d9]">
                <div className="font-manrope font-semibold text-[#0f172a] text-xs mb-2">Лимиты:</div>
                <ul className="space-y-1.5">
                  {plan.limits.map((l, j) => (
                    <li key={j} className="font-manrope text-[#64748b] text-xs flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: plan.accent }}
                      />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/register"
                className="landing-btn block w-full text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)] focus-visible:ring-offset-2"
                style={
                  plan.badge
                    ? { backgroundColor: plan.accent, color: "#fff" }
                    : { backgroundColor: plan.accent + "15", color: plan.accent }
                }
              >
                Начать с {plan.name}
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          {...fadeUp(0.2)}
          className="text-center font-manrope text-[#94a3b8] text-sm mt-10"
        >
          Нужен индивидуальный тариф для сети клиник?{" "}
          <a href="#contact" className="text-[#1f75fe] hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)] rounded">
            Свяжитесь с нами
          </a>
        </motion.p>
      </div>
    </section>
  );
}
