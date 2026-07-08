import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Settings,
  MessageSquare,
  Trash2,
  RefreshCw,
  Power,
  ChevronRight,
  ArrowLeft,
  Phone,
  Megaphone,
  AlertCircle,
  Loader2,
  FlaskConical,
  BookOpen,
  Sparkles,
  BarChart3,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ListRowsSkeleton, ChatMessagesSkeleton } from "@/components/skeletons";
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
  getGetChatbotSettingsQueryKey,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate, DentalBroadcastRun, GetChatbotSettings200 } from "@workspace/api-client-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Switch } from "@/components/ui/switch";
import { KnowledgeAndScriptModal } from "@/components/chatbot/knowledge-tab";
import { PlaygroundTab } from "@/components/chatbot/playground-tab";
import { ChatbotCalendarAbSettings } from "@/components/chatbot/calendar-ab-settings";
import { ChatbotAnalyticsTab } from "@/components/chatbot/analytics-tab";
import { ManagerExamplesTab } from "@/components/chatbot/manager-examples-tab";
import type { ScriptMindMapData } from "@/components/chatbot/script-mindmap";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FSM_STATE_LABELS } from "@/lib/chatbot-fsm-states";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-error-message";


const STATE_COLORS: Record<string, string> = {
  greeting: "bg-[#e0f2fe] text-[#0284c7] border-[#e0f2fe]",
  collect_name: "bg-[#1f75fe]/10 text-[var(--ds-primary)] border-[#1f75fe]/20",
  collect_problem: "bg-[#fef3c7] text-[var(--warning)] border-[#fef3c7]",
  suggest_doctor: "bg-[#e0f2fe] text-[#0284c7] border-[#e0f2fe]",
  confirm_appointment: "bg-[#fef3c7] text-[var(--warning)] border-[#fef3c7]",
  done: "bg-[#f0fdf4] text-[var(--success)] border-[#f0fdf4]",
  human_takeover: "bg-[#fef2f2] text-[var(--danger)] border-[#fef2f2]",
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
  const { data, isLoading, isError, refetch } = useGetChatbotSessionMessages(phone);
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
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-[var(--ds-border)] bg-[var(--ds-surface)]">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] transition-colors text-[var(--text-secondary)] shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="h-8 w-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center">
          <Phone className="h-3.5 w-3.5 text-[var(--ds-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body font-semibold text-[var(--text)] truncate">{phone}</p>
          <p className="text-caption text-[var(--text-secondary)]">
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
          className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[var(--bg)]">
        {isLoading ? (
          <ChatMessagesSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-[var(--danger)]/60" />
            <p className="text-body text-[var(--text-secondary)]">{t("chatbot.loadError", "Не удалось загрузить сообщения")}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-caption font-medium text-[var(--ds-primary)] hover:underline"
            >
              {t("common.retry", "Повторить")}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-[var(--text-subtle)]/40" />
            <p className="text-body text-[var(--text-secondary)]">{t("chatbot.noMessages", "Сообщений пока нет")}</p>
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
                    <div className="flex-1 h-px bg-[#e8e3d9]" />
                    <span className="text-[10px] text-[var(--text-subtle)] font-medium">{msgDate}</span>
                    <div className="flex-1 h-px bg-[#e8e3d9]" />
                  </div>
                )}
                <div className={`flex ${isBot ? "justify-start" : "justify-end"} mb-1`}>
                  <div className="max-w-[80%] group">
                    <div
                      className={`px-3 py-2 rounded-2xl text-body leading-relaxed whitespace-pre-wrap ${
                        isBot
                          ? "bg-[var(--ds-surface)] border border-[var(--ds-border)] text-[var(--text)] rounded-tl-sm"
                          : "bg-[#1f75fe] text-white rounded-tr-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <p className={`text-[10px] text-[var(--text-subtle)] mt-0.5 ${isBot ? "text-left pl-1" : "text-right pr-1"}`}>
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
  pending: "bg-[#fef3c7] text-[var(--warning)] border-[#fef3c7]",
  running: "bg-[#e0f2fe] text-[#0284c7] border-[#e0f2fe]",
  completed: "bg-[#f0fdf4] text-[var(--success)] border-[#f0fdf4]",
  failed: "bg-[#fef2f2] text-[var(--danger)] border-[#fef2f2]",
};

const BROADCAST_MESSAGE_PREVIEW =
  "Здравствуйте, Анна 👋\n" +
  "У вас остались зубы, которые ещё требуют лечения:\n\n" +
  "🦷 Зуб 16 — кариес\n" +
  "🦷 Зуб 26 — требует коронки\n\n" +
  "Если отложить лечение, кариес углубится до нерва — и тогда вместо простой пломбы потребуется более сложная и дорогостоящая процедура 😔\n\n" +
  "Ваш план лечения сохранён.\n" +
  "Напишите «Продолжить», и мы подберём удобное время 🤍";

function AiBroadcastTab() {
  const { i18n } = useTranslation();
  const lang = i18n.language || "ru";
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const settingsQueryKey = getGetChatbotSettingsQueryKey();
  const { data: settingsRes } = useGetChatbotSettings();
  const updateSettings = useUpdateChatbotSettings();
  const settings = settingsRes?.data?.settings;
  const chatbotEnabled = settings?.enabled ?? true;
  const broadcastAiEnabled = settings?.broadcastAiEnabled ?? false;

  const handleToggleBroadcastAi = (checked: boolean) => {
    const previous = queryClient.getQueryData<GetChatbotSettings200>(settingsQueryKey);

    queryClient.setQueryData<GetChatbotSettings200>(settingsQueryKey, (old) => {
      if (!old?.data?.settings) return old;
      return {
        ...old,
        data: {
          ...old.data,
          settings: { ...old.data.settings, broadcastAiEnabled: checked },
        },
      };
    });

    updateSettings.mutate(
      { data: { broadcastAiEnabled: checked } },
      {
        onSuccess: (response) => {
          const saved = response?.data?.settings?.broadcastAiEnabled;
          if (saved === undefined) return;
          queryClient.setQueryData<GetChatbotSettings200>(settingsQueryKey, (old) => {
            if (!old?.data?.settings) return old;
            return {
              ...old,
              data: {
                ...old.data,
                settings: { ...old.data.settings, broadcastAiEnabled: saved },
              },
            };
          });
        },
        onError: (err) => {
          queryClient.setQueryData(settingsQueryKey, previous);
          toast.error(
            getApiErrorMessage(err as { data?: unknown; message?: string }, "Не удалось сохранить настройку"),
          );
        },
      },
    );
  };
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
      onError: (err) => {
        toast.error(
          getApiErrorMessage(err as { data?: unknown; message?: string }, "Не удалось запустить рассылку"),
        );
      },
    },
  });

  const progressPercent =
    latestRun && latestRun.totalPatients > 0
      ? Math.round((latestRun.processedPatients / latestRun.totalPatients) * 100)
      : 0;

  const formatCompletedAt = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return `${formatDate(dateStr, lang)}, ${formatTime(dateStr, lang)}`;
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
            <Megaphone className="h-4 w-4 text-[var(--ds-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-[var(--text)]">Рассылка по WhatsApp</p>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">
              {broadcastAiEnabled
                ? "ИИ формирует персональное сообщение по зубной карте и плану лечения для пациентов с нелечёными находками. При ошибке или нехватке кредитов используется шаблон."
                : "Формирует персональное сообщение по данным зубной карты и плана лечения для пациентов с нелечёными находками. Текст собирается по шаблону."}{" "}
              Автоматически запускается 15-го числа и в последний день месяца.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--ds-border)]/60">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-[#7c3aed] shrink-0" />
            <div>
              <p className="text-caption font-medium text-[var(--text)]">ИИ-генерация текста</p>
              <p className="text-[11px] text-[var(--text-subtle)]">2 кредита за сообщение · fallback на шаблон</p>
            </div>
          </div>
          <Switch
            checked={broadcastAiEnabled}
            onCheckedChange={handleToggleBroadcastAi}
            disabled={updateSettings.isPending}
            aria-label="ИИ-генерация текста рассылки"
            className={cn(
              "h-6 w-11 shrink-0 border-transparent shadow-none transition-colors duration-200 ease-out",
              "data-[state=checked]:bg-[#7c3aed] data-[state=unchecked]:bg-[#cbd5e1]",
              "[&>span]:h-5 [&>span]:w-5 [&>span]:bg-[var(--ds-surface)] [&>span]:shadow",
              "[&>span]:transition-transform [&>span]:duration-200 [&>span]:ease-out",
              "[&>span]:data-[state=checked]:translate-x-5 [&>span]:data-[state=unchecked]:translate-x-0.5",
            )}
          />
        </div>
      </div>

      {!chatbotEnabled && (
        <div className="rounded-2xl border border-[#fef3c7] bg-[#fef3c7] p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[var(--warning)] shrink-0 mt-0.5" />
          <div>
            <p className="text-body font-medium text-[var(--warning)]">Чатбот выключен</p>
            <p className="text-caption text-[var(--warning)] mt-0.5">
              Чатбот выключен: ответы пациентов не будут обработаны автоматически. Рассылку можно отправить, но пациенты, написавшие «Продолжить», не получат автоматический ответ.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md p-4 space-y-2">
        <p className="text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Пример сообщения</p>
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--bg)] px-3 py-2.5">
          <p className="text-body leading-relaxed text-[var(--text)] whitespace-pre-wrap">{BROADCAST_MESSAGE_PREVIEW}</p>
        </div>
        <p className="text-[11px] text-[var(--text-subtle)]">
          Имя, зубы и формулировки подставляются из карты пациента и плана лечения.
        </p>
      </div>

      {latestRun && !isRunning && (
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body font-medium text-[var(--text)]">Последний запуск</p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[latestRun.status]}`}>
              {latestRun.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {STATUS_LABEL[latestRun.status]}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--ds-border)] px-3 py-2.5 text-center">
              <p className="text-lg font-semibold text-[var(--text)]">{latestRun.messagesSent}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">Отправлено</p>
            </div>
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--ds-border)] px-3 py-2.5 text-center">
              <p className="text-lg font-semibold text-[#059669]">
                {latestRun.replyRate ?? 0}%
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">
                Ответили ({latestRun.repliesCount ?? 0})
              </p>
            </div>
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--ds-border)] px-3 py-2.5 text-center">
              <p className="text-lg font-semibold text-[#2563eb]">
                {latestRun.bookingRate ?? 0}%
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">
                Записались ({latestRun.bookingsCount ?? 0})
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--ds-border)] px-3 py-2.5 text-center">
              <p className={`text-lg font-semibold ${latestRun.errorsCount > 0 ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
                {latestRun.errorsCount}
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">Ошибок</p>
            </div>
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--ds-border)] px-3 py-2.5 text-center">
              <p className="text-caption font-semibold text-[var(--text)] leading-tight">{formatCompletedAt(latestRun.completedAt)}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wide">Завершено</p>
            </div>
          </div>
        </div>
      )}

      {isRunning && latestRun && (
        <div className="rounded-2xl border border-[#e0f2fe] bg-[#e0f2fe] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-[#0284c7] animate-spin" />
            <p className="text-body font-medium text-[#0284c7]">Рассылка выполняется…</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-caption text-[#0284c7]">
              <span>Обработано {latestRun.processedPatients} из {latestRun.totalPatients} пациентов</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#1f75fe]/20 overflow-hidden">
              <div className="h-full rounded-full bg-[#1f75fe] transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <p className="text-caption text-[#0284c7]">Отправлено сообщений: {latestRun.messagesSent}</p>
        </div>
      )}

      {latestRun?.status === "failed" && (
        <div className="rounded-2xl border border-[#fef2f2] bg-[#fef2f2] p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[var(--danger)] shrink-0 mt-0.5" />
          <div>
            <p className="text-body font-medium text-[var(--danger)]">Рассылка завершилась с ошибкой</p>
            <p className="text-caption text-[var(--danger)] mt-0.5">Попробуйте запустить снова.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-caption text-[var(--text-secondary)]">История запусков</p>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isRunning || trigger.isPending}
          className="flex items-center gap-1.5 text-caption px-4 py-2 rounded-full font-semibold bg-[#1f75fe] text-white hover:bg-[var(--primary-hover)] hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {trigger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
          Запустить рассылку
        </button>
      </div>

      {isLoading ? (
        <ListRowsSkeleton rows={4} avatar={false} card />
      ) : runs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--bg)] p-10 text-center">
          <Megaphone className="h-8 w-8 text-[var(--text-subtle)]/40 mx-auto mb-2" />
          <p className="text-body text-[var(--text-secondary)]">Рассылки ещё не проводились</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--ds-border)] bg-[var(--bg)]">
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Дата</th>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Статус</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Охвачено</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Отправлено</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Ответы</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Записи</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Ошибок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e3d9]">
              {(runs as DentalBroadcastRun[]).map((run) => (
                <tr key={run.id} className="hover:bg-[var(--bg)] transition-colors">
                  <td className="px-4 py-2.5 text-[var(--text)]">{formatDate(run.startedAt, lang)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[run.status]}`}>
                      {run.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                    {run.status === "running" ? `${run.processedPatients}/${run.totalPatients}` : run.totalPatients}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text)] font-medium">{run.messagesSent}</td>
                  <td className="px-4 py-2.5 text-right text-[#059669] font-medium">
                    {run.repliesCount ?? 0}
                    <span className="text-[var(--text-subtle)] font-normal ml-1">({run.replyRate ?? 0}%)</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#2563eb] font-medium">
                    {run.bookingsCount ?? 0}
                    <span className="text-[var(--text-subtle)] font-normal ml-1">({run.bookingRate ?? 0}%)</span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-medium ${run.errorsCount > 0 ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
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
          <div className="bg-[var(--ds-surface)] rounded-2xl shadow-xl border border-[var(--ds-border)] p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#fef3c7] flex items-center justify-center shrink-0">
                <Megaphone className="h-4 w-4 text-[var(--warning)]" />
              </div>
              <div>
                <p className="text-body font-semibold text-[var(--text)]">Запустить рассылку?</p>
                <p className="text-caption text-[var(--text-secondary)] mt-1">
                  {broadcastAiEnabled
                    ? "Пациенты с нелечёными находками получат персональное WhatsApp-сообщение, сгенерированное ИИ (2 кредита/сообщение)."
                    : "Пациенты с нелечёными находками получат персональное WhatsApp-сообщение по шаблону."}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="text-caption px-3 py-2 rounded-xl font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors">
                Отмена
              </button>
              <button
                onClick={() => trigger.mutate()}
                disabled={trigger.isPending}
                className="flex items-center gap-1.5 text-caption px-4 py-2 rounded-full font-semibold bg-[#1f75fe] text-white hover:bg-[var(--primary-hover)] hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
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
  const [tab, setTab] = useState<"sessions" | "settings" | "playground" | "ai-broadcast" | "analytics" | "examples">("sessions");
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

  // Seed local settings from server once loaded
  useEffect(() => {
    if (!settings) return;
    setLocalSettings((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return {
        enabled: settings.enabled,
        calendarConfig: settings.calendarConfig,
        abTestEnabled: settings.abTestEnabled,
        scriptVariants: settings.scriptVariants,
      };
    });
    setSavedSettings((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return {
        enabled: settings.enabled,
        calendarConfig: settings.calendarConfig,
        abTestEnabled: settings.abTestEnabled,
        scriptVariants: settings.scriptVariants,
      };
    });
  }, [settings]);

  // Autosave for enabled toggle
  useEffect(() => {
    const isDirty = Object.keys(localSettings).some(
      (k) => JSON.stringify((localSettings as Record<string, unknown>)[k]) !== JSON.stringify((savedSettings as Record<string, unknown>)[k]),
    );
    if (!isDirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const toSave = { ...localSettings };
      if (toSave.calendarConfig) {
        toSave.calendarConfig = {
          ...(settings?.calendarConfig ?? {}),
          ...(savedSettings.calendarConfig ?? {}),
          ...toSave.calendarConfig,
        };
      }
      setAutosaveStatus("saving");
      updateSettings.mutate(
        { data: toSave },
        {
          onSuccess: () => {
            setSavedSettings((prev) => ({ ...prev, ...toSave }));
            setAutosaveStatus("saved");
            setTimeout(() => setAutosaveStatus("idle"), 2000);
            void refetchSettings();
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
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title={t("chatbot.title")}
        subtitle={t("chatbot.subtitle")}
        onBack={() => window.history.back()}
        right={
          <div className={cn(
            "flex items-center gap-1.5 text-caption px-2.5 py-1 rounded-full border font-medium",
            effectiveEnabled ? "bg-[#f0fdf4] text-[var(--success)] border-[#f0fdf4]" : "bg-[#fef2f2] text-[var(--danger)] border-[#fef2f2]",
          )}>
            <Power className="h-3 w-3" />
            {effectiveEnabled ? t("chatbot.enabled") : t("chatbot.disabled")}
          </div>
        }
        bottom={
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {([
              { key: "sessions", label: t("chatbot.tab.sessions"), icon: MessageSquare },
              { key: "settings", label: t("chatbot.tab.settings"), icon: Settings },
              { key: "playground", label: "Playground", icon: FlaskConical },
              { key: "ai-broadcast", label: "ИИ Рассылка", icon: Megaphone },
              { key: "analytics", label: "Аналитика", icon: BarChart3 },
              { key: "examples", label: "Примеры", icon: Users },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0",
                  tab === key ? "bg-[var(--primary-light)] text-[var(--ds-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className={cn("flex-1 p-4 min-h-0", tab === "playground" ? "overflow-hidden flex flex-col" : "overflow-y-auto")}>

        {/* Sessions tab */}
        {tab === "sessions" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-caption text-[var(--text-secondary)]">
                {t("chatbot.activeSessions")}: <span className="font-semibold text-[var(--text)]">{sessions.length}</span>
              </p>
              <button onClick={() => refetchSessions()} className="flex items-center gap-1 text-caption text-[var(--text-secondary)] hover:text-[var(--text)]">
                <RefreshCw className="h-3 w-3" />
                {t("common.refresh")}
              </button>
            </div>

            {sessionsLoading ? (
              <ListRowsSkeleton rows={5} avatar card />
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--bg)] p-10 text-center">
                <Bot className="h-8 w-8 text-[var(--text-subtle)]/40 mx-auto mb-2" />
                <p className="text-body text-[var(--text-secondary)]">{t("chatbot.sessionsEmpty")}</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e8e3d9] rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md overflow-hidden">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPhone(session.phone)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedPhone(session.phone);
                      }
                    }}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg)] active:bg-[var(--surface-2)] transition-colors text-left cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-[var(--text)] truncate">{session.phone}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border", STATE_COLORS[session.state] ?? "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--ds-border)]")}>
                          {t(`chatbot.states.${session.state}`, FSM_STATE_LABELS[session.state] ?? session.state)}
                        </span>
                        <span className="text-[10px] text-[var(--text-subtle)]">{formatRelative(session.updatedAt, lang)}</span>
                        {session.humanTakeover && (
                          <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#fef2f2] text-[var(--danger)] border border-[#fef2f2]">
                            {t("chatbot.operatorMode")}
                          </span>
                        )}
                      </div>
                      {session.data && (
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                          {getSessionSummary(session.data, t)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] shrink-0 mt-1" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmResetPhone(session.phone); }}
                      className="shrink-0 p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[#fef2f2] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings tab — Script blocks */}
        {tab === "settings" && (
          <div className="space-y-4 max-w-2xl">

            {/* Bot on/off */}
            <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md p-4">
              <div className="flex items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="text-body font-medium text-[var(--text)]">{t("chatbot.settings.enableBot")}</p>
                  <p className="text-caption text-[var(--text-secondary)]">{t("chatbot.settings.enableBotDesc")}</p>
                </div>
                <button
                  onClick={() => setLocalSettings((p) => ({ ...p, enabled: !effectiveEnabled }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none",
                    effectiveEnabled ? "bg-[var(--success)]" : "bg-[#94a3b8]/40",
                  )}
                >
                  <span className={cn("inline-block h-4 w-4 rounded-full bg-[var(--ds-surface)] shadow transition-transform", effectiveEnabled ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
              {autosaveStatus !== "idle" && (
                <p className={cn("text-caption mt-2", autosaveStatus === "saved" ? "text-[var(--success)]" : "text-[var(--text-secondary)]")}>
                  {autosaveStatus === "saving" ? "Сохранение…" : "Сохранено"}
                </p>
              )}
            </div>

            {/* Combined knowledge + script button */}
            <button
              onClick={() => setCombinedOpen(true)}
              className="w-full flex items-center gap-3 rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-md p-4 hover:bg-[var(--bg)] transition-colors text-left"
            >
              <BookOpen className="h-4 w-4 text-[var(--ds-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-[var(--text)]">База знаний и скрипт</p>
                <p className="text-caption text-[var(--text-secondary)] mt-0.5 truncate">
                  Ссылки, файлы и визуальный сценарий разговора
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] shrink-0" />
            </button>

            <ChatbotCalendarAbSettings
              localSettings={localSettings}
              serverCalendarConfig={settings?.calendarConfig}
              onChange={(patch) => setLocalSettings((p) => ({ ...p, ...patch }))}
            />

          </div>
        )}

        {tab === "playground" && <PlaygroundTab />}
        {tab === "ai-broadcast" && <AiBroadcastTab />}
        {tab === "analytics" && <ChatbotAnalyticsTab />}
        {tab === "examples" && <ManagerExamplesTab />}
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
    </PageShell>
  );
}
