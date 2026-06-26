import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuthStore } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { clearAuthToken } from "@/lib/auth-token";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";
import {
  Users,
  BarChart3,
  Contact,
  LogOut,
  Calendar,
  Wallet,
  Bot,
  ChevronRight,
  Bell,
  Radio,
  ClipboardList,
  DatabaseZap,
  FileText,
  MapPin,
  Building2,
  CreditCard,
} from "lucide-react";

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const ALL_NAV_ITEMS = [
  { nameKey: "nav.patients",     href: "/patients",           icon: Users,           roles: ["owner","admin","doctor","accountant"] },
  { nameKey: "nav.schedule",     href: "/schedule",           icon: Calendar,        roles: ["doctor"] },
  { nameKey: "nav.analytics",    href: "/analytics",          icon: BarChart3,       roles: ["owner"] },
  { nameKey: "nav.myAnalytics",  href: "/doctor-analytics",   icon: BarChart3,       roles: ["doctor"] },
  { nameKey: "nav.financials",   href: "/financials",         icon: Wallet,          roles: ["owner","accountant"] },
  { nameKey: "nav.services",     href: "/services",           icon: ClipboardList,   roles: ["owner","admin","doctor","accountant"] },
  { nameKey: "nav.users",        href: "/users",              icon: Contact,         roles: ["owner"] },
  { nameKey: "nav.chatbot",      href: "/chatbot",            icon: Bot,             roles: ["owner"] },
  { nameKey: "nav.channels",     href: "/channels",           icon: Radio,           roles: ["owner","admin"] },
  { nameKey: "nav.migration",    href: "/migration",          icon: DatabaseZap,     roles: ["owner"] },
  { nameKey: "nav.contractTemplates", href: "/contract-templates", icon: FileText,    roles: ["owner","admin","doctor"] },
  { nameKey: "nav.clinicBranches",    href: "/clinic-branches",    icon: Building2,    roles: ["owner"] },
  { nameKey: "nav.pricing",           href: "/pricing",            icon: CreditCard,   roles: ["owner"] },
  { nameKey: "nav.branches",          href: "/branches",           icon: MapPin,       roles: ["owner"] },
];

const LANG_LABEL: Record<Lang, string> = { ru: "Рус", kz: "Қаз", en: "Eng" };

const gridVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
};

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

  return (
    <PageShell className="pb-6">
      <Link
        href="/account-settings"
        className="block bg-surface px-4 pt-5 pb-4 mb-4 border-b border-border/50 active:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-primary/12 text-primary flex items-center justify-center font-bold text-base shrink-0 ring-2 ring-primary/10">
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
            <p className="font-semibold text-foreground text-body leading-tight truncate">{user?.name}</p>
            <p className="text-caption text-muted-foreground truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-micro font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
              {user?.role ? t(`role.${user.role}`) : user?.role}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
          </div>
        </div>
      </Link>

      <IosSection title={t("menuPage.title")} className="mb-5">
        <IosGroup className="py-2 px-1">
          <motion.div
            className="grid grid-cols-4"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            {navItems.map((item) => (
              <motion.div key={item.href} variants={gridItemVariants}>
                <Link
                  href={item.href}
                  className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors"
                >
                  <item.icon className="w-6 h-6 text-primary" strokeWidth={1.8} />
                  <span className="text-micro text-muted-foreground text-center leading-tight font-medium line-clamp-2">
                    {item.name}
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </IosGroup>
      </IosSection>

      {user?.role !== "admin" && (
        <IosSection title={t("menuPage.settings")} className="mb-4">
          <IosGroup>
            <IosGroupRow>
              <span className="text-body">{t("menuPage.language")}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-caption text-muted-foreground mr-0.5">{LANG_LABEL[currentLang]}</span>
                <div className="flex bg-muted rounded-lg p-0.5">
                  {SUPPORTED_LANGS.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLangChange(lang)}
                      className={cn(
                        "text-micro font-semibold px-2.5 py-1.5 rounded-md transition-all",
                        currentLang === lang
                          ? "bg-surface text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {LANG_LABEL[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </IosGroupRow>

            <Link href="/ai-credits" className="block">
              <IosGroupRow className="border-b-0">
                <span className="text-body">{t("nav.aiCredits")}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              </IosGroupRow>
            </Link>

            {user?.role === "owner" && (
              <Link href="/logs" className="block">
                <IosGroupRow>
                  <span className="text-body">{t("nav.logs")}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                </IosGroupRow>
              </Link>
            )}

            <IosGroupRow>
              <span className="text-body">{t("menuPage.notifications")}</span>
              <div className="flex items-center gap-1 text-muted-foreground/60">
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
          className="w-full justify-start gap-3 h-auto py-3.5 text-destructive border-border/60 hover:text-destructive hover:bg-destructive/5"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="text-body font-medium">
            {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
          </span>
        </Button>
      </IosSection>

      <p className="mt-8 text-center text-caption text-muted-foreground/60">
        {t("menuPage.copyright")}
      </p>
    </PageShell>
  );
}
