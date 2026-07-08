import { useState, useEffect, useRef, useMemo } from "react";
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
  { label: "Дашборд",    href: "dashboard",       roles: ["owner","admin","doctor","accountant","warehouse"], Icon: LayoutDashboard, iconBg: "bg-[var(--primary-light)]",   iconColor: "text-[var(--ds-primary)]" },
  { label: "Пациенты",   href: "/patients",                  roles: ["owner","admin","doctor","accountant"],        Icon: Users,           iconBg: "bg-[var(--info-light)]",    iconColor: "text-[var(--info)]" },
  { label: "Расписание", href: "/schedule",        roles: ["doctor"],                                         Icon: Calendar,        iconBg: "bg-[var(--warning-light)]", iconColor: "text-[var(--warning)]" },
  { label: "Аналитика",  href: "/analytics",       roles: ["owner"],                                          Icon: BarChart3,       iconBg: "bg-[var(--success-light)]",   iconColor: "text-[var(--success)]" },
  { label: "Аналитика врача", href: "/doctor-analytics", roles: ["doctor"],                                   Icon: BarChart3,       iconBg: "bg-[var(--success-light)]",   iconColor: "text-[var(--success)]" },
  { label: "Финансы",    href: "/financials",      roles: ["owner","accountant"],                             Icon: Wallet,          iconBg: "bg-[var(--warning-light)]",iconColor: "text-[var(--warning)]" },
  { label: "WhatsApp",   href: "/chat",            roles: ["owner","admin","doctor"],                         Icon: FaWhatsapp,      iconBg: "bg-[var(--success-light)]",  iconColor: "text-[var(--success)]" },
  { label: "Сотрудники", href: "/users",           roles: ["owner"],                                          Icon: Contact,         iconBg: "bg-[var(--surface-2)]",  iconColor: "text-[var(--text-secondary)]" },
  { label: "Чат-бот",   href: "/chatbot",          roles: ["owner"],                                          Icon: Bot,             iconBg: "bg-[var(--primary-light)]", iconColor: "text-[var(--ds-primary)]" },
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);

  const role = user?.role ?? "";
  const dashboardHref = ROLE_DASHBOARD[role] ?? "/dashboard";

  const canSeePatients  = ["owner","admin","doctor"].includes(role);
  const canSeeUsers     = ["owner","admin"].includes(role);
  const canSeeProcedures= ["owner","admin","accountant"].includes(role);

  const { data: patientsData }   = useListPatients({ query: { enabled: canSeePatients } });
  const { data: usersData }      = useListUsers({ query: { enabled: canSeeUsers } });
  const { data: proceduresData } = useListProcedures({ query: { enabled: canSeeProcedures } });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

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
          href: "/patients?view=kanban",
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
          iconColor: "text-[var(--success)]",
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
          iconBg: "bg-[var(--surface-2)]",
          iconColor: "text-[var(--text-secondary)]",
        }));
      if (staff.length) result.push({ category: "Сотрудники", results: staff });
    }

    return result;
  }, [query, role, patientsData, usersData, proceduresData, canSeePatients, canSeeUsers, canSeeProcedures, dashboardHref]);

  function navigate(href: string, patientId?: string) {
    setIsOpen(false);
    if (patientId) setSelectedPatientId(patientId);
    setLocation(href);
  }

  const hasResults = groups.length > 0;
  const isEmpty    = query.trim().length > 0 && !hasResults;

  return (
    <div className="flex-1 flex min-w-0">
      {/* Search bar trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Имя, телефон, ИИН"
        className="flex-1 flex min-w-0 items-center gap-2 bg-[var(--surface-2)] rounded-xl px-3 py-2 text-left cursor-pointer hover:bg-[var(--ds-border)]/60 transition-colors"
      >
        <Search className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
        <span className="min-w-0 truncate text-caption text-[var(--text-subtle)] select-none font-manrope whitespace-nowrap">
          Поиск…
        </span>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] font-manrope">
          {/* Search header — same height/position as the regular header */}
          <div className="bg-[var(--ds-surface)] px-4 py-2.5 border-b border-[var(--ds-border)] flex items-center gap-3 safe-area-top">
            <div className="flex-1 flex items-center gap-2 bg-[var(--surface-2)] rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Имя, телефон, ИИН"
                className="flex-1 text-body bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-subtle)] font-manrope"
              />
              {query && (
                <button onClick={() => setQuery("")} className="shrink-0 text-[var(--text-subtle)] hover:text-[var(--text-secondary)]">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-body font-medium shrink-0 text-[var(--ds-primary)]"
            >
              Отмена
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!query.trim() && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Search className="w-12 h-12 text-[var(--ds-border)]" />
                <p className="text-body text-[var(--text-subtle)]">Введите запрос для поиска</p>
              </div>
            )}

            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-body text-[var(--text-subtle)]">Ничего не найдено</p>
                <p className="text-caption text-[var(--text-subtle)]/70">Попробуйте другой запрос</p>
              </div>
            )}

            {hasResults && (
              <div className="px-4 py-4 space-y-5">
                {groups.map((group) => (
                  <div key={group.category}>
                    <p className="text-[12px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2 px-1">
                      {group.category}
                    </p>
                    <div className="bg-[var(--ds-surface)] rounded-2xl overflow-hidden border border-[var(--ds-border)] divide-y divide-[var(--ds-border)]">
                      {group.results.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => navigate(result.href, result.patientId)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--surface-2)] hover:bg-[var(--bg)] transition-colors"
                        >
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", result.iconBg)}>
                            <result.Icon className={cn("w-4 h-4", result.iconColor)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-body text-[var(--text)] truncate">{result.label}</p>
                            {result.subtitle && (
                              <p className="text-[12px] text-[var(--text-subtle)] truncate">{result.subtitle}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
