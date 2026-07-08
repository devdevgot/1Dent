import type { ReactNode } from "react";
import { Link } from "wouter";

/*
 * Reference-style home blocks (superapp marketplace):
 *  1. Horizontal scroll row of service tiles — 3D icon on pastel squircle + label
 *  2. Wide promo banner cards — gradient / light, with a 3D icon on the right
 */

const SCROLL_OUTER = "overflow-x-auto px-4 scroll-px-4 pt-1 pb-1";
const SCROLL_INNER = "flex items-start gap-3 w-max";
const SCROLL_STYLE = { scrollbarWidth: "none", msOverflowStyle: "none" } as const;

function HomeScrollRow({
  children,
  snap = false,
}: {
  children: ReactNode;
  snap?: boolean;
}) {
  return (
    <div
      className={`${SCROLL_OUTER}${snap ? " snap-x snap-mandatory" : ""}`}
      style={SCROLL_STYLE}
    >
      <div className={SCROLL_INNER}>
        {children}
        {/* mirrors px-4 so the last item clears the right edge when scrolled */}
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}

type ServiceTile = {
  label: string;
  href: string;
  img: string;
};

const SERVICE_TILES: ServiceTile[] = [
  { label: "Пациенты",   href: "/patients",   img: "/icons/menu/patients.png" },
  { label: "Сотрудники", href: "/users",      img: "/icons/menu/users.png" },
  { label: "Услуги",     href: "/services",   img: "/icons/menu/services.png" },
  { label: "Аналитика",  href: "/analytics",  img: "/icons/menu/analytics.png" },
  { label: "Финансы",    href: "/financials", img: "/icons/menu/financials.png" },
  { label: "ИИ-бот",     href: "/chatbot",    img: "/icons/menu/chatbot.png" },
  { label: "Договоры",   href: "/contract-templates", img: "/icons/menu/contracts.png" },
];

function AllServicesTile() {
  return (
    <Link
      href="/menu"
      className="flex flex-col items-center gap-1.5 shrink-0 w-[68px] group"
    >
      <div className="w-[56px] h-[56px] rounded-[18px] bg-[var(--surface-2)] group-active:bg-[#e8e3d9] transition-colors flex items-center justify-center">
        <div className="grid grid-cols-2 gap-[5px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-[10px] h-[10px] rounded-[3.5px] bg-[var(--text-subtle)]" />
          ))}
        </div>
      </div>
      <span className="w-full text-micro font-semibold text-[var(--text)] text-center leading-[1.2] line-clamp-2">
        Все сервисы
      </span>
    </Link>
  );
}

export function HomeServiceTiles() {
  return (
    <HomeScrollRow>
      <AllServicesTile />
      {SERVICE_TILES.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]"
        >
          <img
            src={tile.img}
            alt=""
            aria-hidden
            className="w-[56px] h-[56px] object-contain drop-shadow-sm"
            draggable={false}
          />
          <span className="w-full text-micro font-semibold text-[var(--text)] text-center leading-[1.2] line-clamp-2">
            {tile.label}
          </span>
        </Link>
      ))}
    </HomeScrollRow>
  );
}

export function HomePromoBanners() {
  return (
    <HomeScrollRow snap>
      {/* Gradient banner — AI chatbot */}
      <Link
        href="/chatbot"
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start scroll-ml-0 bg-gradient-to-br from-[#1f75fe] via-[#3b6ef7] to-[#4f46e5] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-[var(--ds-surface)]/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 min-w-0">
          <p className="text-white font-extrabold text-[17px] leading-[1.2]">
            ИИ-бот<br />WhatsApp
          </p>
          <p className="text-white/70 text-micro font-medium mt-1">
            Отвечает пациентам 24/7
          </p>
        </div>
        <img
          src="/icons/menu/chatbot.png"
          alt=""
          aria-hidden
          className="relative z-10 w-[76px] h-[76px] object-contain drop-shadow-xl shrink-0"
          draggable={false}
        />
      </Link>

      {/* Light banner — analytics */}
      <Link
        href="/analytics"
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-[var(--ds-surface)] border border-[var(--ds-border)] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        <div className="relative z-10 min-w-0">
          <p className="text-[var(--text)] font-extrabold text-[17px] leading-[1.2]">
            Аналитика<br />клиники
          </p>
          <p className="text-[var(--text-secondary)] text-micro font-medium mt-1">
            Выручка, врачи, каналы
          </p>
        </div>
        <img
          src="/icons/menu/analytics.png"
          alt=""
          aria-hidden
          className="relative z-10 w-[76px] h-[76px] object-contain drop-shadow-lg shrink-0"
          draggable={false}
        />
      </Link>

      {/* Light banner — patients */}
      <Link
        href="/patients"
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-[var(--ds-surface)] border border-[var(--ds-border)] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        <div className="relative z-10 min-w-0">
          <p className="text-[var(--text)] font-extrabold text-[17px] leading-[1.2]">
            База<br />пациентов
          </p>
          <p className="text-[var(--text-secondary)] text-micro font-medium mt-1">
            Карточки, воронка, FDI-карта
          </p>
        </div>
        <img
          src="/icons/menu/patients.png"
          alt=""
          aria-hidden
          className="relative z-10 w-[76px] h-[76px] object-contain drop-shadow-lg shrink-0"
          draggable={false}
        />
      </Link>
    </HomeScrollRow>
  );
}
