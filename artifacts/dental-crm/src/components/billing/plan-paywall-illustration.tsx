import { cn } from "@/lib/utils";

interface PlanPaywallIllustrationProps {
  className?: string;
}

/** Unlock / subscription illustration in design-system palette. */
export function PlanPaywallIllustration({ className }: PlanPaywallIllustrationProps) {
  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-hidden>
      <div className="absolute inset-2 rounded-full bg-[var(--primary-light)] blur-2xl opacity-90" />
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full"
      >
        <circle cx="100" cy="100" r="88" fill="#f1ede4" />
        <circle cx="100" cy="100" r="72" fill="#ffffff" stroke="#e8e3d9" strokeWidth="1.5" />

        {/* Card */}
        <rect x="44" y="78" width="112" height="72" rx="16" fill="#1f75fe" opacity="0.12" />
        <rect x="50" y="84" width="100" height="60" rx="12" fill="#ffffff" stroke="#e8e3d9" strokeWidth="1.5" />
        <rect x="62" y="98" width="44" height="8" rx="4" fill="#e8e3d9" />
        <rect x="62" y="114" width="28" height="6" rx="3" fill="#f1ede4" />
        <circle cx="128" cy="118" r="10" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
        <text x="128" y="122" textAnchor="middle" fontSize="9" fontWeight="700" fill="#d97706" fontFamily="Manrope, sans-serif">
          ₸
        </text>

        {/* Shield / unlock */}
        <path
          d="M100 42 C84 48 72 50 62 54 V74 C62 92 78 106 100 114 C122 106 138 92 138 74 V54 C128 50 116 48 100 42Z"
          fill="#1f75fe"
          opacity="0.15"
        />
        <path
          d="M100 48 C87 53 77 55 68 58 V74 C68 88 81 100 100 107 C119 100 132 88 132 74 V58 C123 55 113 53 100 48Z"
          fill="#1f75fe"
        />
        <rect x="94" y="68" width="12" height="14" rx="3" fill="#ffffff" />
        <path d="M100 64 V72" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

        {/* Sparkles */}
        <path d="M158 52 L160 58 L166 60 L160 62 L158 68 L156 62 L150 60 L156 58 Z" fill="#16a34a" opacity="0.8" />
        <path d="M44 62 L45.5 66 L49.5 67.5 L45.5 69 L44 73 L42.5 69 L38.5 67.5 L42.5 66 Z" fill="#1f75fe" opacity="0.5" />
      </svg>
    </div>
  );
}
