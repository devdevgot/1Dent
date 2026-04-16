import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Settings, MessageSquare, Trash2, RefreshCw, Power, Save } from "lucide-react";
import {
  useGetChatbotSettings,
  useUpdateChatbotSettings,
  useListChatbotSessions,
  useDeleteChatbotSession,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate } from "@workspace/api-client-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

const STATE_LABELS: Record<string, string> = {
  greeting: "Приветствие",
  collect_name: "Сбор имени",
  collect_problem: "Сбор проблемы",
  suggest_doctor: "Предложение врача",
  confirm_appointment: "Подтверждение",
  done: "Завершено",
  human_takeover: "Оператор",
};

const STATE_COLORS: Record<string, string> = {
  greeting: "bg-blue-50 text-blue-700 border-blue-100",
  collect_name: "bg-violet-50 text-violet-700 border-violet-100",
  collect_problem: "bg-amber-50 text-amber-700 border-amber-100",
  suggest_doctor: "bg-indigo-50 text-indigo-700 border-indigo-100",
  confirm_appointment: "bg-orange-50 text-orange-700 border-orange-100",
  done: "bg-emerald-50 text-emerald-700 border-emerald-100",
  human_takeover: "bg-red-50 text-red-700 border-red-100",
};

function formatRelative(dateStr: string) {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  return `${Math.floor(hrs / 24)} д. назад`;
}

export default function ChatbotPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "settings">("sessions");
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<ChatbotSettingsUpdate>({});
  const [saved, setSaved] = useState(false);

  const { data: settingsRes, refetch: refetchSettings } = useGetChatbotSettings();
  const { data: sessionsRes, refetch: refetchSessions, isLoading: sessionsLoading } = useListChatbotSessions();
  const updateSettings = useUpdateChatbotSettings();
  const deleteSession = useDeleteChatbotSession();

  const settings = settingsRes?.data?.settings;
  const sessions = sessionsRes?.data?.sessions ?? [];

  const effectiveSettings = {
    enabled: localSettings.enabled ?? settings?.enabled ?? true,
    greetingTemplate: localSettings.greetingTemplate ?? settings?.greetingTemplate ?? "",
    followup24hTemplate: localSettings.followup24hTemplate ?? settings?.followup24hTemplate ?? "",
    followup72hTemplate: localSettings.followup72hTemplate ?? settings?.followup72hTemplate ?? "",
    followup168hTemplate: localSettings.followup168hTemplate ?? settings?.followup168hTemplate ?? "",
  };

  const handleSave = () => {
    updateSettings.mutate({ data: localSettings }, {
      onSuccess: () => {
        setSaved(true);
        setLocalSettings({});
        refetchSettings();
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const handleResetSession = (phone: string) => {
    deleteSession.mutate({ phone }, { onSuccess: () => refetchSessions() });
  };

  const isDirty = Object.keys(localSettings).length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/50 bg-background">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Bot className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">{t("chatbot.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("chatbot.subtitle")}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
              effectiveSettings.enabled
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-red-50 text-red-700 border-red-100"
            }`}>
              <Power className="h-3 w-3" />
              {effectiveSettings.enabled ? t("chatbot.enabled") : t("chatbot.disabled")}
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-3">
          {(["sessions", "settings"] as const).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                tab === t_
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t_ === "sessions" ? (
                <><MessageSquare className="h-3.5 w-3.5" />{t("chatbot.tab.sessions")}</>
              ) : (
                <><Settings className="h-3.5 w-3.5" />{t("chatbot.tab.settings")}</>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "sessions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t("chatbot.activeSessions")}: <span className="font-semibold text-foreground">{sessions.length}</span>
              </p>
              <button
                onClick={() => refetchSessions()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
                {t("common.refresh")}
              </button>
            </div>

            {sessionsLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
            ) : sessions.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-10 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("chatbot.sessionsEmpty")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 rounded-xl border border-border/50 bg-card overflow-hidden">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{session.phone}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          STATE_COLORS[session.state] ?? "bg-muted text-muted-foreground border-border"
                        }`}>
                          {STATE_LABELS[session.state] ?? session.state}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelative(session.updatedAt)}
                        </span>
                        {session.humanTakeover && (
                          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                            {t("chatbot.operatorMode")}
                          </span>
                        )}
                      </div>
                      {session.data && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {typeof session.data === "object" &&
                            Object.entries(session.data as Record<string, string>)
                              .filter(([, v]) => v)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmResetPhone(session.phone)}
                      title={t("chatbot.resetSession")}
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4 max-w-2xl">
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("chatbot.settings.enableBot")}</p>
                  <p className="text-xs text-muted-foreground">{t("chatbot.settings.enableBotDesc")}</p>
                </div>
                <button
                  onClick={() => setLocalSettings((p) => ({ ...p, enabled: !effectiveSettings.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    effectiveSettings.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      effectiveSettings.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t("chatbot.settings.templates")}</h3>

              {[
                { key: "greetingTemplate" as const, label: t("chatbot.settings.greetingTemplate") },
                { key: "followup24hTemplate" as const, label: t("chatbot.settings.followup24h") },
                { key: "followup72hTemplate" as const, label: t("chatbot.settings.followup72h") },
                { key: "followup168hTemplate" as const, label: t("chatbot.settings.followup168h") },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{label}</label>
                  <textarea
                    rows={3}
                    value={effectiveSettings[key]}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={!isDirty || updateSettings.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {updateSettings.isPending ? t("common.saving") : t("common.save")}
              </button>
              {saved && (
                <span className="text-xs text-emerald-600 font-medium">{t("common.saved")}</span>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDeleteDialog
        open={!!confirmResetPhone}
        onConfirm={() => { if (confirmResetPhone) { handleResetSession(confirmResetPhone); } setConfirmResetPhone(null); }}
        onCancel={() => setConfirmResetPhone(null)}
        title="Сбросить сессию?"
        description="Состояние чат-бота для этого номера будет сброшено. Пациент снова получит приветственное сообщение."
      />
    </div>
  );
}
