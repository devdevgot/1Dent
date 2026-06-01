import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ChatbotSession, type ChatbotMessage } from "../lib/api";

type View = "sessions" | "messages";

function SessionRow({ s }: { s: ChatbotSession }) {
  const stateColors: Record<string, string> = {
    greeting: "bg-blue-500/20 text-blue-400",
    collecting_name: "bg-yellow-500/20 text-yellow-400",
    booking: "bg-green-500/20 text-green-400",
    human_takeover: "bg-red-500/20 text-red-400",
  };
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {s.phone.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, "+$1 ($2) $3-$4")}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${stateColors[s.state] ?? "bg-muted text-muted-foreground"}`}>
          {s.state}
        </span>
      </div>
      {s.humanTakeover && (
        <span className="inline-block text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
          👤 Оператор
        </span>
      )}
      <p className="text-xs text-muted-foreground">
        {new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </div>
  );
}

function MessageRow({ m }: { m: ChatbotMessage }) {
  const isInbound = m.direction === "inbound";
  return (
    <div className={`flex gap-2 ${isInbound ? "flex-row" : "flex-row-reverse"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 ${
          isInbound ? "bg-card border border-border" : "bg-primary/20 border border-primary/30"
        }`}
      >
        <p className="text-xs font-medium text-muted-foreground mb-0.5">
          {isInbound ? "📱 " + m.phone.slice(-4) : "🤖 Бот"}
        </p>
        <p className="text-sm text-foreground">{m.content}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

export default function Activity() {
  const [view, setView] = useState<View>("sessions");
  const [page, setPage] = useState(1);

  const sessionsQ = useQuery({
    queryKey: ["tma-sessions", page],
    queryFn: () => api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number; page: number } }>(`/sessions?page=${page}`),
    enabled: view === "sessions",
  });

  const messagesQ = useQuery({
    queryKey: ["tma-messages", page],
    queryFn: () => api.get<{ success: boolean; data: { messages: ChatbotMessage[]; total: number; page: number } }>(`/messages?page=${page}`),
    enabled: view === "messages",
  });

  const q = view === "sessions" ? sessionsQ : messagesQ;
  const d = view === "sessions" ? sessionsQ.data?.data : messagesQ.data?.data;
  const items = view === "sessions"
    ? (d as { sessions?: ChatbotSession[] } | undefined)?.sessions ?? []
    : (d as { messages?: ChatbotMessage[] } | undefined)?.messages ?? [];
  const total = d?.total ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="px-4 pt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Активность</h1>
        <p className="text-sm text-muted-foreground">Чат-бот по всем клиникам</p>
      </div>

      <div className="flex bg-muted rounded-lg p-1">
        {(["sessions", "messages"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setPage(1); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {v === "sessions" ? "💬 Сессии" : "📨 Сообщения"}
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">Всего: {total}</div>

      <div className="space-y-2">
        {q.isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />
            ))
          : view === "sessions"
          ? (items as ChatbotSession[]).map((s) => <SessionRow key={s.id} s={s} />)
          : (items as ChatbotMessage[]).map((m) => <MessageRow key={m.id} m={m} />)}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pb-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
