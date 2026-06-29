import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, RefreshCw, Send, Loader2, FlaskConical } from "lucide-react";
import {
  useTestChatbotMessage,
  type PlaygroundScenario,
  type PlaygroundSessionPayload,
  type TestMessageResponse,
} from "@workspace/api-client-react";
import { FSM_STATE_LABELS, PLAYGROUND_SCENARIO_LABELS } from "@/lib/chatbot-fsm-states";
import { schedulePlaygroundBotParts } from "@/lib/chatbot-playground-parts";
import { getApiErrorMessage } from "@/lib/api-error-message";

type ChatMessage = { role: "user" | "bot"; text: string };

const SCENARIOS = Object.keys(PLAYGROUND_SCENARIO_LABELS) as PlaygroundScenario[];

function SessionDebugPanel({
  fsmState,
  sessionData,
  mindMapNode,
  simulatedActions,
  humanTakeover,
}: {
  fsmState: string;
  sessionData: Record<string, unknown>;
  mindMapNode: { id: string; label: string; fsmState?: string } | null;
  simulatedActions: string[];
  humanTakeover: boolean;
}) {
  const entries = Object.entries(sessionData).filter(([, v]) => v != null && v !== "");
  return (
    <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 space-y-1.5 max-h-40 overflow-y-auto">
      <p>
        <span className="font-semibold">Этап FSM:</span> {FSM_STATE_LABELS[fsmState] ?? fsmState}
        {humanTakeover && " · Оператор"}
      </p>
      {mindMapNode && (
        <p>
          <span className="font-semibold">Узел скрипта:</span> {mindMapNode.label}
        </p>
      )}
      {entries.length > 0 && (
        <div>
          <p className="font-semibold mb-0.5">Собранные данные</p>
          <ul className="space-y-0.5 text-slate-600">
            {entries.map(([k, v]) => (
              <li key={k}>
                {k}: {String(v)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {simulatedActions.length > 0 && (
        <div>
          <p className="font-semibold mb-0.5">Действия (симуляция)</p>
          <ul className="space-y-0.5 text-emerald-700">
            {simulatedActions.map((a, i) => (
              <li key={i}>• {a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PlaygroundTab() {
  const testMessage = useTestChatbotMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isReceivingParts, setIsReceivingParts] = useState(false);
  const [scenario, setScenario] = useState<PlaygroundScenario>("new_patient");
  const [session, setSession] = useState<PlaygroundSessionPayload | null>(null);
  const [fsmState, setFsmState] = useState("greeting");
  const [sessionData, setSessionData] = useState<Record<string, unknown>>({});
  const [mindMapNode, setMindMapNode] = useState<{ id: string; label: string; fsmState?: string } | null>(null);
  const [simulatedActions, setSimulatedActions] = useState<string[]>([]);
  const [humanTakeover, setHumanTakeover] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const applyResponse = useCallback((res: TestMessageResponse) => {
    const data = res.data;
    if (!data) return;
    const parts = data.parts?.length ? data.parts : [data.reply ?? "..."];
    if (data.fsmState) setFsmState(data.fsmState);
    const nextData = (data.sessionData ?? {}) as Record<string, unknown>;
    setSessionData(nextData);
    setSession({
      state: data.fsmState ?? "greeting",
      data: nextData,
      humanTakeover: data.humanTakeover,
    });
    setMindMapNode(data.mindMapNode ?? null);
    setSimulatedActions(data.simulatedActions ?? []);
    setHumanTakeover(!!data.humanTakeover);
    setIsReceivingParts(true);
    schedulePlaygroundBotParts(
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
      initGreeting?: boolean;
      session?: PlaygroundSessionPayload | null;
      scenario?: PlaygroundScenario;
    }) => {
      testMessage.mutate(
        {
          userMessage: payload.userMessage,
          history: payload.history,
          scenario: payload.scenario ?? scenario,
          session: payload.session ?? session ?? undefined,
          initGreeting: payload.initGreeting,
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
    [testMessage, scenario, session, applyResponse],
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

  const resetPlayground = useCallback(
    (nextScenario: PlaygroundScenario = scenario) => {
      setMessages([]);
      setInput("");
      setSession(null);
      setFsmState(nextScenario === "reactivation" ? "reactivation" : "greeting");
      setSessionData({});
      setMindMapNode(null);
      setSimulatedActions([]);
      setHumanTakeover(false);
      runTest({
        userMessage: "",
        history: [],
        initGreeting: true,
        session: null,
        scenario: nextScenario,
      });
    },
    [scenario, runTest],
  );

  useEffect(() => {
    runTest({ userMessage: "", history: [], initGreeting: true, session: null, scenario: "new_patient" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="shrink-0 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
        <FlaskConical className="h-3.5 w-3.5 text-violet-600 shrink-0" />
        <p className="text-xs text-violet-800 flex-1">
          <span className="font-semibold">Симуляция</span> — тот же FSM и логика, что в WhatsApp; записи в CRM не создаются
        </p>
        <button
          type="button"
          onClick={() => resetPlayground()}
          className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors shrink-0"
        >
          <RefreshCw className="h-3 w-3" />
          Сбросить
        </button>
      </div>

      <div className="shrink-0 flex flex-wrap gap-1.5">
        {SCENARIOS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setScenario(key);
              resetPlayground(key);
            }}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              scenario === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {PLAYGROUND_SCENARIO_LABELS[key]}
          </button>
        ))}
      </div>

      <SessionDebugPanel
        fsmState={fsmState}
        sessionData={sessionData}
        mindMapNode={mindMapNode}
        simulatedActions={simulatedActions}
        humanTakeover={humanTakeover}
      />

      <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-muted/20 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
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

          {(testMessage.isPending || isReceivingParts) && (
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
            className="flex-1 text-sm border border-border/50 rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || testMessage.isPending || isReceivingParts || humanTakeover}
            className="flex items-center-center w-10 h-10 bg-primary text-primary-foreground rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0 flex items-center justify-center"
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
