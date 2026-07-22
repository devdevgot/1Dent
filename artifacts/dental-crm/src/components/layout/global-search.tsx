import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListPatients,
  useListProcedures,
  useListUsers,
} from "@workspace/api-client-react";
import {
  Search,
  X,
  Users,
  Stethoscope,
  LayoutDashboard,
  ChevronRight,
  Contact,
  Calendar,
  BarChart3,
  Wallet,
  Bot,
  UserCog,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { maskIIN } from "@workspace/api-zod";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useOpenMenuService } from "@/components/layout/menu-service-overlay";
import { hrefToServiceSlug } from "@/lib/menu-services";

interface SearchResult {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
  patientId?: string;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

interface ResultGroup {
  category: string;
  results: SearchResult[];
}

const PAGE_ITEMS: {
  label: string;
  href: string;
  roles: string[];
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}[] = [
  { label: "Дашборд",    href: "dashboard",       roles: ["owner","admin","doctor","accountant","warehouse"], Icon: LayoutDashboard, iconBg: "bg-[var(--primary-light)]",   iconColor: "text-[#1f75fe]" },
  { label: "Пациенты",   href: "/patients",                  roles: ["owner","admin","doctor","accountant"],        Icon: Users,           iconBg: "bg-[var(--info-light)]",    iconColor: "text-[var(--info)]" },
  { label: "Расписание", href: "/schedule",        roles: ["owner","doctor","assistant","nurse"],           Icon: Calendar,        iconBg: "bg-[var(--warning-light)]", iconColor: "text-[#d97706]" },
  { label: "Аналитика",  href: "/analytics",       roles: ["owner"],                                          Icon: BarChart3,       iconBg: "bg-[var(--success-light)]",   iconColor: "text-[#16a34a]" },
  { label: "Моя аналитика", href: "/doctor-analytics", roles: ["doctor", "admin", "accountant", "warehouse", "assistant", "nurse"], Icon: BarChart3,       iconBg: "bg-[var(--success-light)]",   iconColor: "text-[#16a34a]" },
  { label: "Финансы",    href: "/financials",      roles: ["owner","accountant"],                             Icon: Wallet,          iconBg: "bg-[var(--warning-light)]",iconColor: "text-[#d97706]" },
  { label: "WhatsApp",   href: "/chat",            roles: ["owner","admin","doctor"],                         Icon: FaWhatsapp,      iconBg: "bg-[var(--success-light)]",  iconColor: "text-[#16a34a]" },
  { label: "Сотрудники", href: "/users",           roles: ["owner"],                                          Icon: Contact,         iconBg: "bg-[#f1ede4]",  iconColor: "text-[#64748b]" },
  { label: "Чат-бот",   href: "/chatbot",          roles: ["owner"],                                          Icon: Bot,             iconBg: "bg-[var(--primary-light)]", iconColor: "text-[#1f75fe]" },
];

const ROLE_DASHBOARD: Record<string, string> = {
  owner:      "/dashboard",
  admin:      "/dashboard/admin",
  doctor:     "/dashboard/doctor",
  accountant: "/dashboard/accountant",
  warehouse:  "/dashboard/warehouse",
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matches(text: string | null | undefined, query: string) {
  if (!text) return false;
  return normalize(text).includes(normalize(query));
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

function matchesIin(iin: string | null | undefined, query: string) {
  const qDigits = digitsOnly(query);
  if (!qDigits || !iin) return false;
  return digitsOnly(iin).includes(qDigits);
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const openService = useOpenMenuService();
  const [panelBox, setPanelBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const role = user?.role ?? "";
  const dashboardHref = ROLE_DASHBOARD[role] ?? "/dashboard";

  const canSeePatients  = ["owner","admin","doctor"].includes(role);
  const canSeeUsers     = ["owner","admin"].includes(role);
  const canSeeProcedures= ["owner","admin","accountant"].includes(role);

  const { data: patientsData }   = useListPatients({ query: { enabled: canSeePatients } });
  const { data: usersData }      = useListUsers({ query: { enabled: canSeeUsers } });
  const { data: proceduresData } = useListProcedures({ query: { enabled: canSeeProcedures } });

  const groups = useMemo<ResultGroup[]>(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    const result: ResultGroup[] = [];

    // Pages
    const pages = PAGE_ITEMS
      .filter((p) => p.roles.includes(role) && matches(p.label, q))
      .map((p) => ({
        id: p.href,
        label: p.label,
        href: p.href === "dashboard" ? dashboardHref : p.href,
        Icon: p.Icon,
        iconBg: p.iconBg,
        iconColor: p.iconColor,
      }));
    if (pages.length) result.push({ category: "Страницы", results: pages });

    // Patients
    if (canSeePatients) {
      const list = (patientsData as {
        data?: { patients?: { id: string; name: string; phone: string; iin?: string | null }[] };
      })?.data?.patients ?? [];
      const patients = list
        .filter((p) => matches(p.name, q) || matches(p.phone, q) || matchesIin(p.iin, q))
        .slice(0, 8)
        .map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: [p.phone, p.iin ? `ИИН ${maskIIN(p.iin)}` : null].filter(Boolean).join(" · "),
          href: "/patients",
          patientId: p.id,
          Icon: Users,
          iconBg: "bg-[var(--info-light)]",
          iconColor: "text-[var(--info)]",
        }));
      if (patients.length) result.push({ category: "Пациенты", results: patients });
    }

    // Procedures
    if (canSeeProcedures) {
      const list = (proceduresData as { data?: { procedures?: { id: string; name: string; status: string }[] } })?.data?.procedures ?? [];
      const procs = list
        .filter((p) => matches(p.name, q))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: p.status,
          href: "/procedures",
          Icon: Stethoscope,
          iconBg: "bg-[var(--success-light)]",
          iconColor: "text-[#16a34a]",
        }));
      if (procs.length) result.push({ category: "Процедуры", results: procs });
    }

    // Users/Staff
    if (canSeeUsers) {
      const list = (usersData as { data?: { users?: { id: string; name: string; role: string; email: string }[] } })?.data?.users ?? [];
      const staff = list
        .filter((u) => matches(u.name, q) || matches(u.email, q) || matches(u.role, q))
        .slice(0, 5)
        .map((u) => ({
          id: u.id,
          label: u.name,
          subtitle: `${u.role} · ${u.email}`,
          href: "/users",
          Icon: UserCog,
          iconBg: "bg-[#f1ede4]",
          iconColor: "text-[#64748b]",
        }));
      if (staff.length) result.push({ category: "Сотрудники", results: staff });
    }

    return result;
  }, [query, role, patientsData, usersData, proceduresData, canSeePatients, canSeeUsers, canSeeProcedures, dashboardHref]);

  const hasResults = groups.length > 0;
  const isEmpty = query.trim().length > 0 && !hasResults;
  const showPanel = focused && query.trim().length > 0;

  useLayoutEffect(() => {
    if (!showPanel) {
      setPanelBox(null);
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setPanelBox({
        top: r.bottom + 6,
        left: r.left,
        width: r.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showPanel, query, groups.length]);

  useEffect(() => {
    if (!showPanel && !focused) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFocused(false);
        inputRef.current?.blur();
      }
    }

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setFocused(false);
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [showPanel, focused]);

  function navigate(href: string, patientId?: string) {
    setFocused(false);
    setQuery("");

    // Open menu services as home overlays so closing returns to the searcher
    // (not a full-page route like /patients?view=kanban).
    if (patientId) {
      setSelectedPatientId(patientId);
      openService("patients");
      return;
    }

    const pathOnly = href.split("?")[0];
    const slug = hrefToServiceSlug(pathOnly);
    if (slug) {
      openService(slug);
      return;
    }

    setLocation(href);
  }

  const placeholder = t("patients.searchPlaceholder", {
    defaultValue: "Имя, телефон, ИИН",
  });

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      {/* Inline search — same interaction model as Patients */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--text-subtle)" }}
        />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          title={placeholder}
          className={cn(
            "global-search-input w-full rounded-xl border border-[#e8e3d9] bg-white py-2 pl-9 pr-9 text-sm font-manrope",
            "focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20",
          )}
          style={{ color: "var(--text)" }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-subtle)" }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showPanel &&
        panelBox &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[130] overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white shadow-xl font-manrope"
            style={{
              top: panelBox.top,
              left: panelBox.left,
              width: panelBox.width,
              maxHeight: `min(70vh, calc(100dvh - ${panelBox.top + 12}px))`,
            }}
          >
            <div className="max-h-[inherit] overflow-y-auto overscroll-contain">
              {isEmpty && (
                <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
                  <p className="text-sm text-[#94a3b8]">Ничего не найдено</p>
                  <p className="text-xs text-[#94a3b8]/70">Попробуйте другой запрос</p>
                </div>
              )}

              {hasResults && (
                <div className="space-y-3 px-3 py-3">
                  {groups.map((group) => (
                    <div key={group.category}>
                      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                        {group.category}
                      </p>
                      <div className="overflow-hidden rounded-xl border border-[#e8e3d9] divide-y divide-[var(--ds-border)]">
                        {group.results.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => navigate(result.href, result.patientId)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#faf8f4] active:bg-[#f1ede4]"
                          >
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                result.iconBg,
                              )}
                            >
                              <result.Icon className={cn("h-4 w-4", result.iconColor)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-[#0f172a]">{result.label}</p>
                              {result.subtitle ? (
                                <p className="truncate text-[12px] text-[#94a3b8]">{result.subtitle}</p>
                              ) : null}
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
