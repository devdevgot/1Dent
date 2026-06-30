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
      transition={{ duration: 20, repeat: Infinity, ease: "linear", delay }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <circle cx={cx} cy={cy} r={r} stroke={MUTED} strokeWidth={1} strokeOpacity={0.35} fill="none" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={cx + Math.cos(rad) * (r - 1.5)}
            y1={cy + Math.sin(rad) * (r - 1.5)}
            x2={cx + Math.cos(rad) * (r + 3.5)}
            y2={cy + Math.sin(rad) * (r + 3.5)}
            stroke={MUTED}
            strokeWidth={1}
            strokeOpacity={0.35}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.38} fill={WHITE} stroke={MUTED} strokeWidth={0.6} strokeOpacity={0.3} />
    </motion.g>
  );
}

function FloatPanel({
  delay, float, children,
}: { delay: number; float: boolean; children: ReactNode }) {
  if (!float) return <g>{children}</g>;

  return (
    <motion.g
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: [0, -3, 0] }}
      transition={{
        opacity: { duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] },
        y: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 },
      }}
    >
      {children}
    </motion.g>
  );
}

function PanelFrame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.1} />
      <rect x={x} y={y} width={w} height={h} rx={10} fill={BLUE} fillOpacity={0.04} />
    </>
  );
}

