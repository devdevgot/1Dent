import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Flag, HeartHandshake, Shield, RefreshCw, Target } from "lucide-react";
import { EASE, fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

function useCountUp(end: number, duration = 1500, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    const step = end / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [start, end, duration]);
  return count;
}

function StatCard({ value, suffix, label, delay }: { value: number; suffix: string; label: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const count = useCountUp(value, 1200, inView);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay, duration: 0.55, ease: EASE }}
      style={{ willChange: "transform, opacity" }}
      className="text-center"
    >
      <div className="landing-stat-value font-manrope mb-2">
        {count}{suffix}
      </div>
      <div className="font-manrope text-[#64748b] text-base">{label}</div>
    </motion.div>
  );
}

const reasons = [
  {
    icon: Flag,
    title: "Сделано в Казахстане",
    desc: "Система разработана именно для рынка Казахстана и СНГ — с учётом местных реалий, Kaspi, языков.",
    color: "#e0f2fe",
    accent: "#0284c7",
  },
  {
    icon: HeartHandshake,
    title: "Поддержка на русском",
    desc: "Команда поддержки отвечает на русском и казахском. Быстро. Помогаем, а не отправляем в базу знаний.",
    color: "#d1fae5",
    accent: "#059669",
  },
  {
    icon: Shield,
    title: "Ваши данные в безопасности",
    desc: "Шифрование, резервные копии, изоляция по клиникам. Данные пациентов не покидают систему.",
    color: "#fce7f3",
    accent: "#db2777",
  },
  {
    icon: RefreshCw,
    title: "Регулярные обновления",
    desc: "Мы постоянно добавляем новые функции. Ваша подписка включает все обновления без доплат.",
    color: "#fef3c7",
    accent: "#d97706",
  },
];

export function SocialProof() {
  return (
    <section className="bg-white landing-section-sm px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-6">
          <div className="landing-badge landing-badge-primary font-manrope mb-10">
            <Target size={14} />
            <span>Почему {SITE.name}</span>
          </div>
        </motion.div>

        <div className="landing-divider mb-16" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-24">
          <StatCard value={10} suffix="+" label="модулей системы" delay={0} />
          <StatCard value={3} suffix="" label="тарифных плана" delay={0.1} />
          <StatCard value={5} suffix="" label="ролей доступа" delay={0.2} />
          <StatCard value={24} suffix="/7" label="ИИ-чатбот работает" delay={0.3} />
        </div>

        <motion.h2
          {...fadeUp(0)}
          className="landing-h2 font-manrope text-[#0f172a] text-center mb-12"
        >
          Почему выбирают нас
        </motion.h2>

        <motion.div
          variants={staggerParentVariants(0.09)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {reasons.map((r, i) => (
            <motion.div
              key={i}
              variants={staggerChildVariants}
              style={{ willChange: "transform, opacity" }}
              whileHover={{ y: -4 }}
              className="landing-card p-6 hover:border-[var(--border-strong)]"
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: r.color }}
              >
                <r.icon size={20} style={{ color: r.accent }} />
              </div>
              <h3 className="font-manrope font-bold text-[#0f172a] text-lg mb-2 tracking-tight">{r.title}</h3>
              <p className="landing-body font-manrope">{r.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
