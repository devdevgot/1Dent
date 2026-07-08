import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Globe, Eye, EyeOff, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    owner:      "bg-[#f5f3ff] text-[#7c3aed]",
    admin:      "bg-[#e0f2fe] text-[#0284c7]",
    doctor:     "bg-[#f0fdf4] text-[var(--success)]",
    accountant: "bg-[#fef3c7] text-[var(--warning)]",
    warehouse:  "bg-[var(--surface-2)] text-[var(--text-secondary)]",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-bold uppercase tracking-wide ${colors[role] ?? "bg-[var(--surface-2)] text-[var(--text-secondary)]"}`}>
      {t(`role.${role}`)}
    </span>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ds-border)]">
        <span className="text-[var(--ds-primary)]">{icon}</span>
        <h2 className="font-semibold text-base text-[var(--text)]">{title}</h2>
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
              <User className="w-5 h-5 text-[var(--ds-primary)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--text)]">{user?.name}</p>
              <p className="text-caption text-[var(--text-secondary)]">{user?.email}</p>
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
            <label className="block text-caption font-medium text-[var(--text-secondary)] mb-1">{t("settingsPage.currentPassword")}</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full h-10 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 pr-10 text-body text-[var(--text)] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-caption font-medium text-[var(--text-secondary)] mb-1">{t("settingsPage.newPassword")}</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 pr-10 text-body text-[var(--text)] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-caption font-medium text-[var(--text-secondary)] mb-1">{t("settingsPage.confirmPassword")}</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 pr-10 text-body text-[var(--text)] focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="w-full h-10 rounded-full bg-[#1f75fe] text-white text-body font-semibold hover:bg-[var(--primary-hover)] hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
          >
            {changePasswordMutation.isPending ? t("common.saving") : t("settingsPage.changePassword")}
          </button>
        </form>
      </Section>

      {/* Language */}
      <Section icon={<Globe className="w-5 h-5" />} title={t("settingsPage.language")}>
        <div className="flex gap-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className={cn(
                "flex-1 h-10 rounded-xl border text-body font-semibold transition-all",
                i18n.language === lang.code
                  ? "border-[#1f75fe] bg-[#1f75fe]/10 text-[var(--ds-primary)]"
                  : "border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text-secondary)] hover:border-[#1f75fe]/40",
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
