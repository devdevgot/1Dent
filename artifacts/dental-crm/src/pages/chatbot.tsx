import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Settings,
  MessageSquare,
  Trash2,
  RefreshCw,
  Power,
  Save,
  ChevronLeft,
  ArrowLeft,
  Phone,
  Plus,
  Send,
  Sparkles,
  BookOpen,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  useGetChatbotSettings,
  useUpdateChatbotSettings,
  useListChatbotSessions,
  useDeleteChatbotSession,
  useGetChatbotSessionMessages,
  useListManagerExamples,
  useCreateManagerExample,
  useDeleteManagerExample,
  useTestChatbotMessage,
  reorderManagerExample,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate } from "@workspace/api-client-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useQueryClient } from "@tanstack/react-query";

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

const STEP_INSTRUCTION_FIELDS: { key: keyof NonNullable<ChatbotSettingsUpdate["stepInstructions"]>; label: string; hint: string }[] = [
  { key: "general", label: "Общие инструкции", hint: "Применяются ко всем этапам диалога" },
  { key: "greeting", label: "Приветствие", hint: "Как бот приветствует пациента" },
  { key: "collectName", label: "Сбор имени", hint: "Как бот запрашивает имя" },
  { key: "collectProblem", label: "Описание проблемы", hint: "Как бот уточняет запрос пациента" },
  { key: "suggestDoctor", label: "Предложение врача", hint: "Как бот представляет врача" },
  { key: "confirm", label: "Подтверждение записи", hint: "Как бот подтверждает запись" },
];

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

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// ─── Session conversation view ───────────────────────────────────────────────

