import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuthStore } from "@/hooks/use-auth";
import { ChevronRight, Camera, CheckCircle, Clock } from "lucide-react";
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
import { SettingsRowIcon } from "@/components/account/settings-row-icon";
import { PROFILE_ICONS, PROFILE_CARD_CLASS, prefetchProfileIcons } from "@/lib/profile-icons";
import { formatUserPhoneDisplay } from "@/lib/user-contact";
import { PageShell } from "@/components/layout/page-shell";
import { RootTabHeader } from "@/components/layout/root-tab-header";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { AppLockSettingsSection } from "@/components/app-lock/app-lock-settings";
import { PushNotificationSettings } from "@/components/push/push-notification-settings";
import { clearAppLockSessionMarkers } from "@/lib/app-lock/storage";
import { useAppLockStore } from "@/lib/app-lock/store";

const SUPPORTED_LANGS = ["ru", "kz", "en"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

function normalizeLang(value: string | undefined): Lang {
  const base = value?.split("-")[0]?.toLowerCase();
  return SUPPORTED_LANGS.includes(base as Lang) ? (base as Lang) : "ru";
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

  useEffect(() => {
    prefetchProfileIcons();
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
  const phoneDisplay = formatUserPhoneDisplay(user?.email);

  const profileItems: {
    img: string;
    label: string;
    value: string;
    href?: string;
  }[] = [
    {
      img: PROFILE_ICONS.profile,
      label: t("settingsPage.name"),
      value: user?.name ?? "",
      href: "/account/edit-profile",
    },
    {
      // Login is WhatsApp OTP — show phone, not the internal synthetic email.
      img: PROFILE_ICONS.email,
      label: t("settingsPage.phone"),
      value: phoneDisplay ?? user?.email ?? "",
      // Phone change via WhatsApp is not exposed in Profile yet.
    },
    {
      img: PROFILE_ICONS.password,
      label: t("settingsPage.password"),
      value: "••••••••",
      href: "/account/change-password",
    },
  ];

  return (
    <PageShell animate={false} className="pb-8">
      <RootTabHeader title={t("nav.more")} />

      <div className="pt-2 space-y-5">
        {/* Profile hero card — echoes the gradient promo banners on the Home page */}
        <IosSection>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#1f75fe] via-[#3b6ef7] to-[#4f46e5] px-4 py-5 shadow-[0_10px_30px_-12px_rgba(31,117,254,0.5)]">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/10 blur-2xl"
              />
              <div className="relative flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <div className="w-[68px] h-[68px] rounded-full overflow-hidden bg-white/15 flex items-center justify-center text-white font-bold text-[24px] ring-2 ring-white/40 transition-transform active:scale-95 duration-150">
                    {photoUrl ? (
                      <img
                        key={photoVersion}
                        src={photoUrl}
                        alt="avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-[24px] h-[24px] rounded-full bg-white flex items-center justify-center shadow-sm">
                    <Camera className="w-3.5 h-3.5 text-[#1f75fe]" />
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
                  <p className="font-extrabold text-[18px] text-white leading-tight truncate">
                    {user?.name}
                  </p>
                  <p className="text-[13px] text-white/70 truncate mt-0.5">
                    {phoneDisplay ?? user?.email}
                  </p>
                  {user?.role && (
                    <span className="inline-block mt-2 text-[11px] font-bold text-white uppercase tracking-wider bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full">
                      {t(`role.${user.role}`)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </IosSection>

        {/* Profile fields */}
        <IosSection title={t("settingsPage.profile")}>
          <IosGroup className={PROFILE_CARD_CLASS}>
            {profileItems.map((item) => {
              const row = (
                <IosGroupRow
                  as="div"
                  className={item.href ? "cursor-pointer hover:bg-[#faf8f4]" : undefined}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SettingsRowIcon img={item.img} />
                    <p className="text-sm text-[#0f172a]">{item.label}</p>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-[#64748b] truncate max-w-[150px]">
                      {item.value}
                    </span>
                    {item.href && (
                      <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                    )}
                  </div>
                </IosGroupRow>
              );

              if (!item.href) {
                return <div key={item.label}>{row}</div>;
              }

              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => setLocation(item.href!)}
                  className="w-full"
                >
                  {row}
                </button>
              );
            })}
          </IosGroup>
        </IosSection>

        <AppLockSettingsSection userName={user?.name ?? "User"} />

        <PushNotificationSettings />

        {/* Payroll for staff roles */}
        {(user?.role === "admin" || user?.role === "accountant" || user?.role === "warehouse") && (
          <IosSection title={t("payroll.mySalary")}>
            <IosGroup className={PROFILE_CARD_CLASS}>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e8e3d9]/60">
                <SettingsRowIcon img={PROFILE_ICONS.salary} />
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
            <IosGroup className={PROFILE_CARD_CLASS}>
              <IosGroupRow className="gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <SettingsRowIcon img={PROFILE_ICONS.language} />
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
                    <SettingsRowIcon img={PROFILE_ICONS.aiCredits} />
                    <span className="text-sm">{t("nav.aiCredits")}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                </IosGroupRow>
              )}

              {user?.role === "owner" && (
                <IosGroupRow onClick={() => setLocation("/logs")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <SettingsRowIcon img={PROFILE_ICONS.logs} />
                    <span className="text-sm">{t("nav.logs")}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94a3b8] shrink-0" />
                </IosGroupRow>
              )}
            </IosGroup>
          </IosSection>
        )}

        {/* Sign out */}
        <IosSection>
          <IosGroup className={PROFILE_CARD_CLASS}>
            <IosGroupRow
              as="button"
              onClick={() => logoutMutation.mutate()}
              className={cn(
                "justify-center gap-2.5",
                logoutMutation.isPending && "opacity-60 pointer-events-none",
              )}
            >
              <SettingsRowIcon img={PROFILE_ICONS.logout} className="w-7 h-7" />
              <span className="text-sm font-semibold text-[#dc2626]">
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
