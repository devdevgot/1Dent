import { Link } from "wouter";

/*
 * Reference-style home blocks (superapp marketplace):
 *  1. Horizontal scroll row of service tiles — 3D icon on pastel squircle + label
 *  2. Wide promo banner cards — gradient / light, with a 3D icon on the right
 */

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
      <div className="w-[56px] h-[56px] rounded-[18px] bg-[#f1ede4] group-active:bg-[#e8e3d9] transition-colors flex items-center justify-center">
        <div className="grid grid-cols-2 gap-[5px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-[10px] h-[10px] rounded-[3.5px] bg-[#94a3b8]" />
          ))}
        </div>
      </div>
      <span className="w-full text-[11px] font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2">
        Все сервисы
      </span>
    </Link>
  );
}

export function HomeServiceTiles() {
  return (
    <div
      className="flex items-start gap-3 overflow-x-auto px-4 pt-1 pb-1"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
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
          <span className="w-full text-[11px] font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2">
            {tile.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function HomePromoBanners() {
  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 snap-x snap-mandatory"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {/* Gradient banner — AI chatbot */}
      <Link
        href="/chatbot"
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-gradient-to-br from-[#1f75fe] via-[#3b6ef7] to-[#4f46e5] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        {/* decorative glow */}
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 min-w-0">
          <p className="text-white font-extrabold text-[17px] leading-[1.2]">
            ИИ-бот<br />WhatsApp
          </p>
          <p className="text-white/70 text-[11px] font-medium mt-1">
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
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-white border border-[#e8e3d9] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        <div className="relative z-10 min-w-0">
          <p className="text-[#0f172a] font-extrabold text-[17px] leading-[1.2]">
            Аналитика<br />клиники
          </p>
          <p className="text-[#64748b] text-[11px] font-medium mt-1">
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
        className="relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-white border border-[#e8e3d9] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform"
      >
        <div className="relative z-10 min-w-0">
          <p className="text-[#0f172a] font-extrabold text-[17px] leading-[1.2]">
            База<br />пациентов
          </p>
          <p className="text-[#64748b] text-[11px] font-medium mt-1">
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
    </div>
  );
}
