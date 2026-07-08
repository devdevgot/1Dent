import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, RefreshCw, Send, Loader2 } from "lucide-react";
import {
  useTestChatbotMessage,
  type PlaygroundSessionPayload,
  type TestMessageResponse,
} from "@workspace/api-client-react";
import { schedulePlaygroundBotParts } from "@/lib/chatbot-playground-parts";
import { getApiErrorMessage } from "@/lib/api-error-message";

type ChatMessage = { role: "user" | "bot"; text: string };

export function PlaygroundTab() {
  const testMessage = useTestChatbotMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isReceivingParts, setIsReceivingParts] = useState(false);
  const [session, setSession] = useState<PlaygroundSessionPayload | null>(null);
  const [humanTakeover, setHumanTakeover] = useState(false);
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

  return (
    <div ref={containerRef} className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex-1 min-h-0 rounded-2xl border border-[#e8e3d9] bg-white flex flex-col overflow-hidden">
        <div className="shrink-0 flex justify-end px-3 pt-2">
          <button
            type="button"
            onClick={resetPlayground}
            disabled={messages.length === 0 && !session}
            className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#0f172a] disabled:opacity-40 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Сбросить
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-[#faf8f4]">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="h-12 w-12 rounded-full bg-[#1f75fe]/10 flex items-center justify-center mb-3">
                <Bot className="h-6 w-6 text-[#1f75fe]" />
              </div>
              <p className="text-sm font-medium text-[#0f172a]">Playground готов</p>
              <p className="text-xs text-[#64748b] mt-1 max-w-[220px]">
                Напишите как пациент — бот ответит по вашему скрипту
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "bot" && (
                <div className="h-6 w-6 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                  <Bot className="h-3.5 w-3.5 text-[#1f75fe]" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1f75fe] text-white rounded-tr-sm"
                    : "bg-white border border-[#e8e3d9] text-[#0f172a] rounded-tl-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {(testMessage.isPending || isReceivingParts) && (
            <div className="flex justify-start">
              <div className="h-6 w-6 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                <Bot className="h-3.5 w-3.5 text-[#1f75fe]" />
              </div>
              <div className="bg-white border border-[#e8e3d9] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-[#e8e3d9] bg-white px-3 py-2.5 flex gap-2">
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
            className="flex-1 text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || testMessage.isPending || isReceivingParts || humanTakeover}
            className="flex items-center-center w-10 h-10 bg-[#1f75fe] text-white rounded-xl disabled:opacity-50 hover:bg-[#1a65e8] transition-colors shrink-0 flex items-center justify-center"
          >
            {testMessage.isPending || isReceivingParts ? (
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
