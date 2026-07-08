import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuthStore } from "@/hooks/use-auth";
import {
  ChevronRight,
  User,
  Mail,
  Lock,
  Camera,
  Banknote,
  CheckCircle,
  Clock,
  LogOut,
  Bell,
  Globe,
  Sparkles,
  ScrollText,
} from "lucide-react";
import {
  useGetMyPayrollRecords,
  useUpdateProfile,
  useLogout,
  type PayrollRecord,
} from "@workspace/api-client-react";
import { clearAuthToken } from "@/lib/auth-token";
import { clearBranchContext } from "@/lib/branch-context";
import { clearPersistedQueryCache } from "@/lib/query-persist";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import PhotoCropModal from "@/components/account/photo-crop-modal";
import { PageShell } from "@/components/layout/page-shell";
import { RootTabHeader } from "@/components/layout/root-tab-header";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

function normalizeLang(value: string | undefined): Lang {
  const base = value?.split("-")[0]?.toLowerCase();
  return SUPPORTED_LANGS.includes(base as Lang) ? (base as Lang) : "ru";
}

function SettingsRowIcon({
  icon: Icon,
  className,
}: {
  icon: typeof User;
  className: string;
}) {
  return (
    <div
      className={cn(
        "w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0",
        className,
      )}
    >
      <Icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
    </div>
  );
}

