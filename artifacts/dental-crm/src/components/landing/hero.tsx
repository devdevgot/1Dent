import { motion } from "framer-motion";
import { ArrowRight, Star, Bot, MessageSquare, Users } from "lucide-react";
import { Link } from "wouter";
import { SITE } from "@/config/site";
import { HeroProductPreview } from "./hero-product-preview";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#faf8f4] pt-28 pb-20 lg:pb-28">
      <div className="absolute inset-0 pointer-events-none landing-grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(900px,100vw)] h-[480px] pointer-events-none landing-hero-glow" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <motion.a
              {...fadeUp(0.05)}
              href="#killer-features"
              className="landing-badge landing-badge-light font-manrope mb-8"
            >
              <Star size={13} className="text-[#1f75fe]" fill="currentColor" />
              <span className="font-semibold">Новое:</span>
              <span className="text-[#64748b]">{SITE.hero.announcement}</span>
              <ArrowRight size={13} className="text-[#94a3b8]" />
            </motion.a>

            <motion.h1
              {...fadeUp(0.15)}
              className="landing-display font-manrope text-[#0f172a] mb-6"
            >
              {SITE.hero.headline}
              <br />
              <span className="landing-gradient-text">{SITE.hero.headlineAccent}</span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.25)}
              className="landing-lead font-manrope mb-6 max-w-xl"
            >
              {SITE.hero.subtitle}
            </motion.p>

            <motion.ul {...fadeUp(0.3)} className="space-y-2 mb-8 w-full max-w-md">
              {SITE.hero.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm font-manrope text-[#64748b]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--ds-primary)] flex-shrink-0" />
                  {b}
                </li>
              ))}
            </motion.ul>

            <motion.div {...fadeUp(0.35)} className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-8">
              <Link href="/register" className="landing-btn landing-btn-primary font-manrope">
                Начать бесплатно
                <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className="landing-btn landing-btn-secondary font-manrope">
                Как это работает
              </a>
            </motion.div>

            <motion.p {...fadeUp(0.38)} className="text-xs font-manrope text-[#94a3b8] mb-6">
              {SITE.hero.trialNote}. Без карты.
            </motion.p>

            <motion.div
              {...fadeUp(0.4)}
              className="flex items-center justify-center lg:justify-start gap-8 flex-wrap"
            >
              {[
                { icon: Bot, text: "AI-powered" },
                { icon: MessageSquare, text: "WhatsApp интеграция" },
                { icon: Users, text: "Для клиник Казахстана" },
              ].map((b) => (
                <div key={b.text} className="flex items-center gap-2 text-sm font-manrope text-[#94a3b8]">
                  <b.icon size={14} className="text-[#1f75fe]" />
                  <span>{b.text}</span>
                </div>
              ))}
            </motion.div>
          </div>

          <HeroProductPreview />
        </div>
      </div>
    </section>
  );
}
