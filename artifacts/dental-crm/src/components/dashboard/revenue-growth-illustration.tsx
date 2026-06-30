import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Two-color palette: primary accent + neutral structure */
const BLUE = "#1f75fe";
const MUTED = "#94a3b8";

interface RevenueGrowthIllustrationProps {
  className?: string;
}

const BAR_OUTLINES = [
  { x: 54, y: 118, h: 16, delay: 0.2 },
  { x: 78, y: 104, h: 30, delay: 0.32 },
  { x: 102, y: 88, h: 46, delay: 0.44 },
  { x: 126, y: 72, h: 62, delay: 0.56, accent: true },
];

const BASE_Y = 134;
const CURVE =
  "M52 124 C68 118, 82 108, 98 98 C112 88, 128 76, 148 58";

/** Minimal revenue-chart illustration — thin strokes, two DS colors, animated. */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  const reduceMotion = useReducedMotion();
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      <motion.svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease }}
      >
        {/* Outer ring */}
        <motion.circle
          cx="100" cy="100" r="78"
          stroke={MUTED}
          strokeWidth="0.75"
          strokeOpacity="0.35"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />

        {/* Inner ring */}
        <motion.circle
          cx="100" cy="100" r="62"
          stroke={MUTED}
          strokeWidth="0.5"
          strokeOpacity="0.2"
          strokeDasharray="3 5"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        />

        {/* Grid — thin horizontal guides */}
        {[92, 108, 124].map((y, i) => (
          <motion.line
            key={y}
            x1="44" y1={y} x2="156" y2={y}
            stroke={MUTED}
            strokeWidth="0.5"
            strokeOpacity="0.25"
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease: "easeOut" }}
          />
        ))}

        {/* Baseline */}
        <motion.line
          x1="44" y1={BASE_Y} x2="156" y2={BASE_Y}
          stroke={MUTED}
          strokeWidth="0.75"
          strokeOpacity="0.45"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
        />

        {/* Bar outlines — stroke only */}
        {BAR_OUTLINES.map((bar, i) => (
          <motion.rect
            key={i}
            x={bar.x}
            y={bar.y}
            width="14"
            height={bar.h}
            rx="3"
            fill={bar.accent ? BLUE : "none"}
            fillOpacity={bar.accent ? 0.1 : 0}
            stroke={bar.accent ? BLUE : MUTED}
            strokeWidth="0.75"
            strokeOpacity={bar.accent ? 0.9 : 0.4}
            initial={reduceMotion ? false : { scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: bar.delay, ease }}
            style={{ transformOrigin: `${bar.x + 7}px ${BASE_Y}px`, transformBox: "fill-box" }}
          />
        ))}

        {/* Area under curve */}
        <motion.path
          d={`${CURVE} L148 134 L52 134 Z`}
          fill={BLUE}
          fillOpacity="0.07"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.65, ease }}
        />

        {/* Revenue curve */}
        <motion.path
          d={CURVE}
          stroke={BLUE}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeInOut" }}
        />

        {/* Endpoint */}
        <motion.g
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, delay: 1.35, ease: "backOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <motion.g
            animate={reduceMotion ? undefined : { y: [0, -2, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
          >
            <circle cx="148" cy="58" r="7" fill="white" stroke={BLUE} strokeWidth="1" />
            <circle cx="148" cy="58" r="2.5" fill={BLUE} />
          </motion.g>
        </motion.g>

        {/* Currency label — thin typography */}
        <motion.text
          x="148" y="46"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={BLUE}
          fontFamily="Manrope, sans-serif"
          letterSpacing="0.02em"
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 0.85, y: 0 }}
          transition={{ duration: 0.4, delay: 1.5, ease }}
        >
          ₸
        </motion.text>

        {/* Accent tick marks on baseline */}
        {[54, 78, 102, 126].map((x, i) => (
          <motion.line
            key={x}
            x1={x + 7} y1={BASE_Y} x2={x + 7} y2={BASE_Y + 4}
            stroke={MUTED}
            strokeWidth="0.5"
            strokeOpacity="0.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.3 + i * 0.05 }}
          />
        ))}
      </motion.svg>
    </div>
  );
}
