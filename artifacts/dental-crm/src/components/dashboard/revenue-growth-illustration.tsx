import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** 1Dent design-system palette for illustration */
const INK = "#0f172a";
const BLUE = "#1f75fe";
const MUTED = "#94a3b8";
const BLUE_SOFT = "#e0f2fe";
const WHITE = "#ffffff";

interface RevenueGrowthIllustrationProps {
  className?: string;
}

function Gear({
  cx, cy, r, delay = 0, spin,
}: { cx: number; cy: number; r: number; delay?: number; spin: boolean }) {
  return (
    <motion.g
      animate={spin ? { rotate: 360 } : undefined}
      transition={{ duration: 18, repeat: Infinity, ease: "linear", delay }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <circle cx={cx} cy={cy} r={r} stroke={MUTED} strokeWidth={0.75} strokeOpacity={0.45} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={cx + Math.cos(rad) * (r - 1)}
            y1={cy + Math.sin(rad) * (r - 1)}
            x2={cx + Math.cos(rad) * (r + 3)}
            y2={cy + Math.sin(rad) * (r + 3)}
            stroke={MUTED}
            strokeWidth={0.75}
            strokeOpacity={0.45}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.35} fill={WHITE} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.35} />
    </motion.g>
  );
}

function FloatPanel({
  delay, float, children,
}: { delay: number; float: boolean; children: ReactNode }) {
  return (
    <motion.g
      initial={float ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {float ? (
        <motion.g
          animate={{ y: [0, -2.5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: delay + 0.8 }}
        >
          {children}
        </motion.g>
      ) : (
        children
      )}
    </motion.g>
  );
}

/** People + analytics scene — flat line art in 1Dent DS colors */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      <svg
        viewBox="0 0 300 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {/* Organic backdrop */}
        <path
          d="M 32 128 C 12 92, 22 42, 78 32 C 132 22, 205 28, 255 54 C 288 72, 298 118, 268 152 C 228 188, 142 198, 68 182 C 38 172, 22 156, 32 128 Z"
          fill={BLUE_SOFT}
          opacity={0.7}
        />

        {/* Ground */}
        <ellipse cx={150} cy={198} rx={92} ry={11} fill={BLUE} fillOpacity={0.08} />

        <Gear cx={252} cy={30} r={9} delay={0} spin={animate} />
        <Gear cx={272} cy={120} r={6.5} delay={2} spin={animate} />
        <Gear cx={236} cy={180} r={8} delay={4} spin={animate} />

        {/* ── Panel 1 — line chart (top-left) ── */}
        <FloatPanel delay={0.15} float={animate}>
          <rect x={18} y={18} width={108} height={60} rx={10} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.12} />
          <rect x={18} y={18} width={108} height={60} rx={10} fill={BLUE} fillOpacity={0.03} />
          {[0, 1, 2].map((i) => {
            const h = 8 + i * 5;
            return <rect key={i} x={32 + i * 24} y={64 - h} width={11} height={h} rx={2} fill={BLUE} fillOpacity={0.15 + i * 0.1} />;
          })}
          <motion.path
            d="M 32 58 C 46 50, 56 54, 70 42 S 98 34, 112 28"
            stroke={BLUE}
            strokeWidth={1.5}
            strokeLinecap="round"
            initial={animate ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, delay: 0.5, ease: "easeInOut" }}
          />
          <line x1={28} y1={64} x2={116} y2={64} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.35} />
        </FloatPanel>

        {/* ── Panel 2 — donut (top-right) ── */}
        <FloatPanel delay={0.28} float={animate}>
          <rect x={196} y={34} width={82} height={56} rx={10} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.12} />
          <rect x={196} y={34} width={82} height={56} rx={10} fill={BLUE} fillOpacity={0.03} />
          <circle cx={228} cy={62} r={15} stroke={MUTED} strokeWidth={3} strokeOpacity={0.25} />
          <motion.circle
            cx={228}
            cy={62}
            r={15}
            stroke={BLUE}
            strokeWidth={3}
            strokeLinecap="round"
            transform="rotate(-90 228 62)"
            initial={animate ? { pathLength: 0 } : { pathLength: 0.68 }}
            animate={{ pathLength: 0.68 }}
            transition={{ duration: 0.9, delay: 0.55, ease: "easeOut" }}
          />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={250} y={50 + i * 8} width={18 - i * 4} height={2.5} rx={1.25} fill={MUTED} fillOpacity={0.4} />
          ))}
        </FloatPanel>

        {/* ── Panel 3 — bar chart (bottom-left) ── */}
        <FloatPanel delay={0.4} float={animate}>
          <rect x={30} y={140} width={86} height={50} rx={10} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.12} />
          <rect x={30} y={140} width={86} height={50} rx={10} fill={BLUE} fillOpacity={0.03} />
          {[0, 1, 2, 3, 4].map((i) => {
            const h = 8 + i * 5;
            return (
              <motion.rect
                key={i}
                x={44 + i * 13}
                y={180 - h}
                width={8}
                height={h}
                rx={2}
                fill={BLUE}
                fillOpacity={i === 4 ? 0.85 : 0.2 + i * 0.12}
                initial={animate ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: 0.65 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}
              />
            );
          })}
          <line x1={40} y1={180} x2={110} y2={180} stroke={MUTED} strokeWidth={0.5} strokeOpacity={0.35} />
        </FloatPanel>

        {/* ── Man — points at chart ── */}
        <motion.g
          initial={animate ? { opacity: 0, x: -6 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* head */}
          <circle cx={92} cy={110} r={11} fill={WHITE} stroke={INK} strokeWidth={1.1} strokeOpacity={0.9} />
          <path d="M 86 105 Q 92 99 98 105" stroke={INK} strokeWidth={1} strokeOpacity={0.5} strokeLinecap="round" />
          {/* body */}
          <path
            d="M 78 124 Q 84 121 92 122 L 100 123 Q 106 125 106 135 L 104 156 L 96 156 L 94 136 L 88 136 L 86 156 L 78 156 L 76 135 Q 76 127 78 124 Z"
            fill={BLUE_SOFT}
            stroke={INK}
            strokeWidth={1.1}
            strokeOpacity={0.9}
            strokeLinejoin="round"
          />
          {/* legs */}
          <path d="M 80 156 L 78 182 M 90 156 L 92 182" stroke={INK} strokeWidth={1.3} strokeLinecap="round" strokeOpacity={0.9} />
          {/* feet */}
          <path d="M 78 182 L 73 184 M 92 182 L 97 184" stroke={INK} strokeWidth={1.3} strokeLinecap="round" strokeOpacity={0.9} />
          {/* pointing arm */}
          <path d="M 102 128 L 120 96" stroke={INK} strokeWidth={1.1} strokeLinecap="round" strokeOpacity={0.9} />
          <circle cx={120} cy={96} r={2.5} fill={BLUE} />
        </motion.g>

        {/* ── Woman — clipboard ── */}
        <motion.g
          initial={animate ? { opacity: 0, x: 6 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* head */}
          <circle cx={206} cy={112} r={11} fill={WHITE} stroke={INK} strokeWidth={1.1} strokeOpacity={0.9} />
          {/* hair */}
          <path d="M 216 107 C 222 105 227 110 224 118 C 222 123 217 124 214 120" fill={INK} fillOpacity={0.85} />
          {/* body */}
          <path
            d="M 196 126 Q 202 123 206 124 L 214 125 Q 220 127 220 137 L 217 158 L 209 158 L 207 137 L 203 137 L 200 158 L 193 158 L 191 137 Q 191 129 196 126 Z"
            fill={WHITE}
            stroke={INK}
            strokeWidth={1.1}
            strokeOpacity={0.9}
            strokeLinejoin="round"
          />
          {/* legs */}
          <path d="M 197 158 L 195 182 M 211 158 L 213 182" stroke={INK} strokeWidth={1.3} strokeLinecap="round" strokeOpacity={0.9} />
          <path d="M 195 182 L 190 184 M 213 182 L 218 184" stroke={INK} strokeWidth={1.3} strokeLinecap="round" strokeOpacity={0.9} />
          {/* clipboard */}
          <rect x={216} y={128} width={15} height={20} rx={2} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.8} />
          <rect x={221} y={126} width={5} height={3} rx={1} fill={BLUE} fillOpacity={0.7} />
          <line x1={219} y1={134} x2={228} y2={134} stroke={MUTED} strokeWidth={0.75} strokeOpacity={0.5} />
          <line x1={219} y1={138} x2={226} y2={138} stroke={MUTED} strokeWidth={0.75} strokeOpacity={0.5} />
          <line x1={219} y1={142} x2={228} y2={142} stroke={MUTED} strokeWidth={0.75} strokeOpacity={0.5} />
          {/* arm to clipboard */}
          <path d="M 213 130 L 218 136" stroke={INK} strokeWidth={1.1} strokeLinecap="round" strokeOpacity={0.9} />
        </motion.g>
      </svg>
    </div>
  );
}
