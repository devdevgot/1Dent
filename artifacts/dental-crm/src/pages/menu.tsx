import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { clearAuthToken } from "@/lib/auth-token";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  KanbanSquare,
  Users,
  Stethoscope,
  BarChart3,
  Settings,
  LogOut,
  Calendar,
  Wallet,
  Package,
  Bot,
  ChevronRight,
  Bell,
  Radio,
} from "lucide-react";

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const ALL_NAV_ITEMS = [
  { nameKey: "nav.kanban",       href: "/kanban",             icon: KanbanSquare,    roles: ["owner","admin"] },
  { nameKey: "nav.patients",     href: "/patients",           icon: Users,           roles: ["owner","admin","doctor"] },
  { nameKey: "nav.procedures",   href: "/procedures",         icon: Stethoscope,     roles: ["owner","admin","accountant"] },
  { nameKey: "nav.schedule",     href: "/schedule",           icon: Calendar,        roles: ["doctor"] },
  { nameKey: "nav.analytics",    href: "/analytics",          icon: BarChart3,       roles: ["owner"] },
  { nameKey: "nav.myAnalytics",  href: "/doctor-analytics",   icon: BarChart3,       roles: ["doctor"] },
  { nameKey: "nav.financials",   href: "/financials",         icon: Wallet,          roles: ["owner","accountant"] },
  { nameKey: "nav.inventory",    href: "/inventory",          icon: Package,         roles: ["owner","admin","warehouse"] },
  { nameKey: "nav.users",        href: "/users",              icon: Settings,        roles: ["owner","admin"] },
  { nameKey: "nav.chatbot",      href: "/chatbot",            icon: Bot,             roles: ["owner","admin"] },
  { nameKey: "nav.channels",     href: "/channels",           icon: Radio,           roles: ["owner","admin"] },
];

export default function MenuPage() {
  const { t } = useTranslation();
  const { user, clearAuth } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentLang, setCurrentLang] = useState<Lang>((i18n.language as Lang) || "ru");

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    user && item.roles.includes(user.role),
  ).map((item) => ({
    ...item,
    name: t(item.nameKey),
  }));

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAuthToken();
        clearAuth();
        setLocation("/login");
      },
      onError: () => {
        toast({
          title: t("account.errorTitle"),
          description: t("account.errorDesc"),
          variant: "destructive",
        });
      },
    },
  });

  const handleLangChange = (lang: Lang) => {
    void i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

  const LANG_LABEL: Record<Lang, string> = { ru: "Рус", kz: "Қаз", en: "Eng" };

  return (
    <div className="min-h-full bg-[#f2f2f7] pb-6">
      {/* Profile card */}
      <Link replace href="/account-settings" className="block bg-white px-4 pt-5 pb-3 mb-5 active:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 py-1">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-primary/15 text-primary flex items-center justify-center font-bold text-base shrink-0">
            {(user as typeof user & { photoUrl?: string | null })?.photoUrl ? (
              <img
                src={(user as typeof user & { photoUrl?: string | null })?.photoUrl!}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              user?.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-[15px] leading-tight truncate">{user?.name}</p>
            <p className="text-sm text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
              {user?.role ? t(`role.${user.role}`) : user?.role}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        </div>
      </Link>

      {/* Services grid */}
      <div className="px-4 mb-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Меню</p>
        <div className="bg-white rounded-2xl py-3 px-2">
          <div className="grid grid-cols-3">
            {navItems.map((item, index) => {
              const col = index % 3;
              const row = Math.floor(index / 3);
              const totalRows = Math.ceil(navItems.length / 3);
              const isLastRow = row === totalRows - 1;
              const isLastCol = col === 2 || index === navItems.length - 1;

              return (
                <Link
                  replace
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 px-1 relative",
                    !isLastRow && "border-b border-gray-100",
                    !isLastCol && "border-r border-gray-100",
                  )}
                >
                  <item.icon
                    className="w-6 h-6 text-primary"
                    strokeWidth={1.8}
                  />
                  <span className="text-[11px] text-gray-600 text-center leading-tight font-medium">
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="px-4 mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Настройки</p>
        <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-100">
          {/* Language */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-[15px] text-gray-800">Язык приложения</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400 mr-1">{LANG_LABEL[currentLang]}</span>
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {SUPPORTED_LANGS.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLangChange(lang)}
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-all",
                      currentLang === lang
                        ? "bg-white text-primary shadow-sm"
                        : "text-gray-400",
                    )}
                  >
                    {LANG_LABEL[lang]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Audit Log — owner only */}
          {user?.role === "owner" && (
            <Link replace href="/logs" className="flex items-center justify-between px-4 py-3.5 active:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] text-gray-800">{t("nav.logs")}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </Link>
          )}

          {/* Migration — owner/admin only */}
          {(user?.role === "owner" || user?.role === "admin") && (
            <Link replace href="/migration" className="flex items-center justify-between px-4 py-3.5 active:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] text-gray-800">{t("nav.migration")}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </Link>
          )}

          {/* Notifications */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-[15px] text-gray-800">Уведомления</span>
            <div className="flex items-center gap-1 text-gray-400">
              <Bell className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 mt-5">
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full bg-white rounded-2xl flex items-center px-4 py-3.5 text-red-500 gap-3"
        >
          <LogOut className="w-[18px] h-[18px] text-red-500 shrink-0" />
          <span className="text-[15px] font-medium">
            {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
          </span>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-300">© 2025 Dental CRM</p>
      </div>
    </div>
  );
}
