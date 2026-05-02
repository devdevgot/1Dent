import { useState, useEffect, useRef } from "react";
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
  Send,
  Sparkles,
  X,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FlaskConical,
} from "lucide-react";
import {
  useGetChatbotSettings,
  useUpdateChatbotSettings,
  useListChatbotSessions,
  useDeleteChatbotSession,
  useGetChatbotSessionMessages,
  useTestChatbotMessage,
  useListDentalBroadcastRuns,
  useTriggerDentalBroadcast,
  listDentalBroadcastRunsQueryKey,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate, DentalBroadcastRun } from "@workspace/api-client-react";
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

const STEP_INSTRUCTION_KEYS: Array<{
  key: keyof NonNullable<ChatbotSettingsUpdate["stepInstructions"]>;
  labelKey: string;
  hintKey: string;
  defaultText: string;
}> = [
  {
    key: "general",
    labelKey: "chatbot.settings.stepFields.general.label",
    hintKey: "chatbot.settings.stepFields.general.hint",
    defaultText: "Ты — вежливый и профессиональный AI-ассистент стоматологической клиники 1Dent (Казахстан). Отвечай коротко и по делу. Используй простой, дружелюбный язык. Не ставь диагнозы. Отвечай на том языке, на котором пишет пациент (русский, казахский или английский).",
  },
  {
    key: "greeting",
    labelKey: "chatbot.settings.stepFields.greeting.label",
    hintKey: "chatbot.settings.stepFields.greeting.hint",
    defaultText: "Поприветствуй пациента и попроси ввести ИИН (12 цифр) — это обязательный шаг для идентификации.",
  },
  {
    key: "collectName",
    labelKey: "chatbot.settings.stepFields.collectName.label",
    hintKey: "chatbot.settings.stepFields.collectName.hint",
    defaultText: "Пациент новый. Спроси его имя вежливо и жди ответа. Если написал что-то непонятное — мягко уточни.",
  },
  {
    key: "collectProblem",
    labelKey: "chatbot.settings.stepFields.collectProblem.label",
    hintKey: "chatbot.settings.stepFields.collectProblem.hint",
    defaultText: "Ты знаешь имя пациента. Узнай с какой проблемой или за какой услугой он обращается. Задавай уточняющие вопросы если нужно.",
  },
  {
    key: "suggestDoctor",
    labelKey: "chatbot.settings.stepFields.suggestDoctor.label",
    hintKey: "chatbot.settings.stepFields.suggestDoctor.hint",
    defaultText: "Ты подобрал врача на основе запроса пациента. Представь врача по имени и предложи запись к нему. Спроси подтверждение: «Да» или «Нет».",
  },
  {
    key: "confirm",
    labelKey: "chatbot.settings.stepFields.confirm.label",
    hintKey: "chatbot.settings.stepFields.confirm.hint",
    defaultText: "Пациент согласился на запись. Спроси удобную дату и время визита. Покажи ближайшие свободные слоты врача.",
  },
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
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Загрузка...
          </div>
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

// ─── Playground tab ───────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "bot"; text: string };

function PlaygroundTab() {
  const testMessage = useTestChatbotMessage();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [testState, setTestState] = useState("collect_problem");
  const [showWarning, setShowWarning] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, testMessage.isPending]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || testMessage.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    testMessage.mutate(
      { userMessage: text, state: testState },
      {
        onSuccess: (res) => {
          setMessages((prev) => [...prev, { role: "bot", text: res.data?.reply ?? "..." }]);
        },
        onError: () => {
          setMessages((prev) => [...prev, { role: "bot", text: "Ошибка. Попробуйте ещё раз." }]);
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {showWarning && (
        <div className="shrink-0 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 flex-1">
            Каждое сообщение в Playground расходует кредиты AI-модели — так же как реальное сообщение от клиента.
          </p>
          <button onClick={() => setShowWarning(false)} className="text-amber-500 hover:text-amber-700 shrink-0 ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Этап FSM:</span>
        <select
          value={testState}
          onChange={(e) => setTestState(e.target.value)}
          className="text-xs border border-border/50 rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 flex-1"
        >
          <option value="greeting">Приветствие</option>
          <option value="collect_name">Сбор имени</option>
          <option value="collect_problem">Описание проблемы</option>
          <option value="suggest_doctor">Предложение врача</option>
          <option value="confirm_appointment">Подтверждение</option>
        </select>
        <button
          onClick={() => { setMessages([]); setInput(""); }}
          disabled={messages.length === 0}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-muted/20 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center mb-3">
                <Bot className="h-6 w-6 text-violet-500" />
              </div>
              <p className="text-sm font-medium text-foreground">Playground готов</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Напишите сообщение чтобы протестировать ответы бота с текущими инструкциями
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "bot" && (
                <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mr-2 mt-1">
                  <Bot className="h-3.5 w-3.5 text-violet-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-white border border-border/50 text-foreground rounded-tl-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {testMessage.isPending && (
            <div className="flex justify-start">
              <div className="h-6 w-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mr-2 mt-1">
                <Bot className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <div className="bg-white border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-border/50 bg-background px-3 py-2.5 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Напишите сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            className="flex-1 text-sm border border-border/50 rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || testMessage.isPending}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md shadow-violet-200 disabled:opacity-40 shrink-0 transition-opacity"
          >
            {testMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const { data, isLoading } = useListDentalBroadcastRuns(20);
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
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
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
              Отправлено сообщений: <strong>{latestRun.messagesSent}</strong>
              {latestRun.errorsCount > 0 && (
                <> · Ошибок: <strong>{latestRun.errorsCount}</strong></>
              )}
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
          {trigger.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Megaphone className="h-3.5 w-3.5" />
          )}
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
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-foreground">{formatDate(run.startedAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[run.status]}`}>
                      {run.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {STATUS_LABEL[run.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {run.status === "running"
                      ? `${run.processedPatients}/${run.totalPatients}`
                      : run.totalPatients}
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
                <Megaphone className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Запустить рассылку?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Пациенты с тревожными находками по зубной карте получат персональное WhatsApp-сообщение. Пациенты без проблем не будут затронуты.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="text-xs px-3 py-1.5 rounded-md font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
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
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "settings" | "manager-style" | "ai-broadcast">("sessions");
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<ChatbotSettingsUpdate>({});
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounced autosave: fires 1500ms after the last local change
  useEffect(() => {
    if (Object.keys(localSettings).length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      setAutosaveStatus("saving");
      updateSettings.mutate(
        { data: localSettings },
        {
          onSuccess: () => {
            setLocalSettings({});
            refetchSettings();
            setAutosaveStatus("saved");
            setTimeout(() => setAutosaveStatus("idle"), 2000);
          },
          onError: () => setAutosaveStatus("idle"),
        },
      );
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSettings]);

  const handleSaveNow = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (Object.keys(localSettings).length === 0) return;
    setAutosaveStatus("saving");
    updateSettings.mutate(
      { data: localSettings },
      {
        onSuccess: () => {
          setLocalSettings({});
          refetchSettings();
          setAutosaveStatus("saved");
          setTimeout(() => setAutosaveStatus("idle"), 2000);
        },
        onError: () => setAutosaveStatus("idle"),
      },
    );
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
            <FlaskConical className="h-3.5 w-3.5" />
            Playground
          </button>
          <button
            onClick={() => setTab("ai-broadcast")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-colors shrink-0 ${
              tab === "ai-broadcast" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Megaphone className="h-3.5 w-3.5" />
            ИИ Рассылка
          </button>
        </div>
      </div>

      <div className={`flex-1 p-4 min-h-0 ${tab === "manager-style" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
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
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-foreground">{t("chatbot.settings.aiInstructions")}</h3>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                {t("chatbot.settings.aiInstructionsDesc")}
              </p>

              <div className="border-t border-border/40 pt-4 space-y-4">
                {STEP_INSTRUCTION_KEYS.map(({ key, labelKey, hintKey, defaultText }) => (
                  <div key={key} className="space-y-1.5">
                    <div>
                      <label className="text-xs font-medium text-foreground">{t(labelKey)}</label>
                      <p className="text-[11px] text-muted-foreground">{t(hintKey)}</p>
                    </div>
                    <textarea
                      rows={3}
                      value={(effectiveSettings.stepInstructions as Record<string, string>)?.[key] ?? defaultText}
                      onChange={(e) => setStepInstruction(key, e.target.value)}
                      className="w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <div>
                    <label className="text-xs font-medium text-foreground">{t("chatbot.settings.followup3h")}</label>
                    <p className="text-[11px] text-muted-foreground">{t("chatbot.settings.followup3hHint")}</p>
                  </div>
                  <textarea
                    rows={3}
                    value={effectiveSettings.followup24hTemplate}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, followup24hTemplate: e.target.value }))}
                    className="w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveNow}
                disabled={!isDirty || autosaveStatus === "saving"}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {autosaveStatus === "saving" ? t("common.saving") : t("common.save")}
              </button>
              {autosaveStatus === "saving" && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {t("common.saving")}
                </span>
              )}
              {autosaveStatus === "saved" && (
                <span className="text-xs text-emerald-600 font-medium">{t("common.saved")}</span>
              )}
              {isDirty && autosaveStatus === "idle" && (
                <span className="text-xs text-muted-foreground">{t("common.unsaved") || "Несохранённые изменения"}</span>
              )}
            </div>
          </div>
        )}

        {tab === "manager-style" && <PlaygroundTab />}

        {tab === "ai-broadcast" && <AiBroadcastTab />}
      </div>

      <ConfirmDeleteDialog
        open={!!confirmResetPhone}
        onConfirm={() => { if (confirmResetPhone) { handleResetSession(confirmResetPhone); } setConfirmResetPhone(null); }}
        onCancel={() => setConfirmResetPhone(null)}
        title={t("chatbot.resetSession")}
        description="Состояние чат-бота для этого номера будет сброшено. Пациент снова получит приветственное сообщение."
      />
    </div>
  );
}
