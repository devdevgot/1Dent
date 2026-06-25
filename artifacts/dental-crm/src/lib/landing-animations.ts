// Unified animation presets for 1Dent landing
// Apple/Linear-style easing — GPU-accelerated, no jank

export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT = [0, 0, 0.2, 1] as const;

// Basic fadeUp for whileInView — small distance, early trigger
export const fadeUp = (delay = 0, distance = 16) => ({
  initial: { opacity: 0, y: distance },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.55, delay, ease: EASE },
  style: { willChange: "transform, opacity" },
});

// Simple fade (no movement)
export const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5, delay, ease: EASE_OUT },
});

// Slide in from left
export const slideLeft = (delay = 0) => ({
  initial: { opacity: 0, x: -20 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.55, delay, ease: EASE },
  style: { willChange: "transform, opacity" },
});

// ── Correct stagger pattern ──────────────────────────────────────────────────
// Parent: initial="hidden" whileInView="visible" + these variants
export const staggerParentVariants = (stagger = 0.09) => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger },
  },
});

// Child card — used inside stagger parent
export const staggerChildVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};
