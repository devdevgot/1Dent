import { Link } from "wouter";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-[100dvh] w-full bg-[#faf8f4] font-manrope flex flex-col items-center justify-center px-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm bg-white rounded-2xl border border-[#e8e3d9] shadow-md hover:shadow-lg transition-shadow duration-300 p-6"
      >
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="1Dent" className="w-16 h-16 mb-2.5" />
          <h1 className="text-lg font-bold text-[#0f172a]">1Dent</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Управление клиникой</p>
        </div>
        {children}
      </motion.div>
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
        <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-0.5">{label}</p>
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
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full py-3 rounded-full text-sm font-semibold transition-all duration-200",
        "bg-[#1f75fe] text-white",
        "hover:bg-[#1868eb] hover:shadow-md hover:shadow-[#1f75fe]/25",
        "active:translate-y-px",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-[#1f75fe]",
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
