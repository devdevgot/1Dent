import { motion } from "framer-motion";
import { MessageSquare, Users, Sparkles } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";

const steps = [
  {
    icon: MessageSquare,
    step: "01",
    title: "Подключите WhatsApp",
    desc: "Привяжите номер клиники — все сообщения попадают в единый чат внутри системы.",
    color: "#d1fae5",
    accent: "#059669",
  },
  {
    icon: Users,
    step: "02",
    title: "Заведите пациентов",
    desc: "Канбан-воронка, FDI-карта и история лечения — всё в одной карточке пациента.",
    color: "#e0e7ff",
    accent: "#4f46e5",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "ИИ ведёт до записи",
    desc: "Чатбот отвечает 24/7, записывает на приём и отправляет напоминания автоматически.",
    color: "#e0f2fe",
    accent: "#0284c7",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#faf8f4] landing-section-sm px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <div className="landing-badge landing-badge-primary font-manrope mb-6">
            <span>3 простых шага</span>
          </div>
          <h2 className="landing-h2 font-manrope text-[#0f172a]">
            Как это работает
          </h2>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.12)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid md:grid-cols-3 gap-6"
        >
          {steps.map((s) => (
            <motion.div
              key={s.step}
              variants={staggerChildVariants}
              className="landing-card p-8 text-center relative"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: s.color }}
              >
                <s.icon size={24} style={{ color: s.accent }} />
              </div>
              <span className="text-xs font-manrope font-bold text-[#94a3b8] uppercase tracking-wider">
                Шаг {s.step}
              </span>
              <h3 className="font-manrope font-bold text-[#0f172a] text-xl mt-2 mb-3 tracking-tight">
                {s.title}
              </h3>
              <p className="landing-body font-manrope">{s.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
