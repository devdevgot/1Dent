import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useChangePassword,
  useGetClinicContractSettings,
  useUpdateClinicContractSettings,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Globe, Eye, EyeOff, Settings2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    owner:      "bg-[#f5f3ff] text-[#7c3aed]",
    admin:      "bg-[#e0f2fe] text-[#0284c7]",
    doctor:     "bg-[#f0fdf4] text-[#16a34a]",
    accountant: "bg-[#fef3c7] text-[#d97706]",
    warehouse:  "bg-[#f1ede4] text-[#64748b]",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${colors[role] ?? "bg-[#f1ede4] text-[#64748b]"}`}>
      {t(`role.${role}`)}
    </span>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e8e3d9]">
        <span className="text-[#1f75fe]">{icon}</span>
        <h2 className="font-semibold text-base text-[#0f172a]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const changePasswordMutation = useChangePassword();

  const canEditContractSettings = user?.role === "owner" || user?.role === "admin";
  const { data: contractSettingsData, isLoading: contractSettingsLoading } = useGetClinicContractSettings({
    query: { enabled: canEditContractSettings },
  });
  const updateContractSettingsMutation = useUpdateClinicContractSettings();

  const [contractLegalName, setContractLegalName] = useState("");
  const [contractCity, setContractCity] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [contractLicense, setContractLicense] = useState("");
  const [contractDirector, setContractDirector] = useState("");

  useEffect(() => {
    const s = contractSettingsData?.data;
    if (!s) return;
    setContractLegalName(s.contractLegalName ?? "");
    setContractCity(s.contractCity ?? "");
    setContractAddress(s.contractAddress ?? "");
    setContractLicense(s.contractLicense ?? "");
    setContractDirector(s.contractDirector ?? "");
  }, [contractSettingsData]);

  const handleSaveContractSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateContractSettingsMutation.mutate(
      {
        contractLegalName: contractLegalName.trim() || null,
        contractCity: contractCity.trim() || null,
        contractAddress: contractAddress.trim() || null,
        contractLicense: contractLicense.trim() || null,
        contractDirector: contractDirector.trim() || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Данные для договоров сохранены" });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Ошибка сохранения";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t("settingsPage.passwordMismatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t("common.error", { defaultValue: "Ошибка" }), description: t("settingsPage.newPassword") + " min 6", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({ title: t("settingsPage.passwordChanged") });
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err: unknown) => {
          const apiErr = err as { data?: { error?: string; message?: string }; status?: number } | null;
          const errorText = apiErr?.data?.error ?? apiErr?.data?.message ?? "";
          const isWrongPassword = apiErr?.status === 400 && (
            errorText.toLowerCase().includes("incorrect") || errorText.toLowerCase().includes("current")
          );
          toast({
            title: isWrongPassword ? t("settingsPage.wrongPassword") : (errorText || t("common.error", { defaultValue: "Ошибка" })),
            variant: "destructive",
          });
        },
      },
    );
  };

  const languages = [
    { code: "ru", label: "RU" },
    { code: "en", label: "EN" },
    { code: "kz", label: "KZ" },
  ] as const;

  return (
    <PageShell>
      <PageHeader
        title={t("settingsPage.title")}
        icon={<Settings2 className="w-5 h-5" strokeWidth={1.8} />}
        onBack={() => window.history.back()}
      />
      <div className="px-4 py-6 pb-safe space-y-4 max-w-xl mx-auto">

      {/* Profile */}
      <Section icon={<User className="w-5 h-5" />} title={t("settingsPage.profile")}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[#1f75fe]" />
            </div>
            <div>
              <p className="font-semibold text-[#0f172a]">{user?.name}</p>
              <p className="text-xs text-[#64748b]">{user?.email}</p>
            </div>
          </div>
          {user?.role && (
            <div className="flex items-center gap-2">
              <RoleBadge role={user.role} />
            </div>
          )}
        </div>
      </Section>

      {/* Security */}
      <Section icon={<Shield className="w-5 h-5" />} title={t("settingsPage.security")}>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-[#64748b] mb-1">{t("settingsPage.currentPassword")}</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 pr-10 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">{t("settingsPage.newPassword")}</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 pr-10 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">{t("settingsPage.confirmPassword")}</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 pr-10 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="w-full h-10 rounded-full bg-[#1f75fe] text-white text-sm font-semibold hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
          >
            {changePasswordMutation.isPending ? t("common.saving") : t("settingsPage.changePassword")}
          </button>
        </form>
      </Section>

      {/* Clinic contract details — owner/admin only */}
      {canEditContractSettings && (
        <Section icon={<FileText className="w-5 h-5" />} title="Данные для договоров">
          <p className="text-xs text-[#64748b] mb-4">
            Юридические реквизиты клиники подставляются во встроенные шаблоны договоров.
          </p>
          {contractSettingsLoading ? (
            <p className="text-sm text-[#94a3b8]">{t("common.loading", { defaultValue: "Загрузка…" })}</p>
          ) : (
            <form onSubmit={handleSaveContractSettings} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Юридическое название</label>
                <input
                  type="text"
                  value={contractLegalName}
                  onChange={(e) => setContractLegalName(e.target.value)}
                  placeholder='ТОО «Стоматология Пример»'
                  className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Город</label>
                <input
                  type="text"
                  value={contractCity}
                  onChange={(e) => setContractCity(e.target.value)}
                  placeholder="г. Алматы"
                  className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Адрес</label>
                <input
                  type="text"
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  placeholder="г. Алматы, ул. Примерная, 1"
                  className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Номер лицензии</label>
                <input
                  type="text"
                  value={contractLicense}
                  onChange={(e) => setContractLicense(e.target.value)}
                  placeholder="18021758"
                  className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Директор</label>
                <input
                  type="text"
                  value={contractDirector}
                  onChange={(e) => setContractDirector(e.target.value)}
                  placeholder="Иванов И.И."
                  className="w-full h-10 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
                />
              </div>
              <button
                type="submit"
                disabled={updateContractSettingsMutation.isPending}
                className="w-full h-10 rounded-full bg-[#1f75fe] text-white text-sm font-semibold hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
              >
                {updateContractSettingsMutation.isPending ? t("common.saving") : "Сохранить"}
              </button>
            </form>
          )}
        </Section>
      )}

      {/* Language */}
      <Section icon={<Globe className="w-5 h-5" />} title={t("settingsPage.language")}>
        <div className="flex gap-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className={cn(
                "flex-1 h-10 rounded-xl border text-sm font-semibold transition-all",
                i18n.language === lang.code
                  ? "border-[#1f75fe] bg-[#1f75fe]/10 text-[#1f75fe]"
                  : "border-[#e8e3d9] bg-white text-[#64748b] hover:border-[#1f75fe]/40",
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </Section>

      </div>
    </PageShell>
  );
}
