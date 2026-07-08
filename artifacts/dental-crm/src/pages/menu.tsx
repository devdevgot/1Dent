import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/hooks/use-auth";
import { useLogout, prefetchStaffList } from "@workspace/api-client-react";
import { clearAuthToken } from "@/lib/auth-token";
import { clearBranchContext } from "@/lib/branch-context";
import { clearPersistedQueryCache } from "@/lib/query-persist";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronRight, Bell } from "lucide-react";

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

function normalizeLang(value: string | undefined): Lang {
  const base = value?.split("-")[0]?.toLowerCase();
  return SUPPORTED_LANGS.includes(base as Lang) ? (base as Lang) : "ru";
}

const ALL_NAV_ITEMS = [
  { nameKey: "nav.dashboard",     href: "/dashboard/warehouse", img: "/icons/menu/dashboard.png",       roles: ["warehouse"] },
  { nameKey: "nav.inventory",     href: "/inventory",           img: "/icons/menu/inventory.png",       roles: ["warehouse"] },
  { nameKey: "nav.patients",     href: "/patients",           img: "/icons/menu/patients.png",        roles: ["owner","admin","doctor","accountant"] },
  { nameKey: "nav.schedule",     href: "/schedule",           img: "/icons/menu/schedule.png",        roles: ["doctor"] },
  { nameKey: "nav.analytics",    href: "/analytics",          img: "/icons/menu/analytics.png",       roles: ["owner"] },
  { nameKey: "nav.myAnalytics",  href: "/doctor-analytics",   img: "/icons/menu/analytics.png",       roles: ["doctor"] },
  { nameKey: "nav.financials",   href: "/financials",         img: "/icons/menu/financials.png",      roles: ["owner","accountant"] },
  { nameKey: "nav.services",     href: "/services",           img: "/icons/menu/services.png",        roles: ["owner","admin","doctor","accountant"] },
  { nameKey: "nav.users",        href: "/users",              img: "/icons/menu/users.png",           roles: ["owner"] },
  { nameKey: "nav.chatbot",      href: "/chatbot",            img: "/icons/menu/chatbot.png",         roles: ["owner"] },
  { nameKey: "nav.channels",     href: "/channels",           img: "/icons/menu/channels.png",        roles: ["owner","admin"] },
  { nameKey: "nav.migration",    href: "/migration",          img: "/icons/menu/migration.png",       roles: ["owner"] },
  { nameKey: "nav.contractTemplates", href: "/contract-templates", img: "/icons/menu/contracts.png",       roles: ["owner","admin","doctor"] },
  { nameKey: "nav.clinicBranches",    href: "/clinic-branches",    img: "/icons/menu/clinic-branches.png", roles: ["owner"] },
  { nameKey: "nav.pricing",           href: "/pricing",            img: "/icons/menu/pricing.png",         roles: ["owner"] },
  { nameKey: "nav.branches",          href: "/branches",           img: "/icons/menu/branches.png",        roles: ["owner"] },
];

export default function MenuPage() {
  const { t } = useTranslation();
  const { user, clearAuth } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentLang, setCurrentLang] = useState<Lang>(() => normalizeLang(i18n.language));

  useEffect(() => {
    const handleLanguageChanged = (lang: string) => setCurrentLang(normalizeLang(lang));
    i18n.on("languageChanged", handleLanguageChanged);
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, []);

  // Prefetch the staff list while the user is on the menu, so /users opens
  // instantly instead of showing a loading spinner.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    prefetchStaffList(queryClient);
  }, [user?.role, queryClient]);

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    user && item.roles.includes(user.role),
  ).map((item) => ({
    ...item,
    name: t(item.nameKey),
  }));

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearPersistedQueryCache();
        clearBranchContext();
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

  return (
    <PageShell className="pb-6">
      <Link
        href="/account-settings"
        className="block bg-white px-4 pt-5 pb-4 mb-4 border-b border-[#e8e3d9]/50 active:bg-[#f1ede4] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-[#1f75fe]/12 text-[#1f75fe] flex items-center justify-center font-bold text-base shrink-0 ring-2 ring-[#1f75fe]/10">
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
            <p className="font-semibold text-[#0f172a] text-body leading-tight truncate">{user?.name}</p>
            <p className="text-caption text-[#64748b] truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-micro font-bold text-[#1f75fe] uppercase tracking-wider bg-[#1f75fe]/10 px-2 py-0.5 rounded-full">
              {user?.role ? t(`role.${user.role}`) : user?.role}
            </span>
            <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
          </div>
        </div>
      </Link>

      <IosSection title={t("menuPage.title")} className="mb-5">
        <IosGroup className="py-2 px-1">
          <div className="grid grid-cols-4">
            {navItems.length === 0 ? (
              <p className="col-span-4 py-6 text-center text-caption text-[#94a3b8]">
                {t("menuPage.noShortcuts")}
              </p>
            ) : (
              navItems.map((item) => (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className="flex flex-col items-center gap-1.5 py-3 px-0.5 rounded-xl hover:bg-[#f1ede4] active:bg-[#f1ede4] transition-colors"
                  >
                    <img
                      src={item.img}
                      alt=""
                      aria-hidden
                      className="w-[52px] h-[52px] shrink-0 object-contain drop-shadow-sm"
                      draggable={false}
                    />
                    <span className="w-full text-[10px] font-bold text-[#0f172a] text-center leading-[1.2] line-clamp-2 break-words">
                      {item.name}
                    </span>
                  </Link>
                </div>
              ))
            )}
          </div>
        </IosGroup>
      </IosSection>

      {user?.role !== "admin" && (
        <IosSection title={t("menuPage.settings")} className="mb-4">
          <IosGroup>
            <IosGroupRow className="gap-2">
              <span className="text-body shrink-0">{t("menuPage.language")}</span>
              <div className="flex bg-[#f1ede4] rounded-lg p-0.5 shrink-0 ml-auto font-lang">
                {SUPPORTED_LANGS.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLangChange(lang)}
                    className={cn(
                      "min-w-[2.5rem] text-center text-caption font-semibold px-2 py-1 rounded-md transition-all",
                      currentLang === lang
                        ? "bg-white text-[#1f75fe] shadow-sm"
                        : "text-[#64748b] hover:text-[#0f172a]",
                    )}
                  >
                    {t(`lang.${lang}`)}
                  </button>
                ))}
              </div>
            </IosGroupRow>

            <Link href="/ai-credits" className="block">
              <IosGroupRow className="border-b-0">
                <span className="text-body">{t("nav.aiCredits")}</span>
                <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
              </IosGroupRow>
            </Link>

            {user?.role === "owner" && (
              <Link href="/logs" className="block">
                <IosGroupRow>
                  <span className="text-body">{t("nav.logs")}</span>
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                </IosGroupRow>
              </Link>
            )}

            <IosGroupRow>
              <span className="text-body">{t("menuPage.notifications")}</span>
              <div className="flex items-center gap-1 text-[#94a3b8]">
                <Bell className="w-4 h-4" />
                <ChevronRight className="w-4 h-4" />
              </div>
            </IosGroupRow>
          </IosGroup>
        </IosSection>
      )}

      <IosSection className="mt-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-auto py-3.5 text-[#dc2626] border-[#e8e3d9] hover:text-[#dc2626] hover:bg-[#fef2f2]"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="text-body font-medium">
            {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
          </span>
        </Button>
      </IosSection>

      <p className="mt-8 text-center text-caption text-[#94a3b8]">
        {t("menuPage.copyright")}
      </p>
    </PageShell>
  );
}
