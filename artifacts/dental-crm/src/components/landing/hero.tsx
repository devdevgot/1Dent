import { motion } from "framer-motion";
import { ArrowRight, Star, Bot, MessageSquare, Users } from "lucide-react";
import { Link } from "wouter";
import { SITE } from "@/config/site";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Hero() {
  return (
    <section className="relative flex flex-col items-center bg-[var(--bg)] overflow-hidden pt-28 pb-32">
      <div className="absolute inset-0 pointer-events-none landing-grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(900px,100vw)] h-[480px] pointer-events-none landing-hero-glow" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center">
        <motion.a
          {...fadeUp(0.05)}
          href="#features"
          className="landing-badge landing-badge-light font-manrope mb-8"
        >
          <Star size={13} className="text-[var(--ds-primary)]" fill="currentColor" />
          <span className="font-semibold">Новое:</span>
          <span className="text-[var(--text-secondary)]">{SITE.hero.announcement}</span>
          <ArrowRight size={13} className="text-[var(--text-subtle)]" />
        </motion.a>

        <motion.h1
          {...fadeUp(0.15)}
          className="landing-display font-manrope text-[var(--text)] mb-6"
        >
          {SITE.hero.headline}
          <br />
          <span className="landing-gradient-text">{SITE.hero.headlineAccent}</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.25)}
          className="landing-lead font-manrope mb-10 max-w-2xl"
        >
          {SITE.hero.subtitle}
        </motion.p>

        <motion.div {...fadeUp(0.35)} className="flex flex-wrap items-center justify-center gap-3 mb-16">
          <Link href="/register" className="landing-btn landing-btn-primary font-manrope">
            Начать бесплатно
            <ArrowRight size={16} />
          </Link>
          <a href="#features" className="landing-btn landing-btn-secondary font-manrope">
            Смотреть демо
          </a>
        </motion.div>

        <motion.div
          {...fadeUp(0.4)}
          className="flex items-center justify-center gap-8 flex-wrap"
        >
          {[
            { icon: Bot, text: "AI-powered" },
            { icon: MessageSquare, text: "WhatsApp интеграция" },
            { icon: Users, text: "Для клиник Казахстана" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-2 text-sm font-manrope text-[var(--text-subtle)]">
              <b.icon size={14} className="text-[var(--ds-primary)]" />
              <span>{b.text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
