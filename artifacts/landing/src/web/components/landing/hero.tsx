import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Hero() {
  return (
    <section className="relative flex flex-col items-center bg-[#faf8f4] overflow-hidden pt-24 pb-28">
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e8e3d9 1px, transparent 1px),
            linear-gradient(to bottom, #e8e3d9 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(31,117,254,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center">
        {/* Headline */}
        <motion.h1
          {...fadeUp(0.15)}
          className="font-manrope font-extrabold text-[#0f172a] leading-[1.0] tracking-tight mb-6"
          style={{ fontSize: "clamp(48px, 7.5vw, 88px)" }}
        >
          Управляй клиникой.
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #1f75fe 0%, #60a5fa 50%, #1f75fe 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Расти быстрее.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...fadeUp(0.25)}
          className="font-manrope text-[#64748b] text-xl leading-relaxed mb-10 max-w-2xl"
        >
          Все пациенты, финансы, WhatsApp и ИИ — в одной системе.
          Больше никаких Excel и потерянных заявок.
        </motion.p>

        {/* CTA */}
        <motion.div {...fadeUp(0.35)} className="flex flex-wrap items-center justify-center gap-3 mb-16">
          <a
            href="#contact"
            className="font-manrope font-semibold text-white bg-[#0f172a] px-7 py-3.5 rounded-full hover:bg-[#1e293b] transition-all hover:scale-105 flex items-center gap-2 shadow-lg"
          >
            Начать бесплатно
            <ArrowRight size={16} />
          </a>
          <a
            href="#features"
            className="font-manrope font-semibold text-[#0f172a] bg-white border border-[#e8e3d9] px-7 py-3.5 rounded-full hover:bg-[#f1ede4] transition-colors"
          >
            Смотреть демо
          </a>
        </motion.div>
      </div>
    </section>
  );
}
