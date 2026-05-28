import { useState, useEffect, useRef } from "react";
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
  Send,
  X,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FlaskConical,
  Hand,
  Search,
  MessageCircle,
  Calendar,
  Bell,
  Heart,
  BookOpen,
  GitBranch,
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
import { KnowledgeModal } from "@/components/chatbot/knowledge-tab";
import { ScriptMindMapModal, type ScriptMindMapData } from "@/components/chatbot/script-mindmap";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";


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

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// ─── Session conversation view ────────────────────────────────────────────────

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

// ─── Playground tab ───────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "bot"; text: string };

function PlaygroundTab() {
  const testMessage = useTestChatbotMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, testMessage.isPending]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboardOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (containerRef.current) {
        containerRef.current.style.paddingBottom = keyboardOffset > 0 ? `${keyboardOffset}px` : "";
      }
      if (keyboardOffset > 0) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || testMessage.isPending) return;
    const updatedMessages = [...messages, { role: "user" as const, text }];
    setMessages(updatedMessages);
    setInput("");
    const history = updatedMessages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    testMessage.mutate({ userMessage: text, history } as any, {
      onSuccess: (res) => setMessages((prev) => [...prev, { role: "bot", text: res.data?.reply ?? "..." }]),
      onError: () => setMessages((prev) => [...prev, { role: "bot", text: "Ошибка. Попробуйте ещё раз." }]),
    });
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col gap-3">
      {/* Simulation banner */}
      <div className="shrink-0 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
        <FlaskConical className="h-3.5 w-3.5 text-violet-600 shrink-0" />
        <p className="text-xs text-violet-800 flex-1">
          <span className="font-semibold">Симуляция</span> — бот работает точно как в WhatsApp, но реальные записи не создаются
        </p>
        <button
          onClick={() => { setMessages([]); setInput(""); }}
          disabled={messages.length === 0}
          className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors shrink-0 ml-1"
        >
          <RefreshCw className="h-3 w-3" />
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
                Напишите как пациент — бот ответит точно по вашему скрипту
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
            placeholder="Напишите как пациент..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            className="flex-1 text-sm border border-border/50 rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || testMessage.isPending}
            className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0"
          >
            {testMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
                  <td className="px-4 py-2.5 text-foreground">{formatDate(run.startedAt)}</td>
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
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "settings" | "manager-style" | "ai-broadcast">("sessions");
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [mindMapOpen, setMindMapOpen] = useState(false);
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

  const handleSaveMindMap = (data: ScriptMindMapData) => {
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
  };

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
            { key: "settings", label: t("chatbot.tab.settings"), icon: Settings },
            { key: "manager-style", label: "Playground", icon: FlaskConical },
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
      <div className={cn("flex-1 p-4 min-h-0", tab === "manager-style" ? "overflow-hidden flex flex-col" : "overflow-y-auto")}>

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
                          {STATE_LABELS[session.state] ?? session.state}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatRelative(session.updatedAt)}</span>
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
                                const labels: Record<string, string> = { patientName: "Имя", problemDescription: "Проблема", suggestedDoctorName: "Врач" };
                                return `${labels[k] ?? k}: ${v}`;
                              })
                              .join(" · ")}
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

            {/* Knowledge base button */}
            <button
              onClick={() => setKnowledgeOpen(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">База знаний</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">Ссылки и файлы — чат-бот отвечает на основе этих данных</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            {/* Script mind map button */}
            <button
              onClick={() => setMindMapOpen(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Скрипт диалога</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {settings?.scriptMindMap?.nodes?.length
                    ? `${settings.scriptMindMap.nodes.length} шагов · визуальное ветвление`
                    : "Визуальный редактор сценария разговора"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

          </div>
        )}

        {tab === "manager-style" && <PlaygroundTab />}
        {tab === "ai-broadcast" && <AiBroadcastTab />}
      </div>

      {/* Knowledge base modal */}
      <KnowledgeModal open={knowledgeOpen} onClose={() => setKnowledgeOpen(false)} />

      {/* Script mind map modal */}
      <ScriptMindMapModal
        open={mindMapOpen}
        onClose={() => { setMindMapOpen(false); setMindMapSaveStatus("idle"); }}
        initialData={settings?.scriptMindMap}
        onSave={handleSaveMindMap}
        saveStatus={mindMapSaveStatus}
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
