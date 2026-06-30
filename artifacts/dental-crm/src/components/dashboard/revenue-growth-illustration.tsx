import { cn } from "@/lib/utils";

interface RevenueGrowthIllustrationProps {
  className?: string;
}

/** Motivating empty-state illustration: rising chart + coin sparkle (DS palette). */
export function RevenueGrowthIllustration({ className }: RevenueGrowthIllustrationProps) {
  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      aria-hidden
    >
      <div className="absolute inset-4 rounded-full bg-[var(--primary-light)] blur-2xl opacity-80" />
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full drop-shadow-sm"
      >
        <circle cx="100" cy="100" r="88" fill="#f1ede4" />
        <circle cx="100" cy="100" r="72" fill="#ffffff" stroke="#e8e3d9" strokeWidth="1.5" />

        {/* Soft grid */}
        <line x1="48" y1="132" x2="152" y2="132" stroke="#e8e3d9" strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="112" x2="152" y2="112" stroke="#f1ede4" strokeWidth="1" strokeLinecap="round" />
        <line x1="48" y1="92" x2="152" y2="92" stroke="#f1ede4" strokeWidth="1" strokeLinecap="round" />

        {/* Rising bars */}
        <rect x="58" y="118" width="18" height="14" rx="6" fill="#e8e3d9" />
        <rect x="84" y="104" width="18" height="28" rx="6" fill="#94a3b8" opacity="0.55" />
        <rect x="110" y="88" width="18" height="44" rx="6" fill="#1f75fe" opacity="0.35" />
        <rect x="136" y="72" width="18" height="60" rx="6" fill="#1f75fe" />

        {/* Growth line */}
        <path
          d="M67 126 C78 120, 90 108, 102 98 S126 78, 145 68"
          stroke="#16a34a"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="145" cy="68" r="5" fill="#16a34a" />
        <circle cx="145" cy="68" r="9" fill="#16a34a" opacity="0.2" />

        {/* Coin */}
        <circle cx="62" cy="62" r="18" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
        <text x="62" y="67" textAnchor="middle" fontSize="14" fontWeight="700" fill="#d97706" fontFamily="Manrope, sans-serif">
          ₸
        </text>

        {/* Sparkles */}
        <path d="M158 48 L160 54 L166 56 L160 58 L158 64 L156 58 L150 56 L156 54 Z" fill="#1f75fe" opacity="0.7" />
        <path d="M42 88 L43.5 92 L47.5 93.5 L43.5 95 L42 99 L40.5 95 L36.5 93.5 L40.5 92 Z" fill="#1f75fe" opacity="0.45" />
      </svg>
    </div>
  );
}
