import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Settings,
  MessageSquare,
  Trash2,
  RefreshCw,
  Power,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Phone,
  Megaphone,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FlaskConical,
  MessageCircle,
  BookOpen,
} from "lucide-react";
import {
  useGetChatbotSettings,
  useUpdateChatbotSettings,
  useListChatbotSessions,
  useDeleteChatbotSession,
  useGetChatbotSessionMessages,
  usePatchChatbotSessionTakeover,
  useListDentalBroadcastRuns,
  useTriggerDentalBroadcast,
  listDentalBroadcastRunsQueryKey,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate, DentalBroadcastRun } from "@workspace/api-client-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { KnowledgeAndScriptModal } from "@/components/chatbot/knowledge-tab";
import { PlaygroundTab } from "@/components/chatbot/playground-tab";
import { ManagerExamplesTab } from "@/components/chatbot/manager-examples-tab";
import { ChatbotAnalyticsTab } from "@/components/chatbot/analytics-tab";
import { ChatbotCalendarAbSettings } from "@/components/chatbot/calendar-ab-settings";
import type { ScriptMindMapData } from "@/components/chatbot/script-mindmap";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FSM_STATE_LABELS } from "@/lib/chatbot-fsm-states";


const STATE_COLORS: Record<string, string> = {
  greeting: "bg-blue-50 text-blue-700 border-blue-100",
  collect_name: "bg-violet-50 text-violet-700 border-violet-100",
  collect_problem: "bg-amber-50 text-amber-700 border-amber-100",
  suggest_doctor: "bg-indigo-50 text-indigo-700 border-indigo-100",
  confirm_appointment: "bg-orange-50 text-orange-700 border-orange-100",
  done: "bg-emerald-50 text-emerald-700 border-emerald-100",
  human_takeover: "bg-red-50 text-red-700 border-red-100",
};

function formatRelative(dateStr: string, lang: string = "ru") {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const isEn = lang.startsWith("en");
  const isKz = lang.startsWith("kk") || lang.startsWith("kz");

  if (mins < 1) {
    if (isEn) return "just now";
    if (isKz) return "жаңа ғана";
    return "только что";
  }
  if (mins < 60) {
    if (isEn) return `${mins}m ago`;
    if (isKz) return `${mins} мин бұрын`;
    return `${mins} мин. назад`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    if (isEn) return `${hrs}h ago`;
    if (isKz) return `${hrs} сағ бұрын`;
    return `${hrs} ч. назад`;
  }
  const days = Math.floor(hrs / 24);
  if (isEn) return `${days}d ago`;
  if (isKz) return `${days} күн бұрын`;
  return `${days} д. назад`;
}

