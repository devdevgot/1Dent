import { motion } from "framer-motion";
import { Sparkles, Star, Rocket, Check, CreditCard } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "../../lib/animations";

const plans = [
  {
    id: "starter",
    name: "START",
    price: 99000,
    subtitle: "Для небольших стоматологий до 10 сотрудников.",
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
      "До 10 сотрудников",
      "До 5 шаблонов документов",
      "До 1 000 AI-кредитов в месяц",
      "До 300 диалогов чат-бота в месяц",
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
      "До 30 сотрудников",
      "Больше возможностей ИИ",
      "Более мощный чат-бот",
      "Подробная аналитика клиники",
      "Глубокий контроль сотрудников",
      "Приоритетная поддержка",
    ],
    limits: [
      "До 30 сотрудников",
      "До 20 шаблонов документов",
      "До 5 000 AI-кредитов в месяц",
      "До 1 500 диалогов чат-бота в месяц",
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
      "Неограниченно сотрудников",
      "Несколько филиалов",
      "Единая база пациентов",
      "Максимальные лимиты ИИ",
      "Максимальные лимиты чат-бота",
      "Персональный менеджер",
      "Индивидуальная настройка",
    ],
    limits: [
      "Неограниченно сотрудников",
      "Неограниченно шаблонов",
      "До 15 000 AI-кредитов в месяц",
      "До 5 000 диалогов чат-бота в месяц",
    ],
  },
];

function formatPrice(price: number) {
  return price.toLocaleString("ru-KZ") + " ₸";
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-[#f1ede4] py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          {...fadeUp(0)}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-white text-[#64748b] rounded-full px-4 py-2 text-sm font-manrope font-medium mb-6 border border-[#e8e3d9]">
            <CreditCard size={14} />
            <span>Простые тарифы</span>
          </div>
          <h2
            className="font-manrope font-extrabold text-[#0f172a] leading-tight mb-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
          >
            Выберите план
          </h2>
          <p className="font-manrope text-[#64748b] text-lg max-w-xl mx-auto">
            14 дней бесплатного пробного периода. Без карты.
          </p>
        </motion.div>

        {/* Plans */}
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
              whileHover={{ scale: 1.02 }}
              className={`relative bg-white rounded-3xl p-8 border shadow-sm hover:shadow-lg transition-all ${
                plan.badge ? "border-[#1f75fe] shadow-[#1f75fe]/10" : "border-[#e8e3d9]"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#1f75fe] text-white text-xs font-manrope font-semibold px-4 py-1.5 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: plan.accent + "20" }}
                >
                  <plan.icon size={22} style={{ color: plan.accent }} />
                </div>
                <div>
                  <h3 className="font-manrope font-bold text-[#0f172a] text-xl">{plan.name}</h3>
                  <p className="font-manrope text-[#94a3b8] text-xs">{plan.subtitle}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6 pb-6 border-b border-[#f1ede4]">
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-manrope font-extrabold text-4xl"
                    style={{ color: plan.accent }}
                  >
                    {formatPrice(plan.price)}
                  </span>
                </div>
                <span className="font-manrope text-[#94a3b8] text-sm">/месяц</span>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-6">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: plan.accent + "20" }}
                    >
                      <Check size={11} style={{ color: plan.accent }} strokeWidth={3} />
                    </div>
                    <span className="font-manrope text-[#0f172a] text-sm">{f}</span>
                  </li>
                ))}
              </ul>

              {/* Limits */}
              <div className="bg-[#faf8f4] rounded-2xl p-4 mb-6">
                <div className="font-manrope font-semibold text-[#0f172a] text-xs mb-2">Лимиты:</div>
                <ul className="space-y-1">
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

              {/* CTA */}
              <a
                href="#contact"
                className="block w-full text-center font-manrope font-semibold py-4 rounded-2xl transition-all hover:scale-105"
                style={
                  plan.badge
                    ? { backgroundColor: plan.accent, color: "#fff" }
                    : { backgroundColor: plan.accent + "15", color: plan.accent }
                }
              >
                Начать с {plan.name}
              </a>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom note */}
        <motion.p
          {...fadeUp(0.2)}
          className="text-center font-manrope text-[#94a3b8] text-sm mt-10"
        >
          Нужен индивидуальный тариф для сети клиник?{" "}
          <a href="#contact" className="text-[#1f75fe] hover:underline font-medium">
            Свяжитесь с нами
          </a>
        </motion.p>
      </div>
    </section>
  );
}
