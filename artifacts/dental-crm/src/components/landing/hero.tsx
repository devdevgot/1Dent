import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { SITE } from "@/config/site";
import { KanbanPageMockup } from "./mockups/kanban-page-mockup";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#faf8f4] pt-28 pb-16 lg:pb-20">
      <div className="absolute inset-0 pointer-events-none landing-grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(900px,100vw)] h-[480px] pointer-events-none landing-hero-glow" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 min-w-0">
        <div className="grid lg:grid-cols-2 gap-10 items-center min-w-0">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <motion.h1
              {...fadeUp(0.15)}
              className="landing-display font-manrope text-[#0f172a] mb-5"
            >
              {SITE.hero.headline}
              <br />
              <span className="landing-gradient-text">{SITE.hero.headlineAccent}</span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.25)}
              className="landing-lead font-manrope mb-8 max-w-lg"
            >
              {SITE.hero.subtitle}
            </motion.p>

            <motion.div {...fadeUp(0.35)} className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-6">
              <Link href="/register" className="landing-btn landing-btn-primary font-manrope">
                Начать бесплатно
                <ArrowRight size={16} />
              </Link>
              <a href="#features" className="landing-btn landing-btn-secondary font-manrope">
                Смотреть возможности
              </a>
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.2)} className="w-full min-w-0 max-w-md mx-auto lg:max-w-none">
            <KanbanPageMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
