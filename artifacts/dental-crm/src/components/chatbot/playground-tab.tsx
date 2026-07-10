import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, RefreshCw, ArrowUp, Loader2 } from "lucide-react";
import {
  useTestChatbotMessage,
  type PlaygroundSessionPayload,
  type TestMessageResponse,
} from "@workspace/api-client-react";
import { schedulePlaygroundBotParts } from "@/lib/chatbot-playground-parts";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { FSM_STATE_LABELS } from "@/lib/chatbot-fsm-states";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "bot"; text: string };

export function PlaygroundTab() {
  const testMessage = useTestChatbotMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isReceivingParts, setIsReceivingParts] = useState(false);
  const [session, setSession] = useState<PlaygroundSessionPayload | null>(null);
  const [humanTakeover, setHumanTakeover] = useState(false);
  const [activeMindMapNode, setActiveMindMapNode] = useState<{
    id: string;
    label: string;
    fsmState?: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelPartsRef = useRef<(() => void) | null>(null);

  const applyResponse = useCallback((res: TestMessageResponse) => {
    const data = res.data;
    if (!data) return;
    const parts = data.parts?.length ? data.parts : [data.reply ?? "..."];
    const nextData = (data.sessionData ?? {}) as Record<string, unknown>;
    setSession({
      state: data.fsmState ?? "greeting",
      data: nextData,
      humanTakeover: data.humanTakeover,
    });
    setHumanTakeover(!!data.humanTakeover);
    setActiveMindMapNode(data.mindMapNode ?? null);
    setIsReceivingParts(true);
    cancelPartsRef.current?.();
    cancelPartsRef.current = schedulePlaygroundBotParts(
      parts,
      data.pausesMs,
      (part) => setMessages((prev) => [...prev, { role: "bot", text: part }]),
      () => setIsReceivingParts(false),
    );
  }, []);

  const runTest = useCallback(
    (payload: {
      userMessage: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      session?: PlaygroundSessionPayload | null;
    }) => {
      testMessage.mutate(
        {
          userMessage: payload.userMessage,
          history: payload.history,
          scenario: "new_patient",
          session: payload.session ?? session ?? undefined,
        },
        {
          onSuccess: applyResponse,
          onError: (err) =>
            setMessages((prev) => [
              ...prev,
              {
                role: "bot",
                text: getApiErrorMessage(
                  err as { data?: unknown; message?: string },
                  "Ошибка. Попробуйте ещё раз.",
                ),
              },
            ]),
        },
      );
    },
    [testMessage, session, applyResponse],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, testMessage.isPending, isReceivingParts]);

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
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const resetPlayground = useCallback(() => {
    cancelPartsRef.current?.();
    cancelPartsRef.current = null;
    setIsReceivingParts(false);
    setMessages([]);
    setInput("");
    setSession(null);
    setHumanTakeover(false);
    setActiveMindMapNode(null);
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || testMessage.isPending || isReceivingParts) return;
    const updatedMessages = [...messages, { role: "user" as const, text }];
    setMessages(updatedMessages);
    setInput("");
    const history = updatedMessages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));
    runTest({ userMessage: text, history, session });
  };

  const stateLabel = session?.state
    ? FSM_STATE_LABELS[session.state] ?? session.state
    : null;

  const sendDisabled = !input.trim() || testMessage.isPending || isReceivingParts || humanTakeover;

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col min-h-0 h-full min-h-[calc(100dvh-14rem)]"
    >
      <div className="flex-1 min-h-[420px] rounded-2xl border border-[#e8e3d9] bg-white flex flex-col overflow-hidden shadow-sm">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e8e3d9] bg-white">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0f172a]">Playground</p>
            <p className="text-xs text-[#64748b] truncate">Тест диалога как новый пациент</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeMindMapNode && (
              <span
                className="hidden md:inline text-[10px] font-medium px-2 py-1 rounded-full bg-[#e0f2fe] text-[#0284c7] max-w-[180px] truncate"
                title={activeMindMapNode.id}
              >
                {activeMindMapNode.label}
              </span>
            )}
            {stateLabel && (
              <span className="hidden sm:inline text-[10px] font-medium px-2 py-1 rounded-full bg-[#f1ede4] text-[#64748b] max-w-[140px] truncate">
                {stateLabel}
              </span>
            )}
            <button
              type="button"
              onClick={resetPlayground}
              disabled={messages.length === 0 && !session}
              className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#0f172a] disabled:opacity-40 transition-colors px-2 py-1 rounded-lg hover:bg-[#f1ede4]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Сбросить
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-[280px] overflow-y-auto px-4 py-5 space-y-4 bg-[#faf8f4]">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-center py-8">
              <div className="h-14 w-14 rounded-2xl bg-[#1f75fe]/10 flex items-center justify-center mb-4">
                <Bot className="h-7 w-7 text-[#1f75fe]" />
              </div>
              <p className="text-base font-medium text-[#0f172a]">Playground готов</p>
              <p className="text-sm text-[#64748b] mt-2 max-w-[280px] leading-relaxed">
                Напишите как пациент — бот ответит по вашему mind map и agent mode
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "bot" && (
                <div className="h-8 w-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-[#1f75fe]" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[min(85%,520px)] rounded-2xl px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed",
                  msg.role === "user"
                    ? "bg-[#1f75fe] text-white rounded-tr-md"
                    : "bg-white border border-[#e8e3d9] text-[#0f172a] rounded-tl-md shadow-sm",
                )}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {(testMessage.isPending || isReceivingParts) && (
            <div className="flex justify-start gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-[#1f75fe]" />
              </div>
              <div className="bg-white border border-[#e8e3d9] rounded-2xl rounded-tl-md px-4 py-3.5 flex items-center gap-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#94a3b8]/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-[#94a3b8]/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-[#94a3b8]/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-1 shrink-0" />
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-[#e8e3d9] bg-white px-4 py-3">
          {humanTakeover && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
              Диалог передан оператору — сбросьте playground для нового теста
            </p>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-[#e8e3d9] bg-[#faf8f4] pl-4 pr-2 py-2 focus-within:border-[#1f75fe]/40 focus-within:ring-2 focus-within:ring-[#1f75fe]/15 transition-shadow">
            <input
              type="text"
              placeholder="Напишите как пациент..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={humanTakeover}
              className="flex-1 min-h-[44px] py-2.5 text-[15px] bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-50 placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label="Отправить"
              className={cn(
                "flex items-center justify-center w-9 h-9 mb-0.5 rounded-full shrink-0 transition-colors",
                sendDisabled
                  ? "bg-[#cbd5e1] text-white cursor-not-allowed"
                  : "bg-[#1f75fe] text-white hover:bg-[#1a65e8] active:scale-95",
              )}
            >
              {testMessage.isPending || isReceivingParts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
