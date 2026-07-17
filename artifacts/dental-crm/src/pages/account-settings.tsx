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
import { ListRowsSkeleton } from "@/components/skeletons";
import PhotoCropModal from "@/components/account/photo-crop-modal";
import { PageShell } from "@/components/layout/page-shell";
import { RootTabHeader } from "@/components/layout/root-tab-header";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { AppLockSettingsSection } from "@/components/app-lock/app-lock-settings";
import { clearAppLockSessionMarkers } from "@/lib/app-lock/storage";
import { useAppLockStore } from "@/lib/app-lock/store";

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

  const { data: myPayrollData, isLoading: payrollLoading } = useGetMyPayrollRecords();
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
        clearAppLockSessionMarkers();
        useAppLockStore.getState().reset();
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
                  <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-[var(--ds-primary)]/10 flex items-center justify-center text-[#1f75fe] font-bold text-[22px] ring-2 ring-[var(--ds-primary)]/10 transition-transform active:scale-95 duration-150">
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
                  <p className="font-bold text-base text-[#0f172a] leading-tight truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-[#64748b] truncate mt-0.5">
                    {user?.email}
                  </p>
                  {user?.role && (
                    <span className="inline-block mt-1.5 text-xs font-bold text-[#1f75fe] uppercase tracking-wider bg-[var(--ds-primary)]/10 px-2 py-0.5 rounded-full">
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
                <IosGroupRow as="div" className="cursor-pointer hover:bg-[#faf8f4]">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SettingsRowIcon icon={item.icon} className={item.iconClass} />
                    <p className="text-sm text-[#0f172a]">{item.label}</p>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-[#64748b] truncate max-w-[150px]">
                      {item.value}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                  </div>
                </IosGroupRow>
              </button>
            ))}
          </IosGroup>
        </IosSection>

        <AppLockSettingsSection userName={user?.name ?? "User"} />

        {/* Payroll for staff roles */}
        {(user?.role === "admin" || user?.role === "accountant" || user?.role === "warehouse") && (
          <IosSection title={t("payroll.mySalary")}>
            <IosGroup>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e8e3d9]/60">
                <SettingsRowIcon icon={Banknote} className="bg-[#0ea5e9] text-white" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0f172a]">{t("payroll.mySalary")}</p>
                  <p className="text-xs text-[#64748b]">{t("payroll.mySalaryDesc")}</p>
                </div>
              </div>
              {payrollLoading ? (
                <ListRowsSkeleton rows={3} avatar={false} card={false} className="px-2" />
              ) : myRecords.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[#64748b]">
                  {t("payroll.noMySalary")}
                </div>
              ) : (
                <div>
                  {myRecords.slice(0, 6).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-4 py-3 border-b border-[#e8e3d9]/60 last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0f172a]">
                          {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                        </p>
                        <p className="text-xs text-[#64748b]">
                          {t("payroll.myCalculated")}: ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                        </p>
                      </div>
                      <div className="text-right">
                        {r.approvedAmount && (
                          <p className="text-sm font-bold text-[#16a34a]">
                            ₸{Number(r.approvedAmount).toLocaleString("ru-KZ")}
                          </p>
                        )}
                        {r.status === "approved" || r.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16a34a] bg-[#f0fdf4] px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            {r.status === "paid" ? t("payroll.paid") : t("payroll.approved")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#d97706] bg-[#fef3c7] px-2 py-0.5 rounded-full">
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
                  <span className="text-sm shrink-0">{t("menuPage.language")}</span>
                </div>
                <div className="flex bg-[#f1ede4] rounded-lg p-0.5 shrink-0 ml-auto font-lang">
                  {SUPPORTED_LANGS.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLangChange(lang)}
                      className={cn(
                        "min-w-[2.5rem] text-center text-xs font-semibold px-2 py-1 rounded-md transition-all",
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

              {user?.role === "owner" && (
                <IosGroupRow onClick={() => setLocation("/ai-credits")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <SettingsRowIcon icon={Sparkles} className="bg-[#f59e0b] text-white" />
                    <span className="text-sm">{t("nav.aiCredits")}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                </IosGroupRow>
              )}

              {user?.role === "owner" && (
                <IosGroupRow onClick={() => setLocation("/logs")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <SettingsRowIcon icon={ScrollText} className="bg-[var(--text-secondary)] text-white" />
                    <span className="text-sm">{t("nav.logs")}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                </IosGroupRow>
              )}

              <IosGroupRow>
                <div className="flex items-center gap-3 min-w-0">
                  <SettingsRowIcon icon={Bell} className="bg-[#ec4899] text-white" />
                  <span className="text-sm">{t("menuPage.notifications")}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
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
              <span className="flex items-center gap-2 text-sm font-semibold text-[#dc2626]">
                <LogOut className="w-[18px] h-[18px] shrink-0" />
                {logoutMutation.isPending ? t("account.signingOut") : t("account.signOut")}
              </span>
            </IosGroupRow>
          </IosGroup>
        </IosSection>

        <p className="text-center text-xs text-[#94a3b8]">
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
