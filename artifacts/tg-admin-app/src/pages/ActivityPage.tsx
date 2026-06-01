import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ChatbotSession, type ChatbotMessage, type Clinic } from "../lib/api";
import { useTgBackButton, haptic } from "../hooks/useTgBackButton";

type View = "sessions" | "messages";

function ClinicPickerScreen({ onSelect }: { onSelect: (c: { id: string; name: string }) => void }) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = (data?.data?.clinics ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 pt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Активность</h1>
        <p className="text-sm text-muted-foreground">Выберите клинику для просмотра</p>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Поиск клиники..."
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
      />
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />)
          : clinics.map((c) => (
            <button
              key={c.id}
              onClick={() => { haptic("light"); onSelect({ id: c.id, name: c.name }); }}
              className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.usersCount ?? 0} польз · {c.patientsCount ?? 0} пац</p>
              </div>
              <span className="text-muted-foreground text-lg">›</span>
            </button>
          ))}
      </div>
    </div>
  );
}

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
        <span className="text-sm font-medium text-foreground">{s.phone}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${stateColors[s.state] ?? "bg-muted text-muted-foreground"}`}>{s.state}</span>
      </div>
      {s.humanTakeover && <span className="inline-block text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">👤 Оператор</span>}
      <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
    </div>
  );
}

function MessageRow({ m }: { m: ChatbotMessage }) {
  const isIn = m.direction === "inbound";
  return (
    <div className={`flex gap-2 ${isIn ? "flex-row" : "flex-row-reverse"}`}>
      <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isIn ? "bg-card border border-border" : "bg-primary/20 border border-primary/30"}`}>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{isIn ? "📱 " + m.phone.slice(-4) : "🤖 Бот"}</p>
        <p className="text-sm text-foreground">{m.content}</p>
        <p className="text-xs text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
    </div>
  );
}

function ActivityContent({ clinic, onBack }: { clinic: { id: string; name: string }; onBack: () => void }) {
  const [view, setView] = useState<View>("sessions");
  const [page, setPage] = useState(1);

  const handleBack = useCallback(() => { haptic("light"); onBack(); }, [onBack]);
  useTgBackButton(handleBack);

  const sessionsQ = useQuery({
    queryKey: ["tma-activity-sessions", clinic.id, page],
    queryFn: () => api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number } }>(`/sessions?clinicId=${clinic.id}&page=${page}`),
    enabled: view === "sessions",
  });
  const messagesQ = useQuery({
    queryKey: ["tma-activity-messages", clinic.id, page],
    queryFn: () => api.get<{ success: boolean; data: { messages: ChatbotMessage[]; total: number } }>(`/messages?clinicId=${clinic.id}&page=${page}`),
    enabled: view === "messages",
  });

  const q = view === "sessions" ? sessionsQ : messagesQ;
  const sessions = sessionsQ.data?.data?.sessions ?? [];
  const messages = messagesQ.data?.data?.messages ?? [];
  const items = view === "sessions" ? sessions : messages;
  const total = (view === "sessions" ? sessionsQ.data?.data?.total : messagesQ.data?.data?.total) ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="px-4 pt-4 space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <button onClick={handleBack} className="text-muted-foreground">←</button>
        <div>
          <h1 className="text-lg font-bold text-foreground">{clinic.name}</h1>
          <p className="text-xs text-muted-foreground">Активность чат-бота</p>
        </div>
      </div>

      <div className="flex bg-muted rounded-lg p-1">
        {(["sessions", "messages"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => { haptic("light"); setView(v); setPage(1); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >{v === "sessions" ? "💬 Сессии" : "📨 Сообщения"}</button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Всего: {total}</p>

      <div className="space-y-2">
        {q.isLoading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : view === "sessions"
          ? sessions.map((s) => <SessionRow key={s.id} s={s} />)
          : messages.map((m) => <MessageRow key={m.id} m={m} />)}
        {!q.isLoading && !items.length && (
          <div className="py-10 text-center">
            <p className="text-3xl mb-2">{view === "sessions" ? "💬" : "📨"}</p>
            <p className="text-sm text-muted-foreground">Нет данных</p>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const [clinic, setClinic] = useState<{ id: string; name: string } | null>(null);

  if (!clinic) return <ClinicPickerScreen onSelect={setClinic} />;
  return <ActivityContent clinic={clinic} onBack={() => setClinic(null)} />;
}