function SessionChat({ phone, onBack }: { phone: string; onBack: () => void }) {
  const { data, isLoading, refetch } = useGetChatbotSessionMessages(phone);
  const messages = data?.data?.messages ?? [];

  let lastDate = "";

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
          <p className="text-xs text-muted-foreground">Чат-бот · {messages.length} сообщений</p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-muted/20">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Загрузка...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Сообщений пока нет</p>
          </div>
        ) : (
          messages.map((msg) => {
            const msgDate = formatDate(msg.createdAt);
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
                      {isBot ? "🤖 Бот" : "👤 Клиент"} · {formatTime(msg.createdAt)}
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

// ─── Manager Style tab ────────────────────────────────────────────────────────

function ManagerStyleTab() {
  const qc = useQueryClient();
  const { data: examplesRes, isLoading, refetch } = useListManagerExamples();
  const createExample = useCreateManagerExample();
  const deleteExample = useDeleteManagerExample();
  const testMessage = useTestChatbotMessage();

  const examples = examplesRes?.data?.examples ?? [];

  const [newUser, setNewUser] = useState("");
  const [newManager, setNewManager] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testState, setTestState] = useState("collect_problem");
  const [testReply, setTestReply] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newUser.trim() || !newManager.trim()) return;
    createExample.mutate(
      { userMessage: newUser.trim(), managerResponse: newManager.trim() },
      {
        onSuccess: () => {
          setNewUser("");
          setNewManager("");
          qc.invalidateQueries({ queryKey: ["/api/chatbot/manager-examples"] });
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteExample.mutate(id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/chatbot/manager-examples"] }),
    });
  };

  const handleReorder = async (id: string, direction: "up" | "down") => {
    const idx = examples.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= examples.length) return;
    setReordering(id);
    try {
      const swapItem = examples[swapIdx]!;
      const currentItem = examples[idx]!;
      await Promise.all([
        reorderManagerExample(id, swapItem.sortOrder),
        reorderManagerExample(swapItem.id, currentItem.sortOrder),
      ]);
      qc.invalidateQueries({ queryKey: ["/api/chatbot/manager-examples"] });
    } finally {
      setReordering(null);
    }
  };

  const handleTest = () => {
    if (!testInput.trim()) return;
    testMessage.mutate(
      { userMessage: testInput.trim(), state: testState },
      { onSuccess: (res) => setTestReply(res.data?.reply ?? null) },
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Примеры стиля менеджера</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Бот будет имитировать этот стиль общения при ответах
          </p>
        </div>
        {examples.length > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
            {examples.length} {examples.length === 1 ? "пример" : examples.length < 5 ? "примера" : "примеров"}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">Добавить пример</p>
        <div className="space-y-2">
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Сообщение пациента</label>
            <textarea
              rows={2}
              placeholder="Например: Хочу записаться на чистку зубов"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              className="mt-1 w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Ответ менеджера</label>
            <textarea
              rows={3}
              placeholder="Например: Здравствуйте! Рады записать вас на профессиональную чистку зубов. Позвольте уточнить несколько деталей..."
              value={newManager}
              onChange={(e) => setNewManager(e.target.value)}
              className="mt-1 w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newUser.trim() || !newManager.trim() || createExample.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {createExample.isPending ? "Добавление..." : "Добавить пример"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Загрузка...</div>
      ) : examples.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
          <BookOpen className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Примеры не добавлены</p>
          <p className="text-xs text-muted-foreground mt-1">
            Добавьте примеры — бот будет отвечать в том же стиле
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {examples.map((ex, idx) => (
            <div key={ex.id} className="rounded-xl border border-border/50 bg-card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-muted-foreground/60 mt-0.5 tabular-nums w-4 shrink-0">
                  {idx + 1}.
                </span>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground">👤 Пациент: </span>
                    <span className="text-xs text-foreground">{ex.userMessage}</span>
                  </div>
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-2.5 py-1.5">
                    <span className="text-[10px] font-medium text-violet-600">🤖 Менеджер: </span>
                    <span className="text-xs text-foreground">{ex.managerResponse}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => handleReorder(ex.id, "up")}
                    disabled={idx === 0 || reordering === ex.id}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleReorder(ex.id, "down")}
                    disabled={idx === examples.length - 1 || reordering === ex.id}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(ex.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="pt-1 flex justify-end">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              Обновить
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <p className="text-sm font-medium text-foreground">Тест AI-ответа</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Проверьте как бот ответит с текущими инструкциями и примерами стиля
        </p>
        <div className="flex items-center gap-2">
          <select
            value={testState}
            onChange={(e) => setTestState(e.target.value)}
            className="text-xs border border-border/50 rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 shrink-0"
          >
            <option value="greeting">Приветствие</option>
            <option value="collect_name">Сбор имени</option>
            <option value="collect_problem">Описание проблемы</option>
            <option value="suggest_doctor">Предложение врача</option>
            <option value="confirm_appointment">Подтверждение</option>
          </select>
          <span className="text-xs text-muted-foreground shrink-0">этап</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Введите тестовое сообщение пациента..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
            className="flex-1 text-sm border border-border/50 rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleTest}
            disabled={!testInput.trim() || testMessage.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0"
          >
            {testMessage.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Тест
          </button>
        </div>

        {testReply !== null && (
          <div className="rounded-lg bg-violet-50 border border-violet-100 p-3">
            <p className="text-[10px] font-medium text-violet-600 mb-1">🤖 Ответ бота:</p>
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{testReply}</p>
            <button
              onClick={() => setTestReply(null)}
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Удалить пример?"
        description="Этот пример стиля будет удалён. Бот перестанет его использовать."
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "settings" | "manager-style">("sessions");
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<ChatbotSettingsUpdate>({});
  const [saved, setSaved] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

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
    stepInstructions: localSettings.stepInstructions ?? settings?.stepInstructions ?? {},
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

  const setStepInstruction = (key: string, value: string) => {
    setLocalSettings((p) => ({
      ...p,
      stepInstructions: {
        ...(p.stepInstructions ?? effectiveSettings.stepInstructions),
        [key]: value,
      },
    }));
  };

  const isDirty = Object.keys(localSettings).length > 0;

  if (selectedPhone) {
    return <SessionChat phone={selectedPhone} onBack={() => setSelectedPhone(null)} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-gray-100 bg-background">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
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

        <div className="flex gap-1 mt-3 overflow-x-auto pb-0.5">
          <button
            onClick={() => setTab("sessions")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
              tab === "sessions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("chatbot.tab.sessions")}
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
              tab === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            {t("chatbot.tab.settings")}
          </button>
          <button
            onClick={() => setTab("manager-style")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
              tab === "manager-style" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("chatbot.tab.managerStyle")}
          </button>
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
                              .filter(([k, v]) => v && k !== "refCode" && k !== "channelId" && k !== "confusedCount")
                              .map(([k, v]) => {
                                const labels: Record<string, string> = {
                                  patientName: "Имя",
                                  problemDescription: "Проблема",
                                  suggestedDoctorName: "Врач",
                                };
                                return `${labels[k] ?? k}: ${v}`;
                              })
                              .join(" · ")}
                        </p>
                      )}
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-1 rotate-180" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmResetPhone(session.phone); }}
                      title={t("chatbot.resetSession")}
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

            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-foreground">{t("chatbot.settings.aiInstructions")}</h3>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                {t("chatbot.settings.aiInstructionsDesc")}
              </p>

              {STEP_INSTRUCTION_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="space-y-1.5">
                  <div>
                    <label className="text-xs font-medium text-foreground">{label}</label>
                    <p className="text-[11px] text-muted-foreground">{hint}</p>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Оставьте пустым для использования стандартных инструкций..."
                    value={(effectiveSettings.stepInstructions as Record<string, string>)?.[key] ?? ""}
                    onChange={(e) => setStepInstruction(key, e.target.value)}
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

        {tab === "manager-style" && <ManagerStyleTab />}
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
