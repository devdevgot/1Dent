import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, User } from "lucide-react";
import { api, type ChatbotSession, type ChatbotMessage, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { EmptyState } from "@/components/empty-state";

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
        {s.humanTakeover && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 flex items-center gap-1"><User className="w-3 h-3" /> оператор</span>}
      </div>
      <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ru")}</p>
    </div>
  );
}

function MessageRow({ m }: { m: ChatbotMessage }) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${m.direction === "inbound" ? "bg-card border-border" : "bg-primary/5 border-primary/20"}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#f1ede4] text-[#64748b] flex items-center gap-1">
          {m.direction === "inbound" ? <><ArrowDown className="w-3 h-3" /> входящее</> : <><ArrowUp className="w-3 h-3" /> исходящее</>}
        </span>
        <span className="text-xs font-mono text-muted-foreground">{m.phone}</span>
      </div>
      <p className="text-sm text-foreground line-clamp-2">{m.content}</p>
      <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("ru")}</p>
    </div>
  );
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("sessions");
  const [clinicId, setClinicId] = useState<string>("");
  // sessions filters
  const [humanTakeover, setHumanTakeover] = useState<string>("");
  const [sessDateFrom, setSessDateFrom] = useState<string>("");
  const [sessDateTo, setSessDateTo] = useState<string>("");
  // messages filters
  const [direction, setDirection] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [msgDateFrom, setMsgDateFrom] = useState<string>("");
  const [msgDateTo, setMsgDateTo] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = clinicsData?.data?.clinics ?? [];

  const sessionsQ = useQuery({
    queryKey: ["tma-activity-sessions", clinicId, humanTakeover, sessDateFrom, sessDateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (clinicId) params.set("clinicId", clinicId);
      if (humanTakeover) params.set("humanTakeover", humanTakeover);
      if (sessDateFrom) params.set("dateFrom", sessDateFrom);
      if (sessDateTo) params.set("dateTo", sessDateTo);
      const endpoint = clinicId ? `/clinics/${clinicId}/sessions?${params}` : `/sessions?${params}`;
      return api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number; page: number } }>(endpoint);
    },
    enabled: view === "sessions",
    staleTime: 30_000,
  });

  const messagesQ = useQuery({
    queryKey: ["tma-activity-messages", clinicId, direction, search, msgDateFrom, msgDateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (direction) params.set("direction", direction);
      if (search) params.set("search", search);
      if (msgDateFrom) params.set("dateFrom", msgDateFrom);
      if (msgDateTo) params.set("dateTo", msgDateTo);
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
    <TmaPage
      title="Активность"
      subtitle="Платформенные сессии и сообщения"
      onBack={() => navigate("/more")}
    >
      <select
        value={clinicId}
        onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
        className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe]"
      >
        <option value="">Все клиники</option>
        {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <div className="flex gap-2">
        {(["sessions", "messages"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => handleViewChange(v)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${view === v ? "bg-[#1f75fe] text-white" : "bg-white border border-[#e8e3d9] text-[#64748b]"}`}
          >
            {v === "sessions" ? `Сессии${view === "sessions" && sessTotal ? ` (${sessTotal})` : ""}` : `Сообщения${view === "messages" && msgTotal ? ` (${msgTotal})` : ""}`}
          </button>
        ))}
      </div>

      {/* Sessions filters */}
      {view === "sessions" && (
        <div className="space-y-2">
          <select value={humanTakeover} onChange={(e) => { setHumanTakeover(e.target.value); setPage(1); }}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
            <option value="">Все сессии</option>
            <option value="true">Только с оператором</option>
            <option value="false">Только бот</option>
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">С даты</p>
              <input type="date" value={sessDateFrom} onChange={(e) => { setSessDateFrom(e.target.value); setPage(1); }}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">По дату</p>
              <input type="date" value={sessDateTo} onChange={(e) => { setSessDateTo(e.target.value); setPage(1); }}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Messages filters */}
      {view === "messages" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
              <option value="">Все направления</option>
              <option value="inbound">Входящие</option>
              <option value="outbound">Исходящие</option>
            </select>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Поиск..."
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">С даты</p>
              <input type="date" value={msgDateFrom} onChange={(e) => { setMsgDateFrom(e.target.value); setPage(1); }}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">По дату</p>
              <input type="date" value={msgDateTo} onChange={(e) => { setMsgDateTo(e.target.value); setPage(1); }}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : view === "sessions"
            ? sessions.length === 0
              ? <EmptyState text="Сессий нет" />
              : sessions.map((s) => <SessionRow key={s.id} s={s} />)
            : messages.length === 0
              ? <EmptyState text="Сообщений нет" />
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
    </TmaPage>
  );
}
