import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RevenueGrowthIllustrationProps {
  className?: string;
}

const BARS = [
  { x: 58, fullY: 118, height: 14, fill: "#e8e3d9", opacity: 1, delay: 0.15 },
  { x: 84, fullY: 104, height: 28, fill: "#94a3b8", opacity: 0.55, delay: 0.28 },
  { x: 110, fullY: 88, height: 44, fill: "#1f75fe", opacity: 0.35, delay: 0.41 },
  { x: 136, fullY: 72, height: 60, fill: "#1f75fe", opacity: 1, delay: 0.54 },
];

const BASE_Y = 132;

/** Motivating empty-state illustration: rising chart + coin sparkle (DS palette), animated. */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      {/* Pulsing glow */}
      <motion.div
        className="absolute inset-4 rounded-full bg-[var(--primary-light)] blur-2xl"
        initial={{ opacity: 0.5, scale: 0.9 }}
        animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.45], scale: [0.92, 1.04, 0.92] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full drop-shadow-sm"
        initial={reduceMotion ? false : { scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <circle cx="100" cy="100" r="88" fill="#f1ede4" />
        <circle cx="100" cy="100" r="72" fill="#ffffff" stroke="#e8e3d9" strokeWidth="1.5" />

        {/* Soft grid */}
        <line x1="48" y1="132" x2="152" y2="132" stroke="#e8e3d9" strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="112" x2="152" y2="112" stroke="#f1ede4" strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="92" x2="152" y2="92" stroke="#f1ede4" strokeWidth="1" strokeLinecap="round" />

        {/* Rising bars — grow up from baseline */}
        {BARS.map((bar, i) => (
          <motion.rect
            key={i}
            x={bar.x}
            width="18"
            rx="6"
            fill={bar.fill}
            opacity={bar.opacity}
            initial={reduceMotion ? false : { y: BASE_Y, height: 0 }}
            animate={{ y: bar.fullY, height: bar.height }}
            transition={{ duration: 0.6, delay: bar.delay, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}

        {/* Growth line — draws in */}
        <motion.path
          d="M67 126 C78 120, 90 108, 102 98 S126 78, 145 68"
          stroke="#16a34a"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.7, ease: "easeInOut" }}
        />

        {/* End-point pulse */}
        <motion.circle
          cx="145" cy="68" r="9" fill="#16a34a" opacity="0.2"
          initial={reduceMotion ? false : { scale: 0 }}
          animate={reduceMotion ? { scale: 1 } : { scale: [0, 1.6, 1], opacity: [0, 0.25, 0.2] }}
          transition={{ duration: 1, delay: 1.5, ease: "easeOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <motion.circle
          cx="145" cy="68" r="5" fill="#16a34a"
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 1.5, ease: "backOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />

        {/* Coin — floats up and down */}
        <motion.g
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.95, ease: "backOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <motion.g
            animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
          >
            <circle cx="62" cy="62" r="18" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
            <text x="62" y="67" textAnchor="middle" fontSize="14" fontWeight="700" fill="#d97706" fontFamily="Manrope, sans-serif">
              ₸
            </text>
          </motion.g>
        </motion.g>

        {/* Sparkles — twinkle */}
        <motion.path
          d="M158 48 L160 54 L166 56 L160 58 L158 64 L156 58 L150 56 L156 54 Z"
          fill="#1f75fe"
          animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <motion.path
          d="M42 88 L43.5 92 L47.5 93.5 L43.5 95 L42 99 L40.5 95 L36.5 93.5 L40.5 92 Z"
          fill="#1f75fe"
          animate={reduceMotion ? { opacity: 0.45 } : { opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </motion.svg>
    </div>
  );
}