/** People + analytics scene — flat line art in 1Dent DS colors */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      <svg
        viewBox="0 0 320 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        role="img"
      >
        {/* Organic backdrop */}
        <path
          d="M 36 150 C 14 108, 28 48, 96 36 C 158 24, 248 34, 284 72 C 308 98, 312 148, 276 182 C 232 220, 132 228, 58 208 C 32 198, 18 178, 36 150 Z"
          fill={BLUE_SOFT}
          opacity={0.75}
        />

        <ellipse cx={160} cy={214} rx={98} ry={12} fill={BLUE} fillOpacity={0.08} />

        <Gear cx={278} cy={36} r={9} delay={0} spin={animate} />
        <Gear cx={296} cy={128} r={6.5} delay={2.5} spin={animate} />
        <Gear cx={262} cy={196} r={7.5} delay={4.5} spin={animate} />

        {/* ── Panel 1 — line chart (top-left) ── */}
        <FloatPanel delay={0.1} float={animate}>
          <g>
            <PanelFrame x={22} y={22} w={104} h={58} />
            <line x1={34} y1={68} x2={114} y2={68} stroke={MUTED} strokeWidth={0.6} strokeOpacity={0.35} />
            <motion.path
              d="M 36 62 C 50 54, 62 58, 76 48 S 96 40, 108 36"
              stroke={BLUE}
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
              initial={animate ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.85, delay: 0.45, ease: "easeInOut" }}
            />
            {[0, 1, 2].map((i) => {
              const h = 6 + i * 4;
              return (
                <rect
                  key={i}
                  x={40 + i * 22}
                  y={68 - h}
                  width={10}
                  height={h}
                  rx={2}
                  fill={BLUE}
                  fillOpacity={0.14 + i * 0.08}
                />
              );
            })}
          </g>
        </FloatPanel>

        {/* ── Panel 2 — donut (top-right) ── */}
        <FloatPanel delay={0.22} float={animate}>
          <g>
            <PanelFrame x={194} y={28} w={88} h={56} />
            <circle cx={228} cy={56} r={14} stroke={MUTED} strokeWidth={3.5} strokeOpacity={0.22} fill="none" />
            <motion.circle
              cx={228}
              cy={56}
              r={14}
              stroke={BLUE}
              strokeWidth={3.5}
              strokeLinecap="round"
              fill="none"
              transform="rotate(-90 228 56)"
              initial={animate ? { pathLength: 0 } : { pathLength: 0.65 }}
              animate={{ pathLength: 0.65 }}
              transition={{ duration: 0.85, delay: 0.5, ease: "easeOut" }}
            />
            {[0, 1, 2].map((i) => (
              <rect key={i} x={252} y={44 + i * 9} width={20 - i * 3} height={3} rx={1.5} fill={MUTED} fillOpacity={0.38} />
            ))}
          </g>
        </FloatPanel>

        {/* ── Panel 3 — bar chart (bottom-left, above characters) ── */}
        <FloatPanel delay={0.34} float={animate}>
          <g>
            <PanelFrame x={28} y={108} w={90} h={48} />
            <line x1={38} y1={146} x2={108} y2={146} stroke={MUTED} strokeWidth={0.6} strokeOpacity={0.35} />
            {[0, 1, 2, 3, 4].map((i) => {
              const h = 7 + i * 4;
              const barY = 146 - h;
              return (
                <motion.rect
                  key={i}
                  x={44 + i * 12}
                  width={8}
                  height={h}
                  rx={2}
                  fill={BLUE}
                  fillOpacity={i === 4 ? 0.9 : 0.22 + i * 0.1}
                  initial={animate ? { y: 146, height: 0 } : false}
                  animate={{ y: barY, height: h }}
                  transition={{ duration: 0.38, delay: 0.6 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </g>
        </FloatPanel>

        {/* ── Man — points at chart ── */}
        <motion.g
          initial={animate ? { opacity: 0, x: -8 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <circle cx={108} cy={168} r={12} fill={WHITE} stroke={INK} strokeWidth={1.2} strokeOpacity={0.88} />
          <path d="M 101 162 Q 108 156 115 162" stroke={INK} strokeWidth={1} strokeOpacity={0.45} strokeLinecap="round" fill="none" />
          <path
            d="M 94 182 Q 100 178 108 179 L 116 180 Q 122 182 122 192 L 120 210 L 111 210 L 109 192 L 105 192 L 103 210 L 94 210 L 92 192 Q 92 186 94 182 Z"
            fill={BLUE_SOFT}
            stroke={INK}
            strokeWidth={1.2}
            strokeOpacity={0.88}
            strokeLinejoin="round"
          />
          <path
            d="M 96 210 L 94 228 M 108 210 L 110 228"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeOpacity={0.88}
          />
          <path
            d="M 94 228 L 88 230 M 110 228 L 116 230"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeOpacity={0.88}
          />
          <path d="M 118 186 L 138 152" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.88} />
          <circle cx={138} cy={152} r={3} fill={BLUE} />
        </motion.g>

        {/* ── Woman — clipboard ── */}
        <motion.g
          initial={animate ? { opacity: 0, x: 8 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <circle cx={212} cy={170} r={12} fill={WHITE} stroke={INK} strokeWidth={1.2} strokeOpacity={0.88} />
          <path
            d="M 222 164 C 228 162 234 166 232 174 C 230 180 224 182 220 178"
            fill={INK}
            fillOpacity={0.82}
          />
          <path
            d="M 200 184 Q 206 180 212 181 L 220 182 Q 226 184 226 194 L 223 212 L 214 212 L 212 194 L 208 194 L 205 212 L 197 212 L 195 194 Q 195 188 200 184 Z"
            fill={WHITE}
            stroke={INK}
            strokeWidth={1.2}
            strokeOpacity={0.88}
            strokeLinejoin="round"
          />
          <path
            d="M 199 212 L 197 228 M 211 212 L 213 228"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeOpacity={0.88}
          />
          <path
            d="M 197 228 L 192 230 M 213 228 L 218 230"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeOpacity={0.88}
          />
          <rect x={222} y={186} width={16} height={22} rx={2.5} fill={WHITE} stroke={INK} strokeWidth={1} strokeOpacity={0.75} />
          <rect x={227} y={184} width={6} height={3.5} rx={1} fill={BLUE} fillOpacity={0.75} />
          <line x1={225} y1={192} x2={235} y2={192} stroke={MUTED} strokeWidth={0.8} strokeOpacity={0.5} />
          <line x1={225} y1={196} x2={233} y2={196} stroke={MUTED} strokeWidth={0.8} strokeOpacity={0.5} />
          <line x1={225} y1={200} x2={235} y2={200} stroke={MUTED} strokeWidth={0.8} strokeOpacity={0.5} />
          <path d="M 218 188 L 223 194" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.88} />
        </motion.g>
      </svg>
    </div>
  );
}
