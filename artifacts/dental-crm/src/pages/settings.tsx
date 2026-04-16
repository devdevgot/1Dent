import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useChangePassword,
  useGetConditionPrices,
  useUpdateConditionPrices,
  getGetConditionPricesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { User, Shield, Palette, Globe, Eye, EyeOff, DollarSign, Radio, Settings2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelsSettings } from "@/components/channels/channels-settings";

const CONDITION_LABELS: Record<string, string> = {
  healthy: "Здоров",
  cavity: "Кариес",
  treated: "Пролечен",
  crown: "Коронка",
  root_canal: "Канал",
  implant: "Имплант",
  missing: "Отсутствует",
  extraction_needed: "Удаление",
};


const ALL_CONDITIONS = [
  "healthy", "cavity", "treated", "crown",
  "root_canal", "implant", "missing", "extraction_needed",
];

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

function ConditionPricesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pricesData, isLoading } = useGetConditionPrices();
  const updateMutation = useUpdateConditionPrices();

  const [localPrices, setLocalPrices] = useState<Record<string, string>>({});
  const [localMkb10, setLocalMkb10] = useState<Record<string, string>>({});

  useEffect(() => {
    if (pricesData?.data?.prices) {
      const priceMap: Record<string, string> = {};
      const mkbMap: Record<string, string> = {};
      for (const cond of ALL_CONDITIONS) {
        const entry = pricesData.data.prices[cond];
        priceMap[cond] = String(entry?.price ?? 0);
        mkbMap[cond] = entry?.mkb10 ?? "";
      }
      setLocalPrices(priceMap);
      setLocalMkb10(mkbMap);
    }
  }, [pricesData]);

  const handleSave = () => {
    const prices: Record<string, { price: number; mkb10Code?: string }> = {};
    for (const cond of ALL_CONDITIONS) {
      const num = parseFloat(localPrices[cond] ?? "0");
      prices[cond] = {
        price: isNaN(num) ? 0 : num,
        mkb10Code: localMkb10[cond] ?? "",
      };
    }
    updateMutation.mutate(
      { data: { prices } },
      {
        onSuccess: () => {
          toast({ title: "Цены и МКБ-10 сохранены" });
          queryClient.invalidateQueries({ queryKey: getGetConditionPricesQueryKey() });
        },
        onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        МКБ-10 коды и цены синхронизируются — изменения здесь отображаются в карточке зуба и плане лечения.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left pb-2 font-medium">Состояние</th>
              <th className="text-left pb-2 font-medium pl-2">МКБ-10</th>
              <th className="text-right pb-2 font-medium">Цена (₸)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {ALL_CONDITIONS.map((cond) => (
              <tr key={cond}>
                <td className="py-2 text-sm font-medium text-foreground pr-2 whitespace-nowrap">
                  {CONDITION_LABELS[cond] ?? cond}
                </td>
                <td className="py-2 pl-2">
                  <input
                    type="text"
                    value={localMkb10[cond] ?? ""}
                    onChange={(e) =>
                      setLocalMkb10((prev) => ({ ...prev, [cond]: e.target.value }))
                    }
                    placeholder="K02.1"
                    className="w-20 h-8 rounded-lg border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={localPrices[cond] ?? "0"}
                    onChange={(e) =>
                      setLocalPrices((prev) => ({ ...prev, [cond]: e.target.value }))
                    }
                    className="w-28 h-8 rounded-lg border border-border bg-background px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {updateMutation.isPending ? "Сохранение..." : "Сохранить МКБ-10 и цены"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
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

  const themes = [
    { value: "light", label: t("settingsPage.themeLight"), icon: "☀️" },
    { value: "system", label: t("settingsPage.themeSystem"), icon: "🖥" },
    { value: "dark", label: t("settingsPage.themeDark"), icon: "🌙" },
  ] as const;

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

      {/* Appearance */}
      <Section icon={<Palette className="w-5 h-5" />} title={t("settingsPage.appearance")}>
        <div className="flex gap-2">
          {themes.map((t_) => (
            <button
              key={t_.value}
              onClick={() => setTheme(t_.value)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all",
                theme === t_.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              <span className="text-lg">{t_.icon}</span>
              <span>{t_.label}</span>
            </button>
          ))}
        </div>
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

      {/* Condition prices — owner/admin only */}
      {(user?.role === "owner" || user?.role === "admin") && (
        <Section icon={<DollarSign className="w-5 h-5" />} title="Цены по состоянию зуба">
          <ConditionPricesSection />
        </Section>
      )}

      {/* Channels — visible to owner/admin only */}
      {(user?.role === "owner" || user?.role === "admin") && (
        <Section icon={<Radio className="w-5 h-5" />} title={t("channels.sectionTitle")}>
          <p className="text-xs text-muted-foreground mb-4">{t("channels.sectionDesc")}</p>
          <ChannelsSettings />
        </Section>
      )}
      </div>
    </div>
  );
}
