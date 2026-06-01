import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ChatbotSession, type ChatbotMessage, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

type View = "sessions" | "messages";

const stateColors: Record<string, string> = {
  greeting: "bg-blue-500/20 text-blue-400",
  collecting_name: "bg-yellow-500/20 text-yellow-400",
  booking: "bg-green-500/20 text-green-400",
  human_takeover: "bg-red-500/20 text-red-400",
  completed: "bg-gray-500/20 text-gray-400",
};

function SessionRow({ s }: { s: ChatbotSession }) {
  const color = stateColors[s.state] ?? "bg-gray-500/20 text-gray-400";
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono text-foreground">{s.phone}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>{s.state}</span>
        {s.humanTakeover && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">👤 оператор</span>}
      </div>
      <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ru")}</p>
    </div>
  );
}

function MessageRow({ m }: { m: ChatbotMessage }) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${m.direction === "inbound" ? "bg-card border-border" : "bg-primary/5 border-primary/20"}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{m.direction === "inbound" ? "⬇️ входящее" : "⬆️ исходящее"}</span>
        <span className="text-xs font-mono text-muted-foreground">{m.phone}</span>
      </div>
      <p className="text-sm text-foreground line-clamp-2">{m.content}</p>
      <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("ru")}</p>
    </div>
  );
}

export default function ActivityPage() {
  const [view, setView] = useState<View>("sessions");
  const [clinicId, setClinicId] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = clinicsData?.data?.clinics ?? [];

  const sessionsQ = useQuery({
    queryKey: ["tma-activity-sessions", clinicId, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (clinicId) params.set("clinicId", clinicId);
      const endpoint = clinicId ? `/clinics/${clinicId}/sessions?${params}` : `/sessions?${params}`;
      return api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number; page: number } }>(endpoint);
    },
    enabled: view === "sessions",
    staleTime: 30_000,
  });

  const messagesQ = useQuery({
    queryKey: ["tma-activity-messages", clinicId, direction, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (direction) params.set("direction", direction);
      if (search) params.set("search", search);
      const endpoint = clinicId ? `/clinics/${clinicId}/messages?${params}` : `/messages?${params}`;
      return api.get<{ success: boolean; data: { messages: ChatbotMessage[]; total: number } }>(endpoint);
    },
    enabled: view === "messages",
    staleTime: 30_000,
  });

  const sessions = sessionsQ.data?.data?.sessions ?? [];
  const sessTotal = sessionsQ.data?.data?.total ?? 0;
  const messages = messagesQ.data?.data?.messages ?? [];
  const msgTotal = messagesQ.data?.data?.total ?? 0;
  const isLoading = view === "sessions" ? sessionsQ.isLoading : messagesQ.isLoading;

  const handleViewChange = (v: View) => {
    haptic("light");
    setView(v);
    setPage(1);
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Активность</h1>
        <p className="text-sm text-muted-foreground">Платформенные сессии и сообщения</p>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <select
          value={clinicId}
          onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">🏥 Все клиники</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {view === "messages" && (
          <div className="flex gap-2">
            <select
              value={direction}
              onChange={(e) => { setDirection(e.target.value); setPage(1); }}
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Все направления</option>
              <option value="inbound">⬇️ Входящие</option>
              <option value="outbound">⬆️ Исходящие</option>
            </select>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Поиск..."
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["sessions", "messages"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => handleViewChange(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}
          >
            {v === "sessions" ? `💬 Сессии${view === "sessions" && sessTotal ? ` (${sessTotal})` : ""}` : `📨 Сообщения${view === "messages" && msgTotal ? ` (${msgTotal})` : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : view === "sessions"
            ? sessions.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">Сессий нет</p>
              : sessions.map((s) => <SessionRow key={s.id} s={s} />)
            : messages.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">Сообщений нет</p>
              : messages.map((m) => <MessageRow key={m.id} m={m} />)
        }
      </div>

      {/* Pagination */}
      {((view === "sessions" && sessTotal > 50) || (view === "messages" && msgTotal > 50)) && (
        <div className="flex gap-2 justify-center">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40">← Назад</button>
          <span className="px-3 py-2 text-sm text-muted-foreground">Стр. {page}</span>
          <button onClick={() => setPage((p) => p + 1)}
            disabled={(view === "sessions" && sessions.length < 50) || (view === "messages" && messages.length < 50)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  );
}
