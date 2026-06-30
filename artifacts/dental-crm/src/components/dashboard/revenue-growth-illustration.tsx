import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** 1Dent design-system palette for illustration */
const INK = "#0f172a";
const BLUE = "#1f75fe";
const MUTED = "#94a3b8";
const BLUE_SOFT = "#e0f2fe";
const WHITE = "#ffffff";
const STROKE = 1;

interface RevenueGrowthIllustrationProps {
  className?: string;
}

function Gear({ cx, cy, r, delay = 0, reduceMotion }: { cx: number; cy: number; r: number; delay?: number; reduceMotion: boolean | null }) {
  return (
    <motion.g
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={{ duration: 18, repeat: Infinity, ease: "linear", delay }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <circle cx={cx} cy={cy} r={r} stroke={MUTED} strokeWidth={STROKE * 0.75} strokeOpacity={0.45} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (r - 1);
        const y1 = cy + Math.sin(rad) * (r - 1);
        const x2 = cx + Math.cos(rad) * (r + 3);
        const y2 = cy + Math.sin(rad) * (r + 3);
        return (
          <line
            key={deg}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={MUTED}
            strokeWidth={STROKE * 0.75}
            strokeOpacity={0.45}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.35} fill={WHITE} stroke={MUTED} strokeWidth={STROKE * 0.5} strokeOpacity={0.35} />
    </motion.g>
  );
}

function ChartPanel({
  x, y, w, h, delay, reduceMotion, children,
}: {
  x: number; y: number; w: number; h: number; delay: number;
  reduceMotion: boolean | null;
  children: ReactNode;
}) {
  return (
    <motion.g
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.g
        animate={reduceMotion ? undefined : { y: [0, -2.5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: delay + 0.8 }}
      >
        <rect x={x} y={y} width={w} height={h} rx={10} fill={WHITE} stroke={INK} strokeWidth={STROKE} strokeOpacity={0.12} />
        <rect x={x} y={y} width={w} height={h} rx={10} fill={BLUE} fillOpacity={0.03} />
        {children}
      </motion.g>
    </motion.g>
  );
}

/** People + analytics panels — flat line art in 1Dent DS colors */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  const reduceMotion = useReducedMotion();
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      <motion.svg
        viewBox="0 0 300 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease }}
      >
        {/* Organic backdrop blob */}
        <motion.path
          d="M 32 128 C 12 92, 22 42, 78 32 C 132 22, 205 28, 255 54 C 288 72, 298 118, 268 152 C 228 188, 142 198, 68 182 C 38 172, 22 156, 32 128 Z"
          fill={BLUE_SOFT}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease }}
          style={{ transformOrigin: "150px 115px" }}
        />

        {/* Ground */}
        <ellipse cx={150} cy={198} rx={88} ry={10} fill={BLUE} fillOpacity={0.08} />

        <Gear cx={248} cy={28} r={9} delay={0} reduceMotion={reduceMotion} />
        <Gear cx={268} cy={118} r={7} delay={2} reduceMotion={reduceMotion} />
        <Gear cx={235} cy={178} r={8} delay={4} reduceMotion={reduceMotion} />

        {/* Panel 1 — line chart */}
        <ChartPanel x={18} y={20} w={104} h={58} delay={0.15} reduceMotion={reduceMotion}>
          {[0, 1, 2].map((i) => {
            const h = 6 + i * 4;
            return (
              <rect key={i} x={30 + i * 22} y={64 - h} width={10} height={h} rx={2} fill={BLUE} fillOpacity={0.15 + i * 0.08} />
            );
          })}
          <motion.path
            d="M 30 60 C 42 52, 52 56, 64 44 S 88 38, 104 30"
            stroke={BLUE}
            strokeWidth={1.25}
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, delay: 0.5, ease: "easeInOut" }}
          />
          {(
            [
              { cx: 30, cy: 60 },
              { cx: 64, cy: 44 },
              { cx: 104, cy: 30 },
            ] as const
          ).map((pt, i) => (
            <motion.circle
              key={i}
              cx={pt.cx} cy={pt.cy} r={2.5}
              fill={WHITE} stroke={BLUE} strokeWidth={1}
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25, delay: 0.7 + i * 0.12 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          ))}
          <line x1={28} y1={64} x2={108} y2={64} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.35} />
        </ChartPanel>

        {/* Panel 2 — donut + lines */}
        <ChartPanel x={200} y={36} w={76} h={52} delay={0.28} reduceMotion={reduceMotion}>
          <circle cx="236" cy="58" r="14" stroke={MUTED} strokeWidth={0.75} strokeOpacity={0.3} />
          <motion.circle
            cx="236" cy="58" r="14"
            stroke={BLUE}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="44 44"
            strokeDashoffset="22"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: 0.55, ease: "easeOut" }}
          />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={210} y={44 + i * 7} width={16 - i * 3} height={2} rx={1} fill={MUTED} fillOpacity={0.35} />
          ))}
        </ChartPanel>

        {/* Panel 3 — bar chart */}
        <ChartPanel x={34} y={142} w={80} h={46} delay={0.4} reduceMotion={reduceMotion}>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.rect
              key={i}
              x={46 + i * 12}
              y={168 - (8 + i * 5)}
              width={7}
              height={8 + i * 5}
              rx={2}
              fill={i === 4 ? BLUE : BLUE}
              fillOpacity={i === 4 ? 0.85 : 0.2 + i * 0.12}
              initial={reduceMotion ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, delay: 0.65 + i * 0.07, ease }}
              style={{ transformOrigin: `${49.5 + i * 12}px 178px`, transformBox: "fill-box" }}
            />
          ))}
          <line x1={42} y1={178} x2={106} y2={178} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.35} />
        </ChartPanel>

        {/* Man — points at line chart */}
        <motion.g
          initial={reduceMotion ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.35, ease }}
        >
          <circle cx="88" cy="108" r="11" fill={WHITE} stroke={INK} strokeWidth={STROKE} strokeOpacity={0.85} />
          <path d="M 82 102 Q 88 96 94 102" stroke={INK} strokeWidth={STROKE} strokeOpacity={0.5} strokeLinecap="round" fill="none" />
          <path
            d="M 72 120 Q 78 118 88 119 L 98 120 Q 104 122 104 132 L 102 152 L 94 152 L 92 132 L 84 132 L 82 152 L 74 152 L 72 132 Z"
            fill={BLUE_SOFT}
            stroke={INK}
            strokeWidth={STROKE}
            strokeOpacity={0.85}
            strokeLinejoin="round"
          />
          <path d="M 74 152 L 72 178 M 82 152 L 84 178" stroke={INK} strokeWidth={STROKE * 1.1} strokeLinecap="round" strokeOpacity={0.9} />
          <motion.path
            d="M 98 124 L 118 88"
            stroke={INK}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeOpacity={0.85}
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.75, ease: "easeOut" }}
          />
          <circle cx="118" cy="88" r="3" fill={BLUE} />
        </motion.g>

        {/* Woman — clipboard */}
        <motion.g
          initial={reduceMotion ? false : { opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.42, ease }}
        >
          <circle cx="218" cy="104" r="11" fill={WHITE} stroke={INK} strokeWidth={STROKE} strokeOpacity={0.85} />
          <path
            d="M 228 98 C 234 96 240 100 238 108 C 236 116 228 118 224 112"
            fill={INK}
            fillOpacity={0.85}
          />
          <path
            d="M 208 118 L 218 117 L 226 120 L 228 132 L 224 148 L 212 148 L 208 132 Z"
            fill={WHITE}
            stroke={INK}
            strokeWidth={STROKE}
            strokeOpacity={0.85}
            strokeLinejoin="round"
          />
          <path
            d="M 210 148 L 208 176 M 222 148 L 224 176"
            stroke={INK}
            strokeWidth={STROKE * 1.1}
            strokeLinecap="round"
            strokeOpacity={0.9}
          />
          <rect x="196" y="122" width="14" height="20" rx="2" fill={WHITE} stroke={INK} strokeWidth={STROKE} strokeOpacity={0.7} />
          <line x1={199} y1={128} x2={207} y2={128} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.5} />
          <line x1={199} y1={133} x2={205} y2={133} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.5} />
          <path d="M 212 176 L 208 182 M 224 176 L 228 182" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" strokeOpacity={0.75} />
        </motion.g>
      </motion.svg>
    </div>
  );
}
