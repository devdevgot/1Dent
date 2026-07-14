import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  MENU_SERVICES,
  getHomeServiceSlugsForRole,
} from "@/lib/menu-services";
import { useOpenMenuService } from "@/components/layout/menu-service-overlay";
import { useAuthStore } from "@/hooks/use-auth";
import { isDoctorRole } from "@/lib/role-groups";

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

function AllServicesTile() {
  return (
    <Link
      href="/menu"
      className="flex flex-col items-center gap-1.5 shrink-0 w-[68px] group"
    >
      <div className="w-[56px] h-[56px] rounded-[18px] bg-[#f1ede4] group-active:bg-[#e8e3d9] transition-colors flex items-center justify-center">
        <div className="grid grid-cols-2 gap-[5px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-[10px] h-[10px] rounded-[3.5px] bg-[var(--text-subtle)]" />
          ))}
        </div>
      </div>
      <span className="w-full text-xs font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2">
        Все сервисы
      </span>
    </Link>
  );
}

type PromoBannerProps = {
  slug: string;
  title: ReactNode;
  subtitle: string;
  img: string;
  variant?: "gradient" | "light";
};

function PromoBanner({ slug, title, subtitle, img, variant = "light" }: PromoBannerProps) {
  const openService = useOpenMenuService();
  const isGradient = variant === "gradient";

  return (
    <button
      type="button"
      onClick={() => openService(slug)}
      className={
        isGradient
          ? "relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start scroll-ml-0 bg-gradient-to-br from-[#1f75fe] via-[#3b6ef7] to-[#4f46e5] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform text-left"
          : "relative shrink-0 w-[280px] h-[108px] rounded-3xl overflow-hidden snap-start bg-white border border-[#e8e3d9] flex items-center justify-between pl-5 pr-3 active:scale-[0.98] transition-transform text-left"
      }
    >
      {isGradient && (
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      )}
      <div className="relative z-10 min-w-0">
        <p
          className={
            isGradient
              ? "text-white font-extrabold text-[17px] leading-[1.2]"
              : "text-[#0f172a] font-extrabold text-[17px] leading-[1.2]"
          }
        >
          {title}
        </p>
        <p
          className={
            isGradient
              ? "text-white/70 text-xs font-medium mt-1"
              : "text-[#64748b] text-xs font-medium mt-1"
          }
        >
          {subtitle}
        </p>
      </div>
      <img
        src={img}
        alt=""
        aria-hidden
        className={
          isGradient
            ? "relative z-10 w-[76px] h-[76px] object-contain drop-shadow-xl shrink-0"
            : "relative z-10 w-[76px] h-[76px] object-contain drop-shadow-lg shrink-0"
        }
        draggable={false}
      />
    </button>
  );
}

export function HomeServiceTiles() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const openService = useOpenMenuService();

  const homeTiles = getHomeServiceSlugsForRole(user?.role)
    .map((slug) => {
      const service = MENU_SERVICES.find((s) => s.slug === slug);
      if (!service) return null;
      return {
        slug,
        label: t(service.nameKey),
        img: service.img,
      };
    })
    .filter(Boolean) as { slug: string; label: string; img: string }[];

  return (
    <HomeScrollRow>
      <AllServicesTile />
      {homeTiles.map((tile) => (
        <button
          key={tile.slug}
          type="button"
          onClick={() => openService(tile.slug)}
          className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]"
        >
          <img
            src={tile.img}
            alt=""
            aria-hidden
            className="w-[56px] h-[56px] object-contain drop-shadow-sm"
            draggable={false}
          />
          <span className="w-full text-xs font-semibold text-[#0f172a] text-center leading-[1.2] line-clamp-2">
            {tile.label}
          </span>
        </button>
      ))}
    </HomeScrollRow>
  );
}

function OwnerPromoBanners() {
  return (
    <HomeScrollRow snap>
      <PromoBanner
        slug="chatbot"
        variant="gradient"
        title={
          <>
            ИИ-бот
            <br />
            WhatsApp
          </>
        }
        subtitle="Отвечает пациентам 24/7"
        img="/icons/menu/chatbot.png"
      />
      <PromoBanner
        slug="analytics"
        title={
          <>
            Аналитика
            <br />
            клиники
          </>
        }
        subtitle="Выручка, врачи, каналы"
        img="/icons/menu/analytics.png"
      />
      <PromoBanner
        slug="patients"
        title={
          <>
            База
            <br />
            пациентов
          </>
        }
        subtitle="Карточки, воронка, FDI-карта"
        img="/icons/menu/patients.png"
      />
    </HomeScrollRow>
  );
}

function ClinicalPromoBanners({ role }: { role: string | undefined }) {
  const isDoctor = isDoctorRole(role);

  return (
    <HomeScrollRow snap>
      <PromoBanner
        slug="schedule"
        variant="gradient"
        title={
          isDoctor ? (
            <>
              Моё
              <br />
              расписание
            </>
          ) : (
            <>
              Расписание
              <br />
              клиники
            </>
          )
        }
        subtitle="Записи и процедуры на сегодня"
        img="/icons/menu/schedule.png"
      />
      <PromoBanner
        slug="patients"
        title={
          <>
            База
            <br />
            пациентов
          </>
        }
        subtitle="Карточки, воронка, FDI-карта"
        img="/icons/menu/patients.png"
      />
      <PromoBanner
        slug="doctor-analytics"
        title={
          <>
            Моя
            <br />
            аналитика
          </>
        }
        subtitle="Выручка и показатели"
        img="/icons/menu/analytics.png"
      />
    </HomeScrollRow>
  );
}

export function HomePromoBanners() {
  const { user } = useAuthStore();
  const role = user?.role;

  if (role === "owner") {
    return <OwnerPromoBanners />;
  }

  return <ClinicalPromoBanners role={role} />;
}
