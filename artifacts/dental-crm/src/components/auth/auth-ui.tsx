import { Link } from "wouter";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type AuthHeroVariant = "auth" | "register";

const REGISTER_FEATURES = ["feature1", "feature2", "feature3", "feature4"] as const;

export function AuthPageShell({
  children,
  wide = false,
  hero = "auth",
}: {
  children: ReactNode;
  wide?: boolean;
  hero?: AuthHeroVariant;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-[100dvh] w-full bg-[#faf8f4] font-manrope flex">
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden bg-[#0f172a] text-white">
        <img
          src="/images/auth-bg.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a]/80 via-[#0f172a]/40 to-[#1f75fe]/30" />
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <img src="/logo.png" alt="1Dent" className="w-11 h-11 rounded-xl" />
              <div>
                <p className="text-lg font-bold leading-tight">1Dent</p>
                <p className="text-xs text-white/60">Управление клиникой</p>
              </div>
            </div>
            <h1 className="text-3xl xl:text-4xl font-extrabold leading-tight mb-4">
              {t(`${hero}.heroTitle`)}
            </h1>
            {hero === "auth" && (
              <p className="text-sm text-white/70 leading-relaxed max-w-md">
                {t("auth.heroSubtitle")}
              </p>
            )}
            {hero === "register" && (
              <ul className="space-y-3 mt-6">
                {REGISTER_FEATURES.map((key) => (
                  <li key={key} className="flex items-start gap-2.5 text-sm text-white/80">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1f75fe] shrink-0" />
                    {t(`register.${key}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} 1Dent</p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 overflow-y-auto">
        <div className="lg:hidden flex flex-col items-center mb-6">
          <img src="/logo.png" alt="1Dent" className="w-14 h-14 mb-2" />
          <p className="text-base font-bold text-[#0f172a]">1Dent</p>
          <p className="text-xs text-[#94a3b8]">Управление клиникой</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "w-full bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6 sm:p-7",
            wide ? "max-w-lg" : "max-w-md",
          )}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          "w-full px-3.5 py-2.5 rounded-xl border bg-white transition-all duration-200",
          "hover:border-[#cfc9bd]",
          error
            ? "border-[#dc2626] bg-[#fef2f2]"
            : "border-[#e8e3d9] focus-within:border-[#1f75fe] focus-within:ring-2 focus-within:ring-[#1f75fe]/15 focus-within:hover:border-[#1f75fe]",
        )}
      >
        <p className="text-xs font-medium text-[#64748b] mb-0.5">{label}</p>
        {children}
      </div>
      {error && <p className="text-xs text-[#dc2626] font-medium mt-1 px-1">{error}</p>}
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  variant?: "primary" | "whatsapp";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full py-3 rounded-full text-sm font-semibold transition-all duration-200",
        "active:translate-y-px",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none",
        variant === "whatsapp"
          ? "bg-[#128C7E] text-white hover:bg-[#0f7a6e] hover:shadow-md hover:shadow-[#128C7E]/20 disabled:hover:bg-[#128C7E]"
          : "bg-[#1f75fe] text-white hover:bg-[#1868eb] hover:shadow-md hover:shadow-[#1f75fe]/25 disabled:hover:bg-[#1f75fe]",
      )}
    >
      {children}
    </button>
  );
}

export function AuthGhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full py-2.5 rounded-full text-sm font-medium transition-colors duration-200",
        "text-[#64748b] hover:text-[#0f172a] hover:bg-[#faf8f4]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm text-[#94a3b8] hover:text-[#64748b] transition-colors duration-200"
    >
      {children}
    </Link>
  );
}

export function AuthDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-[#f1ede4]" />
      {label && <span className="text-xs text-[#94a3b8]">{label}</span>}
      <div className="flex-1 h-px bg-[#f1ede4]" />
    </div>
  );
}

export function WhatsappBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#25D366]/10 text-[#128C7E] text-xs font-semibold mb-4">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      WhatsApp
    </div>
  );
}
