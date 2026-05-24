import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import { useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Globe, Eye, EyeOff, Settings2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchesSettings } from "@/components/settings/branches-settings";

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    owner:      "bg-purple-100 text-purple-700",
    admin:      "bg-blue-100 text-blue-700",
    doctor:     "bg-emerald-100 text-emerald-700",
    accountant: "bg-amber-100 text-amber-700",
    warehouse:  "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${colors[role] ?? "bg-slate-100 text-slate-700"}`}>
      {t(`role.${role}`)}
    </span>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <span className="text-primary">{icon}</span>
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
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
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900">{t("settingsPage.title")}</h1>
        </div>
      </div>
      <div className="px-4 py-6 pb-safe space-y-4 max-w-xl mx-auto">

      {/* Profile */}
      <Section icon={<User className="w-5 h-5" />} title={t("settingsPage.profile")}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t("settingsPage.currentPassword")}</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full h-10 rounded-xl border border-border bg-background px-3 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t("settingsPage.newPassword")}</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t("settingsPage.confirmPassword")}</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
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
                "flex-1 h-10 rounded-xl border text-sm font-semibold transition-all",
                i18n.language === lang.code
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Branches & Geo-zones — owner only */}
      {user?.role === "owner" && <BranchesSettings />}

      </div>
    </div>
  );
}