function formatTime(dateStr: string, lang: string = "ru") {
  const locale = lang.startsWith("en") ? "en-US" : lang.startsWith("kk") || lang.startsWith("kz") ? "kk-KZ" : "ru-RU";
  return new Date(dateStr).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string, lang: string = "ru") {
  const locale = lang.startsWith("en") ? "en-US" : lang.startsWith("kk") || lang.startsWith("kz") ? "kk-KZ" : "ru-RU";
  return new Date(dateStr).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function getSessionSummary(data: any, t: any): string {
  if (!data || typeof data !== "object") return "";

  const parts: string[] = [];

  // 1. Patient Name
  if (data.patientName) {
    parts.push(`${t("chatbot.dataFields.patientName", "Имя")}: ${data.patientName}`);
  }

  // 2. IIN
  if (data.collectedIin) {
    parts.push(`${t("chatbot.dataFields.collectedIin", "ИИН")}: ${data.collectedIin}`);
  }

  // 3. Phone
  if (data.collectedPhone) {
    parts.push(`${t("chatbot.dataFields.collectedPhone", "Телефон")}: ${data.collectedPhone}`);
  }

  // 4. Problem
  if (data.problemDescription) {
    parts.push(`${t("chatbot.dataFields.problemDescription", "Проблема")}: ${data.problemDescription}`);
  }

  // 5. Doctor
  if (data.suggestedDoctorName) {
    parts.push(`${t("chatbot.dataFields.suggestedDoctorName", "Врач")}: ${data.suggestedDoctorName}`);
  }

  // 6. Branch
  if (data.selectedBranch) {
    parts.push(`${t("chatbot.dataFields.selectedBranch", "Филиал")}: ${data.selectedBranch}`);
  }

  // 7. Preferred Datetime
  if (data.preferredDatetime) {
    parts.push(`${t("chatbot.dataFields.preferredDatetime", "Время")}: ${data.preferredDatetime}`);
  }

  // 8. Urgency
  if (data.urgency) {
    parts.push(`${t("chatbot.dataFields.urgency", "Срочность")}: ${data.urgency}`);
  }

  // 9. Service Type
  if (data.serviceType) {
    parts.push(`${t("chatbot.dataFields.serviceType", "Тип услуги")}: ${data.serviceType}`);
  }

  // 10. Inactivity reminder
  if (data.inactivityReminderSent) {
    parts.push(t("chatbot.dataFields.inactivityReminderSent", "Напоминание о неактивности отправлено"));
  }

  // 11. Reschedule
  if (data.isReschedule) {
    parts.push(t("chatbot.dataFields.isReschedule", "Перенос записи"));
  }

  // 12. Ad click ID
  if (data.clickId) {
    parts.push(`${t("chatbot.dataFields.clickId", "Переход с рекламы")}: ${data.clickId}`);
  }

  // 13. Patient Type
  if (data.patientType) {
    parts.push(`${t("chatbot.dataFields.patientType", "Тип пациента")}: ${data.patientType}`);
  }

  // 14. AI Confidence
  if (data.aiConfidence) {
    parts.push(`${t("chatbot.dataFields.aiConfidence", "Уверенность ИИ")}: ${data.aiConfidence}`);
  }

  return parts.join(" · ");
}

// ─── Session conversation view ────────────────────────────────────────────────

function SessionChat({ phone, onBack }: { phone: string; onBack: () => void }) {
  const { data, isLoading, refetch } = useGetChatbotSessionMessages(phone);
  const { data: sessionsData, refetch: refetchSessions } = useListChatbotSessions();
  const takeoverMutation = usePatchChatbotSessionTakeover();
  const messages = data?.data?.messages ?? [];
  const session = sessionsData?.data?.sessions?.find((s) => s.phone === phone);
  const humanTakeover = session?.humanTakeover ?? false;
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "ru";
  let lastDate = "";

  const toggleTakeover = () => {
    takeoverMutation.mutate(
      { phone, takeover: !humanTakeover },
      { onSuccess: () => refetchSessions() },
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-background">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center">
          <Phone className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{phone}</p>
          <p className="text-xs text-muted-foreground">
            {t("chatbot.title", "AI-чатбот")} · {t("chatbot.messagesCount", "{{count}} сообщений").replace("{{count}}", String(messages.length))}
            {humanTakeover && ` · ${t("chatbot.operatorMode", "Оператор")}`}
          </p>
        </div>
        <button
          onClick={toggleTakeover}
          disabled={takeoverMutation.isPending}
          className={cn(
            "text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors shrink-0",
            humanTakeover
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
          )}
        >
          {humanTakeover ? t("chatbot.resumeBot", "Включить бота") : t("chatbot.takeoverBot", "Взять диалог")}
        </button>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-muted/20">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t("chatbot.loading", "Загрузка...")}</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("chatbot.noMessages", "Сообщений пока нет")}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const msgDate = formatDate(msg.createdAt, lang);
            const showDateSep = msgDate !== lastDate;
            lastDate = msgDate;
            const isBot = msg.direction === "outbound";
            return (
              <div key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[10px] text-muted-foreground font-medium">{msgDate}</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}
                <div className={`flex ${isBot ? "justify-start" : "justify-end"} mb-1`}>
                  <div className="max-w-[80%] group">
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        isBot
                          ? "bg-white border border-border/50 text-foreground rounded-tl-sm"
                          : "bg-primary text-primary-foreground rounded-tr-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 ${isBot ? "text-left pl-1" : "text-right pr-1"}`}>
                      {isBot ? t("chatbot.botLabel", "🤖 Бот") : t("chatbot.clientLabel", "👤 Клиент")} · {formatTime(msg.createdAt, lang)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Playground imported from @/components/chatbot/playground-tab ─────────────

// ─── AI Broadcast Tab ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DentalBroadcastRun["status"], string> = {
  pending: "Ожидание",
  running: "В процессе",
  completed: "Завершено",
  failed: "Ошибка",
};

const STATUS_COLOR: Record<DentalBroadcastRun["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  running: "bg-blue-50 text-blue-700 border-blue-100",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  failed: "bg-red-50 text-red-700 border-red-100",
};

function AiBroadcastTab() {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const { data, isLoading } = useListDentalBroadcastRuns(20, {
    query: {
      refetchInterval: (query) => {
        const runs = (query.state.data as { data?: { runs?: { status: string }[] } } | undefined)?.data?.runs ?? [];
        return runs.some((r) => r.status === "running") ? 3000 : false;
      },
    },
  });
  const runs = data?.data?.runs ?? [];
  const latestRun = runs[0] ?? null;
  const isRunning = latestRun?.status === "running";

  const trigger = useTriggerDentalBroadcast({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: listDentalBroadcastRunsQueryKey() });
        setShowConfirm(false);
      },
    },
  });

  const progressPercent =
    latestRun && latestRun.totalPatients > 0
      ? Math.round((latestRun.processedPatients / latestRun.totalPatients) * 100)
      : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Megaphone className="h-4 w-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">ИИ-рассылка по WhatsApp</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Анализирует зубную карту каждого пациента с помощью ИИ и отправляет персональное сообщение тем, у кого есть тревожные находки. Автоматически запускается 15-го числа и в последний день месяца.
            </p>
          </div>
        </div>
      </div>

      {isRunning && latestRun && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-blue-800">Рассылка выполняется…</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-blue-700">
              <span>Обработано {latestRun.processedPatients} из {latestRun.totalPatients} пациентов</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <p className="text-xs text-blue-600">Отправлено сообщений: {latestRun.messagesSent}</p>
        </div>
      )}

      {latestRun?.status === "completed" && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Рассылка завершена</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Отправлено: <strong>{latestRun.messagesSent}</strong>
              {latestRun.errorsCount > 0 && <> · Ошибок: <strong>{latestRun.errorsCount}</strong></>}
            </p>
          </div>
        </div>
      )}

      {latestRun?.status === "failed" && (
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Рассылка завершилась с ошибкой</p>
            <p className="text-xs text-red-700 mt-0.5">Попробуйте запустить снова.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">История запусков</p>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isRunning || trigger.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {trigger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
          Запустить рассылку
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Загрузка…</div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-10 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Рассылки ещё не проводились</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Дата</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Статус</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Охвачено</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Отправлено</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ошибок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(runs as DentalBroadcastRun[]).map((run) => (
                <tr key={run.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-foreground">{formatDate(run.startedAt, lang)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[run.status]}`}>
                      {run.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {run.status === "running" ? `${run.processedPatients}/${run.totalPatients}` : run.totalPatients}
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground font-medium">{run.messagesSent}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${run.errorsCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {run.errorsCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-2xl shadow-xl border border-border/50 p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Megaphone className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Запустить рассылку?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Пациенты с тревожными находками по зубной карте получат персональное WhatsApp-сообщение.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="text-xs px-3 py-1.5 rounded-md font-medium text-muted-foreground hover:bg-muted transition-colors">
                Отмена
              </button>
              <button
                onClick={() => trigger.mutate()}
                disabled={trigger.isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {trigger.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Запустить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "ru";
  const [tab, setTab] = useState<"sessions" | "settings" | "analytics" | "playground" | "manager-style" | "ai-broadcast">("sessions");
  const [combinedOpen, setCombinedOpen] = useState(false);
  const [mindMapSaveStatus, setMindMapSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<ChatbotSettingsUpdate>({});
  const [savedSettings, setSavedSettings] = useState<ChatbotSettingsUpdate>({});
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: settingsRes, refetch: refetchSettings } = useGetChatbotSettings();
  const { data: sessionsRes, refetch: refetchSessions, isLoading: sessionsLoading } = useListChatbotSessions();
  const updateSettings = useUpdateChatbotSettings();
  const deleteSession = useDeleteChatbotSession();

  const settings = settingsRes?.data?.settings;
  const sessions = sessionsRes?.data?.sessions ?? [];

  const effectiveEnabled = localSettings.enabled ?? settings?.enabled ?? true;

  // Autosave for enabled toggle
  useEffect(() => {
    const isDirty = Object.keys(localSettings).some(
      (k) => JSON.stringify((localSettings as Record<string, unknown>)[k]) !== JSON.stringify((savedSettings as Record<string, unknown>)[k]),
    );
    if (!isDirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const toSave = { ...localSettings };
      setAutosaveStatus("saving");
      updateSettings.mutate(
        { data: toSave },
        {
          onSuccess: () => {
            setSavedSettings((prev) => ({ ...prev, ...toSave }));
            setAutosaveStatus("saved");
            setTimeout(() => setAutosaveStatus("idle"), 2000);
          },
          onError: () => setAutosaveStatus("idle"),
        },
      );
    }, 800);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSettings]);

  const handleSaveMindMap = useCallback((data: ScriptMindMapData) => {
    setMindMapSaveStatus("saving");
    updateSettings.mutate(
      { data: { scriptMindMap: data } as ChatbotSettingsUpdate },
      {
        onSuccess: () => {
          setMindMapSaveStatus("saved");
          setTimeout(() => setMindMapSaveStatus("idle"), 2000);
          refetchSettings();
        },
        onError: () => setMindMapSaveStatus("idle"),
      },
    );
  }, [updateSettings, refetchSettings]);

  const handleDeleteSession = (phone: string) => {
    deleteSession.mutate({ phone }, { onSuccess: () => refetchSessions() });
  };

  if (selectedPhone) {
    return <SessionChat phone={selectedPhone} onBack={() => setSelectedPhone(null)} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900">{t("chatbot.title")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("chatbot.subtitle")}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium",
              effectiveEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100",
            )}>
              <Power className="h-3 w-3" />
              {effectiveEnabled ? t("chatbot.enabled") : t("chatbot.disabled")}
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-3 overflow-x-auto pb-0.5">
          {([
            { key: "sessions", label: t("chatbot.tab.sessions"), icon: MessageSquare },
            { key: "analytics", label: "Аналитика", icon: BarChart3 },
            { key: "settings", label: t("chatbot.tab.settings"), icon: Settings },
            { key: "playground", label: "Playground", icon: FlaskConical },
            { key: "manager-style", label: "Стиль", icon: MessageCircle },
            { key: "ai-broadcast", label: "ИИ Рассылка", icon: Megaphone },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0",
                tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className={cn("flex-1 p-4 min-h-0", tab === "playground" ? "overflow-hidden flex flex-col" : "overflow-y-auto")}>

        {/* Sessions tab */}
        {tab === "sessions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t("chatbot.activeSessions")}: <span className="font-semibold text-foreground">{sessions.length}</span>
              </p>
              <button onClick={() => refetchSessions()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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
                  <button
                    key={session.id}
                    onClick={() => setSelectedPhone(session.phone)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{session.phone}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border", STATE_COLORS[session.state] ?? "bg-muted text-muted-foreground border-border")}>
                          {t(`chatbot.states.${session.state}`, FSM_STATE_LABELS[session.state] ?? session.state)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatRelative(session.updatedAt, lang)}</span>
                        {session.humanTakeover && (
                          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                            {t("chatbot.operatorMode")}
                          </span>
                        )}
                      </div>
                      {session.data && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {getSessionSummary(session.data, t)}
                        </p>
                      )}
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-1 rotate-180" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmResetPhone(session.phone); }}
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings tab — Script blocks */}
        {tab === "settings" && (
          <div className="space-y-4 max-w-2xl">

            {/* Bot on/off */}
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("chatbot.settings.enableBot")}</p>
                  <p className="text-xs text-muted-foreground">{t("chatbot.settings.enableBotDesc")}</p>
                </div>
                <button
                  onClick={() => setLocalSettings((p) => ({ ...p, enabled: !effectiveEnabled }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none",
                    effectiveEnabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                >
                  <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", effectiveEnabled ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
              {autosaveStatus !== "idle" && (
                <p className={cn("text-xs mt-2", autosaveStatus === "saved" ? "text-emerald-600" : "text-muted-foreground")}>
                  {autosaveStatus === "saving" ? "Сохранение…" : "Сохранено"}
                </p>
              )}
            </div>

            {/* Combined knowledge + script button */}
            <button
              onClick={() => setCombinedOpen(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">База знаний и скрипт</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Ссылки, файлы и визуальный сценарий разговора
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            <ChatbotCalendarAbSettings
              localSettings={localSettings}
              onChange={(patch) => setLocalSettings((p) => ({ ...p, ...patch }))}
            />

            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Тексты и инструкции</p>
              <label className="block text-xs text-muted-foreground">
                Приветствие (шаблон)
                <textarea
                  className="mt-1 w-full text-sm border border-border/50 rounded-lg px-3 py-2 min-h-[72px]"
                  value={localSettings.greetingTemplate ?? settings?.greetingTemplate ?? ""}
                  onChange={(e) => setLocalSettings((p) => ({ ...p, greetingTemplate: e.target.value }))}
                />
              </label>
              {(
                [
                  ["followup24hTemplate", "Follow-up 24ч"],
                  ["followup72hTemplate", "Follow-up 72ч"],
                  ["followup168hTemplate", "Follow-up 168ч"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-muted-foreground">
                  {label}
                  <input
                    type="text"
                    className="mt-1 w-full text-sm border border-border/50 rounded-lg px-3 py-2"
                    value={(localSettings[key] as string | undefined) ?? (settings?.[key] as string | undefined) ?? ""}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </label>
              ))}
              {(
                [
                  ["general", "Общие инструкции"],
                  ["greeting", "Этап: приветствие"],
                  ["collectName", "Этап: имя"],
                  ["collectProblem", "Этап: проблема"],
                  ["suggestDoctor", "Этап: врач"],
                  ["confirm", "Этап: подтверждение"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-muted-foreground">
                  {label}
                  <textarea
                    className="mt-1 w-full text-sm border border-border/50 rounded-lg px-3 py-2 min-h-[56px]"
                    value={
                      (localSettings.stepInstructions as Record<string, string> | undefined)?.[key]
                      ?? (settings?.stepInstructions as Record<string, string> | undefined)?.[key]
                      ?? ""
                    }
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        stepInstructions: {
                          ...(p.stepInstructions ?? settings?.stepInstructions ?? {}),
                          [key]: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </div>

          </div>
        )}

        {tab === "analytics" && <ChatbotAnalyticsTab />}

        {tab === "playground" && <PlaygroundTab />}
        {tab === "manager-style" && <ManagerExamplesTab />}
        {tab === "ai-broadcast" && <AiBroadcastTab />}
      </div>

      {/* Combined knowledge + script modal */}
      <KnowledgeAndScriptModal
        open={combinedOpen}
        onClose={() => { setCombinedOpen(false); setMindMapSaveStatus("idle"); }}
        initialMindMapData={settings?.scriptMindMap}
        onSaveMindMap={handleSaveMindMap}
        mindMapSaveStatus={mindMapSaveStatus}
      />

      <ConfirmDeleteDialog
        open={!!confirmResetPhone}
        onConfirm={() => { if (confirmResetPhone) handleDeleteSession(confirmResetPhone); setConfirmResetPhone(null); }}
        onCancel={() => setConfirmResetPhone(null)}
        title={t("chatbot.resetSession")}
        description="Состояние чат-бота для этого номера будет сброшено. Пациент снова получит приветственное сообщение."
      />
    </div>
  );
}