export default function AccountSettings() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth, clearAuth } = useAuthStore();
  const { toast } = useToast();
  const [currentLang, setCurrentLang] = useState<Lang>(() => normalizeLang(i18n.language));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);

  useEffect(() => {
    const handleLanguageChanged = (lang: string) => setCurrentLang(normalizeLang(lang));
    i18n.on("languageChanged", handleLanguageChanged);
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, []);

  const { data: myPayrollData } = useGetMyPayrollRecords();
  const myRecords: PayrollRecord[] = myPayrollData?.data?.records ?? [];

  const [photoVersion, setPhotoVersion] = useState(0);

  const updateMutation = useUpdateProfile({
    mutation: {
      onSuccess: (res) => {
        if (res.success && user && clinic) {
          setAuth({ ...user, ...(res.data.user as Record<string, unknown>) }, clinic);
          setPhotoVersion((v) => v + 1);
          toast({ title: t("settingsPage.photoUpdated") });
        } else {
          toast({
            title: t("common.error"),
            description: t("settingsPage.photoUpdateError"),
            variant: "destructive",
          });
        }
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({
          title: t("common.error"),
          description: msg ?? t("settingsPage.photoUpdateError"),
          variant: "destructive",
        });
      },
    },
  });

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = async (croppedBase64: string) => {
    await updateMutation.mutateAsync({ photoUrl: croppedBase64 });
  };

  const handleLangChange = (lang: Lang) => {
    void i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

  const photoUrl = (user as typeof user & { photoUrl?: string | null })?.photoUrl;
  const initials = (user?.name ?? "?").charAt(0).toUpperCase();

  const profileItems = [
    {
      icon: User,
      iconClass: "bg-[var(--ds-primary)] text-white",
      label: t("settingsPage.name"),
      value: user?.name,
      href: "/account/edit-profile",
    },
    {
      icon: Mail,
      iconClass: "bg-[var(--success)] text-white",
      label: t("settingsPage.email"),
      value: user?.email,
      href: "/account/change-email",
    },
    {
      icon: Lock,
      iconClass: "bg-[var(--text-secondary)] text-white",
      label: t("settingsPage.password"),
      value: "••••••••",
      href: "/account/change-password",
    },
  ];

  return (
    <PageShell animate={false} className="pb-8">
      <RootTabHeader title={t("nav.more")} />

      <div className="pt-2 space-y-5">
        {/* Profile card */}
        <IosSection>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <IosGroup className="px-4 py-4">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/25 rounded-full"
                >
                  <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-[var(--ds-primary)]/10 flex items-center justify-center text-[var(--ds-primary)] font-bold text-[22px] ring-2 ring-[var(--ds-primary)]/10 transition-transform active:scale-95 duration-150">
                    {photoUrl ? (
                      <img key={photoVersion} src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-[var(--ds-primary)] flex items-center justify-center shadow-sm border-2 border-white">
                    <Camera className="w-3 h-3 text-white" />
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-section-title text-[var(--text)] leading-tight truncate">
                    {user?.name}
                  </p>
                  <p className="text-caption text-[var(--text-secondary)] truncate mt-0.5">
                    {user?.email}
                  </p>
                  {user?.role && (
                    <span className="inline-block mt-1.5 text-micro font-bold text-[var(--ds-primary)] uppercase tracking-wider bg-[var(--ds-primary)]/10 px-2 py-0.5 rounded-full">
                      {t(`role.${user.role}`)}
                    </span>
                  )}
                </div>
              </div>
            </IosGroup>
          </motion.div>
        </IosSection>

        {/* Profile fields */}
        <IosSection title={t("settingsPage.profile")}>
          <IosGroup>
            {profileItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => setLocation(item.href)}
                className="w-full"
              >
                <IosGroupRow as="div" className="cursor-pointer hover:bg-[var(--bg)]">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SettingsRowIcon icon={item.icon} className={item.iconClass} />
                    <p className="text-body text-[var(--text)]">{item.label}</p>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-caption text-[var(--text-secondary)] truncate max-w-[150px]">
                      {item.value}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
                  </div>
                </IosGroupRow>
              </button>
            ))}
          </IosGroup>
        </IosSection>

        {/* Payroll for staff roles */}
        {(user?.role === "admin" || user?.role === "accountant" || user?.role === "warehouse") && (
          <IosSection title={t("payroll.mySalary")}>
            <IosGroup>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--ds-border)]/60">
                <SettingsRowIcon icon={Banknote} className="bg-[#0ea5e9] text-white" />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-[var(--text)]">{t("payroll.mySalary")}</p>
                  <p className="text-caption text-[var(--text-secondary)]">{t("payroll.mySalaryDesc")}</p>
                </div>
              </div>
              {myRecords.length === 0 ? (
                <div className="px-4 py-6 text-center text-caption text-[var(--text-secondary)]">
                  {t("payroll.noMySalary")}
                </div>
              ) : (
                <div>
                  {myRecords.slice(0, 6).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-4 py-3 border-b border-[var(--ds-border)]/60 last:border-b-0"
                    >
                      <div>
                        <p className="text-body font-semibold text-[var(--text)]">
                          {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                        </p>
                        <p className="text-caption text-[var(--text-secondary)]">
                          {t("payroll.myCalculated")}: ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                        </p>
                      </div>
                      <div className="text-right">
                        {r.approvedAmount && (
                          <p className="text-body font-bold text-[var(--success)]">
                            ₸{Number(r.approvedAmount).toLocaleString("ru-KZ")}
                          </p>
                        )}
                        {r.status === "approved" || r.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-micro font-semibold text-[var(--success)] bg-[#f0fdf4] px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            {r.status === "paid" ? t("payroll.paid") : t("payroll.approved")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-micro font-semibold text-[var(--warning)] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            {t("payroll.pending")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </IosGroup>
          </IosSection>
        )}

        {/* App settings */}
        {user?.role !== "admin" && (
          <IosSection title={t("menuPage.settings")}>
            <IosGroup>
              <IosGroupRow className="gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <SettingsRowIcon icon={Globe} className="bg-[#8b5cf6] text-white" />
                  <span className="text-body shrink-0">{t("menuPage.language")}</span>
                </div>
                <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5 shrink-0 ml-auto font-lang">
                  {SUPPORTED_LANGS.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLangChange(lang)}
                      className={cn(
                        "min-w-[2.5rem] text-center text-caption font-semibold px-2 py-1 rounded-md transition-all",
                        currentLang === lang
                          ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm"
                          : "text-[var(--text-secondary)] hover:text-[var(--text)]",
                      )}
                    >
                      {t(`lang.${lang}`)}
                    </button>
                  ))}
                </div>
              </IosGroupRow>

              <IosGroupRow onClick={() => setLocation("/ai-credits")}>
                <div className="flex items-center gap-3 min-w-0">
                  <SettingsRowIcon icon={Sparkles} className="bg-[#f59e0b] text-white" />
                  <span className="text-body">{t("nav.aiCredits")}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
              </IosGroupRow>

              {user?.role === "owner" && (
                <IosGroupRow onClick={() => setLocation("/logs")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <SettingsRowIcon icon={ScrollText} className="bg-[var(--text-secondary)] text-white" />
                    <span className="text-body">{t("nav.logs")}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
                </IosGroupRow>
              )}

              <IosGroupRow>
                <div className="flex items-center gap-3 min-w-0">
                  <SettingsRowIcon icon={Bell} className="bg-[#ec4899] text-white" />
                  <span className="text-body">{t("menuPage.notifications")}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-subtle)] shrink-0" />
              </IosGroupRow>
            </IosGroup>
          </IosSection>
        )}

        {/* Sign out */}
        <IosSection>
          <IosGroup>
            <IosGroupRow
              as="button"
              onClick={() => logoutMutation.mutate()}
              className={cn("justify-center", logoutMutation.isPending && "opacity-60 pointer-events-none")}
            >
              <span className="flex items-center gap-2 text-body font-semibold text-[var(--danger)]">
                <LogOut className="w-[18px] h-[18px] shrink-0" />
                {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
              </span>
            </IosGroupRow>
          </IosGroup>
        </IosSection>

        <p className="text-center text-caption text-[var(--text-subtle)]">
          {t("menuPage.copyright")}
        </p>
      </div>

      {selectedImage && (
        <PhotoCropModal
          isOpen={isCropOpen}
          onClose={() => {
            setIsCropOpen(false);
            setSelectedImage(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          imageSrc={selectedImage}
          onCrop={handleCropComplete}
        />
      )}
    </PageShell>
  );
}
