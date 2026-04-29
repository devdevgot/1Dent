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
  UserCog,
  Calendar,
  BarChart3,
  Wallet,
  Bot,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
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
  { label: "Дашборд",    href: "dashboard",       roles: ["owner","admin","doctor","accountant","warehouse"], Icon: LayoutDashboard, iconBg: "bg-blue-100",   iconColor: "text-blue-600" },
  { label: "Пациенты",   href: "/patients",                  roles: ["owner","admin","doctor","accountant"],        Icon: Users,           iconBg: "bg-sky-100",    iconColor: "text-sky-600" },
  { label: "Расписание", href: "/schedule",        roles: ["doctor"],                                         Icon: Calendar,        iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  { label: "Аналитика",  href: "/analytics",       roles: ["owner"],                                          Icon: BarChart3,       iconBg: "bg-pink-100",   iconColor: "text-pink-600" },
  { label: "Аналитика врача", href: "/doctor-analytics", roles: ["doctor"],                                   Icon: BarChart3,       iconBg: "bg-pink-100",   iconColor: "text-pink-600" },
  { label: "Финансы",    href: "/financials",      roles: ["owner","accountant"],                             Icon: Wallet,          iconBg: "bg-emerald-100",iconColor: "text-emerald-600" },
  { label: "WhatsApp",   href: "/chat",            roles: ["owner","admin","doctor"],                         Icon: FaWhatsapp,      iconBg: "bg-green-100",  iconColor: "text-green-600" },
  { label: "Сотрудники", href: "/users",           roles: ["owner"],                                          Icon: UserCog,         iconBg: "bg-slate-100",  iconColor: "text-slate-600" },
  { label: "Чат-бот",   href: "/chatbot",          roles: ["owner"],                                          Icon: Bot,             iconBg: "bg-purple-100", iconColor: "text-purple-600" },
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

function matches(text: string, query: string) {
  return normalize(text).includes(normalize(query));
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

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
      const list = (patientsData as { data?: { patients?: { id: string; name: string; phone: string }[] } })?.data?.patients ?? [];
      const patients = list
        .filter((p) => matches(p.name, q) || matches(p.phone, q))
        .slice(0, 8)
        .map((p) => ({
          id: p.id,
          label: p.name,
          subtitle: p.phone,
          href: "/patients",
          Icon: Users,
          iconBg: "bg-sky-100",
          iconColor: "text-sky-600",
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
          iconBg: "bg-green-100",
          iconColor: "text-green-600",
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
          iconBg: "bg-slate-100",
          iconColor: "text-slate-600",
        }));
      if (staff.length) result.push({ category: "Сотрудники", results: staff });
    }

    return result;
  }, [query, role, patientsData, usersData, proceduresData, canSeePatients, canSeeUsers, canSeeProcedures, dashboardHref]);

  function navigate(href: string) {
    setIsOpen(false);
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
        className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 text-left cursor-pointer"
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-sm text-gray-400 select-none">Поиск...</span>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#f2f2f7]">
          {/* Search header — same height/position as the regular header */}
          <div className="bg-white px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 safe-area-top">
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск..."
                className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-400"
              />
              {query && (
                <button onClick={() => setQuery("")} className="shrink-0 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[15px] font-medium shrink-0"
              style={{ color: "#98cc1c" }}
            >
              Отмена
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!query.trim() && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Search className="w-12 h-12 text-gray-200" />
                <p className="text-[15px] text-gray-400">Введите запрос для поиска</p>
              </div>
            )}

            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-[15px] text-gray-400">Ничего не найдено</p>
                <p className="text-[13px] text-gray-300">Попробуйте другой запрос</p>
              </div>
            )}

            {hasResults && (
              <div className="px-4 py-4 space-y-5">
                {groups.map((group) => (
                  <div key={group.category}>
                    <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                      {group.category}
                    </p>
                    <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-100">
                      {group.results.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => navigate(result.href)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
                        >
                          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", result.iconBg)}>
                            <result.Icon className={cn("w-4 h-4", result.iconColor)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] text-gray-900 truncate">{result.label}</p>
                            {result.subtitle && (
                              <p className="text-[12px] text-gray-400 truncate">{result.subtitle}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
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
