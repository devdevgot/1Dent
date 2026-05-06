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
  ArrowLeft,
  Phone,
  Send,
  X,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FlaskConical,
  ChevronDown,
  Check,
  Upload,
  Wand2,
  FileText,
  ClipboardList,
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
  useGetStandardScriptBlocks,
  useParseScript,
} from "@workspace/api-client-react";
import type { ChatbotSettingsUpdate, DentalBroadcastRun, ScriptBlock } from "@workspace/api-client-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
  const [showWarning, setShowWarning] = useState(true);
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
    testMessage.mutate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userMessage: text, history } as any,
      {
        onSuccess: (res) => setMessages((prev) => [...prev, { role: "bot", text: res.data?.reply ?? "..." }]),
        onError: () => setMessages((prev) => [...prev, { role: "bot", text: "Ошибка. Попробуйте ещё раз." }]),
      },
    );
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col gap-3">
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

      <div className="shrink-0 flex items-center justify-end">
        <button
          onClick={() => { setMessages([]); setInput(""); }}
          disabled={messages.length === 0}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Новый диалог
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
                Напишите сообщение — бот сам ведёт диалог от приветствия до записи
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

// ─── Script block card ────────────────────────────────────────────────────────

function ScriptBlockCard({
  block,
  onContentChange,
  onToggle,
}: {
  block: ScriptBlock;
  onContentChange: (id: string, content: string) => void;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localContent, setLocalContent] = useState(block.content);

  useEffect(() => {
    setLocalContent(block.content);
  }, [block.content]);

  const handleSave = () => {
    onContentChange(block.id, localContent);
    setExpanded(false);
  };

  const handleCancel = () => {
    setLocalContent(block.content);
    setExpanded(false);
  };

  return (
    <div className={cn("rounded-xl border border-border/50 bg-card overflow-hidden transition-opacity", !block.enabled && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl shrink-0 leading-none">{block.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{block.title}</p>
          <p className="text-xs text-muted-foreground truncate">{block.description}</p>
        </div>
        <button
          onClick={() => onToggle(block.id)}
          title={block.enabled ? "Отключить блок" : "Включить блок"}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
            block.enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
          )}
        >
          <span className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            block.enabled ? "translate-x-4" : "translate-x-0.5",
          )} />
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-2.5 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            Используйте <code className="bg-muted px-1 rounded text-[10px]">{"{{clinic_name}}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-[10px]">{"{{date}}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-[10px]">{"{{time}}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-[10px]">{"{{doctor_name}}"}</code> как переменные.
          </p>
          <textarea
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            rows={10}
            className="w-full text-sm border border-border/50 rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="text-xs px-3 py-1.5 rounded-md font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Сохранить блок
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom script modal ──────────────────────────────────────────────────────

function CustomScriptModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (blocks: ScriptBlock[]) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawText, setRawText] = useState("");
  const [progress, setProgress] = useState(0);
  const [parsedBlocks, setParsedBlocks] = useState<ScriptBlock[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const parseScript = useParseScript({
    mutation: {
      onSuccess: (res: { data?: { blocks?: ScriptBlock[] } }) => {
        if (progressTimer.current) clearInterval(progressTimer.current);
        setProgress(100);
        setParsedBlocks(res.data?.blocks ?? []);
        setTimeout(() => setStep(3), 400);
      },
      onError: () => {
        if (progressTimer.current) clearInterval(progressTimer.current);
        setProgress(0);
        setParseError("Не удалось обработать скрипт. Проверьте текст и попробуйте снова.");
      },
    },
  });

  const handleParse = () => {
    if (!rawText.trim()) return;
    setParseError(null);
    setProgress(5);
    let current = 5;
    progressTimer.current = setInterval(() => {
      current = Math.min(current + 1.5, 82);
      setProgress(current);
    }, 300);
    parseScript.mutate(rawText);
  };

  useEffect(() => {
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border/50 w-full sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            {step === 1 ? <FileText className="h-4 w-4 text-violet-600" /> :
             step === 2 ? <Wand2 className="h-4 w-4 text-violet-600" /> :
             <ClipboardList className="h-4 w-4 text-violet-600" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {step === 1 ? "Добавить кастомный скрипт" :
               step === 2 ? "Вставьте ваш скрипт" :
               "Результат разбивки"}
            </p>
            <p className="text-xs text-muted-foreground">Шаг {step} из 3</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="shrink-0 flex items-center justify-center gap-2 py-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn("h-1.5 rounded-full transition-all", s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/40" : "w-3 bg-muted")} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">

          {/* Step 1 — Explanation */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 space-y-2">
                <p className="text-sm font-medium text-violet-900">Как это работает</p>
                <p className="text-xs text-violet-800 leading-relaxed">
                  Вставьте текст вашего скрипта в любом формате. Наш ИИ автоматически разобьёт его на логические блоки:
                  приветствие, диагностика, услуги, запись, дожим и другие.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Что поддерживается:</p>
                <ul className="space-y-1.5">
                  {[
                    "Текст в свободной форме — просто скопируйте ваш скрипт",
                    "Нумерованные разделы и заголовки",
                    "Эмодзи и форматирование",
                    "Скрипты на русском и казахском языках",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-muted/50 border border-border/50 p-3 space-y-1.5">
                <p className="text-[11px] font-medium text-foreground">Пример формата:</p>
                <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
{`1. Приветствие
Здравствуйте! Вы обратились в [Клиника].
Чем могу помочь?

2. Если болит зуб
Расскажите подробнее: боль постоянная
или при нажатии?

3. Запись
Давайте запишем вас...`}
                </pre>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-xs text-amber-800">
                  <strong>Важно:</strong> После разбивки вы сможете просмотреть и отредактировать каждый блок перед применением. Текущий стандартный скрипт будет заменён.
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Продолжить
              </button>
            </div>
          )}

          {/* Step 2 — Input + parse */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Вставьте текст вашего скрипта:</p>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Вставьте сюда текст скрипта чат-бота..."
                  rows={14}
                  disabled={parseScript.isPending}
                  className="w-full text-sm border border-border/50 rounded-xl px-3 py-2.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50 disabled:opacity-60"
                />
                <p className="text-[11px] text-muted-foreground mt-1 text-right">{rawText.length} символов</p>
              </div>

              {parseScript.isPending && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Wand2 className="h-3.5 w-3.5 text-violet-500 animate-pulse" />
                      ИИ анализирует скрипт…
                    </span>
                    <span className="font-medium text-foreground">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Это займёт 10–20 секунд. Пожалуйста, не закрывайте окно.
                  </p>
                </div>
              )}

              {parseError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{parseError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={parseScript.isPending}
                  className="flex-1 py-2.5 border border-border/60 text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Назад
                </button>
                <button
                  onClick={handleParse}
                  disabled={!rawText.trim() || parseScript.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {parseScript.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Разобрать с ИИ
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-800">
                  ИИ разбил скрипт на <strong>{parsedBlocks.length} блоков</strong>. Проверьте результат перед применением.
                </p>
              </div>

              <div className="space-y-2">
                {parsedBlocks.map((block) => (
                  <div key={block.id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
                    <span className="text-lg shrink-0 leading-none mt-0.5">{block.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{block.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">
                        {block.content.slice(0, 100)}{block.content.length > 100 ? "…" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                После применения вы сможете отредактировать каждый блок отдельно на странице настроек.
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 border border-border/60 text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted transition-colors"
                >
                  Изменить скрипт
                </button>
                <button
                  onClick={() => { onApply(parsedBlocks); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Check className="h-4 w-4" />
                  Применить скрипт
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "settings" | "manager-style" | "ai-broadcast">("sessions");
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<ChatbotSettingsUpdate>({});
  const [savedSettings, setSavedSettings] = useState<ChatbotSettingsUpdate>({});
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [showCustomScriptModal, setShowCustomScriptModal] = useState(false);
  const [scriptSaveStatus, setScriptSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scriptSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: settingsRes, refetch: refetchSettings } = useGetChatbotSettings();
  const { data: sessionsRes, refetch: refetchSessions, isLoading: sessionsLoading } = useListChatbotSessions();
  const { data: standardBlocksRes } = useGetStandardScriptBlocks();
  const updateSettings = useUpdateChatbotSettings();
  const deleteSession = useDeleteChatbotSession();

  const settings = settingsRes?.data?.settings;
  const sessions = sessionsRes?.data?.sessions ?? [];
  const standardBlocks = standardBlocksRes?.data?.blocks ?? [];

  const effectiveEnabled = localSettings.enabled ?? settings?.enabled ?? true;

  // Initialize script blocks from saved settings or standard blocks
  useEffect(() => {
    if (!settings) return;
    const saved = ((settings as unknown) as Record<string, unknown>)["scriptBlocks"] as ScriptBlock[] | undefined;
    if (saved && saved.length > 0) {
      setScriptBlocks(saved);
    } else if (standardBlocks.length > 0) {
      setScriptBlocks(standardBlocks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.id, standardBlocks.length]);

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

  const saveScriptBlocks = (blocks: ScriptBlock[]) => {
    if (scriptSaveTimer.current) clearTimeout(scriptSaveTimer.current);
    setScriptSaveStatus("saving");
    scriptSaveTimer.current = setTimeout(() => {
      updateSettings.mutate(
        { data: { scriptBlocks: blocks } as ChatbotSettingsUpdate },
        {
          onSuccess: () => {
            setScriptSaveStatus("saved");
            setTimeout(() => setScriptSaveStatus("idle"), 2000);
          },
          onError: () => setScriptSaveStatus("idle"),
        },
      );
    }, 800);
  };

  const handleBlockContentChange = (id: string, content: string) => {
    const updated = scriptBlocks.map((b) => (b.id === id ? { ...b, content } : b));
    setScriptBlocks(updated);
    saveScriptBlocks(updated);
  };

  const handleBlockToggle = (id: string) => {
    const updated = scriptBlocks.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b));
    setScriptBlocks(updated);
    saveScriptBlocks(updated);
  };

  const handleApplyCustomScript = (blocks: ScriptBlock[]) => {
    setScriptBlocks(blocks);
    saveScriptBlocks(blocks);
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("chatbot.settings.enableBot")}</p>
                  <p className="text-xs text-muted-foreground">{t("chatbot.settings.enableBotDesc")}</p>
                </div>
                <button
                  onClick={() => setLocalSettings((p) => ({ ...p, enabled: !effectiveEnabled }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    effectiveEnabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                >
                  <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", effectiveEnabled ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
              {autosaveStatus !== "idle" && (
                <p className={cn("text-xs mt-2", autosaveStatus === "saved" ? "text-emerald-600" : "text-muted-foreground")}>
                  {autosaveStatus === "saving" ? "Сохранение…" : "Сохранено"}
                </p>
              )}
            </div>

            {/* Script blocks header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Скрипт диалога</p>
                <p className="text-xs text-muted-foreground">{scriptBlocks.length} блоков · нажмите на блок чтобы изменить</p>
              </div>
              {scriptSaveStatus !== "idle" && (
                <span className={cn("text-xs font-medium", scriptSaveStatus === "saved" ? "text-emerald-600" : "text-muted-foreground")}>
                  {scriptSaveStatus === "saving" ? "Сохранение…" : "Сохранено ✓"}
                </span>
              )}
            </div>

            {/* Block cards */}
            {scriptBlocks.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-muted/30 p-8 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Загрузка скрипта…</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...scriptBlocks].sort((a, b) => a.order - b.order).map((block) => (
                  <ScriptBlockCard
                    key={block.id}
                    block={block}
                    onContentChange={handleBlockContentChange}
                    onToggle={handleBlockToggle}
                  />
                ))}
              </div>
            )}

            {/* Add custom script button */}
            <button
              onClick={() => setShowCustomScriptModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Добавить кастомный скрипт
            </button>

            <p className="text-[11px] text-muted-foreground text-center pb-2">
              Загрузите скрипт вашей клиники — ИИ автоматически разобьёт его на редактируемые блоки
            </p>
          </div>
        )}

        {tab === "manager-style" && <PlaygroundTab />}
        {tab === "ai-broadcast" && <AiBroadcastTab />}
      </div>

      {/* Custom script modal */}
      {showCustomScriptModal && (
        <CustomScriptModal
          onClose={() => setShowCustomScriptModal(false)}
          onApply={handleApplyCustomScript}
        />
      )}

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
