import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Clinic, type ChatbotSession, type ChatbotMessage, type Notification, type Broadcast, type ClinicFile, type Contract, type KnowledgeEntry } from "../lib/api";

type Tab =
  | "info" | "users" | "patients" | "chatbot" | "sessions" | "messages"
  | "channels" | "procedures" | "analytics" | "broadcasts"
  | "knowledge" | "contracts" | "finances" | "logs" | "notifications" | "files";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "info", label: "Инфо", icon: "ℹ️" },
  { id: "users", label: "Персонал", icon: "👥" },
  { id: "patients", label: "Пациенты", icon: "🦷" },
  { id: "chatbot", label: "Чат-бот", icon: "🤖" },
  { id: "sessions", label: "Сессии", icon: "💬" },
  { id: "messages", label: "Сообщения", icon: "📨" },
  { id: "channels", label: "Каналы", icon: "📡" },
  { id: "procedures", label: "Услуги", icon: "💊" },
  { id: "analytics", label: "Аналитика", icon: "📊" },
  { id: "broadcasts", label: "Рассылки", icon: "📢" },
  { id: "knowledge", label: "База знаний", icon: "📚" },
  { id: "contracts", label: "Договоры", icon: "📝" },
  { id: "finances", label: "Финансы", icon: "💰" },
  { id: "logs", label: "Логи", icon: "📋" },
  { id: "notifications", label: "Уведомления", icon: "🔔" },
  { id: "files", label: "Файлы", icon: "📁" },
];

function EmptyState({ icon = "📭", text = "Нет данных" }: { icon?: string; text?: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 bg-card rounded-lg border border-border animate-pulse" />
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1">{String(value ?? "—")}</p>
    </div>
  );
}

// ── Info Tab ──
function InfoTab({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const [editPlan, setEditPlan] = useState(false);
  const [plan, setPlan] = useState(clinic.plan);

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinic.id}`, { plan }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tma-clinics"] }); setEditPlan(false); },
  });

  const planColors: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    starter: "bg-blue-500/20 text-blue-400",
    professional: "bg-purple-500/20 text-purple-400",
    enterprise: "bg-amber-500/20 text-amber-400",
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
            {clinic.name[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-foreground">{clinic.name}</h3>
            <p className="text-xs text-muted-foreground font-mono">ID: {clinic.id.slice(0, 16)}…</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Сотрудники</p>
            <p className="text-lg font-bold text-foreground">{clinic.usersCount ?? 0}</p>
          </div>
          <div className="bg-background rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Пациенты</p>
            <p className="text-lg font-bold text-foreground">{clinic.patientsCount ?? 0}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Дата создания</p>
          <p className="text-sm text-foreground">
            {new Date(clinic.createdAt).toLocaleDateString("ru", { dateStyle: "long" })}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Тариф</p>
            <button onClick={() => setEditPlan(!editPlan)} className="text-xs text-primary">
              {editPlan ? "Отмена" : "Изменить"}
            </button>
          </div>
          {editPlan ? (
            <div className="flex gap-2">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground"
              >
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <button
                onClick={() => updateMut.mutate()}
                disabled={updateMut.isPending}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                ✓
              </button>
            </div>
          ) : (
            <span className={`inline-block text-xs px-2 py-1 rounded-lg font-medium ${planColors[clinic.plan] ?? ""}`}>
              {clinic.plan}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ──
function UsersTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-users", id],
    queryFn: () => api.get<{ success: boolean; data: { users: Record<string, unknown>[] } }>(`/clinics/${id}/users`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const users = data?.data?.users ?? [];
  if (!users.length) return <EmptyState icon="👥" text="Нет сотрудников" />;
  return (
    <div className="space-y-2">
      {users.map((u, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{String(u["name"] ?? "—")}</p>
              <p className="text-xs text-muted-foreground">{String(u["email"] ?? "—")}</p>
            </div>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{String(u["role"] ?? "—")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Patients Tab ──
function PatientsTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-patients", id, page],
    queryFn: () => api.get<{ success: boolean; data: { patients: Record<string, unknown>[]; total: number; page: number } }>(`/clinics/${id}/patients?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const patients = data?.data?.patients ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!patients.length) return <EmptyState icon="🦷" text="Нет пациентов" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {patients.map((p, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">{String(p["name"] ?? "—")}</p>
          <p className="text-xs text-muted-foreground">{String(p["phone"] ?? "—")}</p>
        </div>
      ))}
      {pages > 1 && (
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Chatbot Overview Tab ──
function ChatbotTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-chatbot", id],
    queryFn: () => api.get<{ success: boolean; data: { totalSessions: number; totalMessages: number; recentSessions: ChatbotSession[] } }>(`/clinics/${id}/chatbot`),
  });
  if (isLoading) return <LoadingSkeleton rows={2} />;
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Сессий" value={d?.totalSessions ?? 0} />
        <StatCard label="Сообщений" value={d?.totalMessages ?? 0} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Последние сессии</p>
        <div className="space-y-2">
          {(d?.recentSessions ?? []).map((s) => (
            <div key={s.id} className="bg-card rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{s.phone}</span>
                {s.humanTakeover && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">👤 Оператор</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.state} · {new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
          ))}
          {!(d?.recentSessions ?? []).length && <EmptyState icon="🤖" text="Нет активных сессий" />}
        </div>
      </div>
    </div>
  );
}

// ── Sessions Tab (per-clinic, with actions) ──
function SessionsTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-sessions", id, page],
    queryFn: () => api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number } }>(`/clinics/${id}/sessions?page=${page}`),
  });

  const takeoverMut = useMutation({
    mutationFn: ({ sessionId, val }: { sessionId: string; val: boolean }) =>
      api.post(`/clinics/${id}/sessions/${sessionId}/takeover`, { humanTakeover: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tma-clinic-sessions", id] }),
  });

  const resetMut = useMutation({
    mutationFn: (sessionId: string) => api.post(`/clinics/${id}/sessions/${sessionId}/reset`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tma-clinic-sessions", id] }),
  });

  if (isLoading) return <LoadingSkeleton />;
  const sessions = data?.data?.sessions ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!sessions.length) return <EmptyState icon="💬" text="Нет сессий" />;

  const stateColors: Record<string, string> = {
    greeting: "bg-blue-500/20 text-blue-400",
    collecting_name: "bg-yellow-500/20 text-yellow-400",
    booking: "bg-green-500/20 text-green-400",
    human_takeover: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {sessions.map((s) => (
        <div key={s.id} className="bg-card rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{s.phone}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${stateColors[s.state] ?? "bg-muted text-muted-foreground"}`}>{s.state}</span>
          </div>
          <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
          <div className="flex gap-2">
            <button
              onClick={() => takeoverMut.mutate({ sessionId: s.id, val: !s.humanTakeover })}
              disabled={takeoverMut.isPending}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${s.humanTakeover ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-card border-border text-muted-foreground hover:border-primary/50"}`}
            >
              {s.humanTakeover ? "👤 Снять оператора" : "👤 Передать оператору"}
            </button>
            <button
              onClick={() => resetMut.mutate(s.id)}
              disabled={resetMut.isPending}
              className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/50"
            >
              🔄 Сброс
            </button>
          </div>
        </div>
      ))}
      {pages > 1 && (
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Messages Tab (per-clinic) ──
function MessagesTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-messages", id, page],
    queryFn: () => api.get<{ success: boolean; data: { messages: ChatbotMessage[]; total: number } }>(`/clinics/${id}/messages?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const messages = data?.data?.messages ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!messages.length) return <EmptyState icon="📨" text="Нет сообщений" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {messages.map((m) => (
        <div key={m.id} className={`flex gap-2 ${m.direction === "inbound" ? "flex-row" : "flex-row-reverse"}`}>
          <div className={`max-w-[80%] rounded-xl px-3 py-2 ${m.direction === "inbound" ? "bg-card border border-border" : "bg-primary/20 border border-primary/30"}`}>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{m.direction === "inbound" ? "📱 " + m.phone.slice(-4) : "🤖 Бот"}</p>
            <p className="text-sm text-foreground">{m.content}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      ))}
      {pages > 1 && (
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Channels Tab ──
function ChannelsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-channels", id],
    queryFn: () => api.get<{ success: boolean; data: { channels: Record<string, unknown>[] } }>(`/clinics/${id}/channels`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const channels = data?.data?.channels ?? [];
  if (!channels.length) return <EmptyState icon="📡" text="Нет каналов" />;
  return (
    <div className="space-y-2">
      {channels.map((c, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{String(c["name"] ?? c["phone"] ?? "—")}</p>
              <p className="text-xs text-muted-foreground">{String(c["type"] ?? "—")} · {String(c["phone"] ?? "")}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${c["status"] === "active" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>{String(c["status"] ?? "—")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Procedures Tab ──
function ProceduresTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-procedures", id],
    queryFn: () => api.get<{ success: boolean; data: { templates: Record<string, unknown>[] } }>(`/clinics/${id}/procedure-templates`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.templates ?? [];
  if (!items.length) return <EmptyState icon="💊" text="Нет шаблонов услуг" />;
  return (
    <div className="space-y-2">
      {items.map((t, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{String(t["name"] ?? "—")}</p>
            <p className="text-sm font-bold text-primary">{Number(t["price"] ?? 0).toLocaleString()} ₸</p>
          </div>
          <p className="text-xs text-muted-foreground">{String(t["category"] ?? "—")} · {String(t["duration"] ?? "—")} мин</p>
        </div>
      ))}
    </div>
  );
}

// ── Analytics Tab ──
function AnalyticsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-analytics", id],
    queryFn: () => api.get<{ success: boolean; data: { totalPatients: number; revenueThisMonth: number; proceduresThisMonth: number; revenueByMonth: { month: string; revenue: number; procedures: number }[] } }>(`/clinics/${id}/analytics`),
  });
  if (isLoading) return <LoadingSkeleton rows={2} />;
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Пациентов" value={d?.totalPatients ?? 0} />
        <StatCard label="Выручка / мес" value={`${(d?.revenueThisMonth ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Процедур / мес" value={d?.proceduresThisMonth ?? 0} />
      </div>
      {(d?.revenueByMonth ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Выручка по месяцам</p>
          <div className="space-y-1">
            {(d?.revenueByMonth ?? []).map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.month}</span>
                <span className="text-foreground font-medium">{m.revenue.toLocaleString()} ₸</span>
                <span className="text-muted-foreground">{m.procedures} проц.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Broadcasts Tab ──
function BroadcastsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-broadcasts", id],
    queryFn: () => api.get<{ success: boolean; data: { broadcasts: Broadcast[]; total: number } }>(`/clinics/${id}/broadcasts`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.broadcasts ?? [];
  if (!items.length) return <EmptyState icon="📢" text="Нет рассылок" />;
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    sent: "bg-green-500/20 text-green-400",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((b) => (
        <div key={b.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{b.type === "appointment_reminder" ? "📅 Напоминание" : "🏥 Постоп"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[b.status] ?? "bg-muted text-muted-foreground"}`}>{b.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Отправка: {new Date(b.sendAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
        </div>
      ))}
    </div>
  );
}

// ── Knowledge Tab ──
function KnowledgeTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-knowledge", id],
    queryFn: () => api.get<{ success: boolean; data: { entries: KnowledgeEntry[] } }>(`/clinics/${id}/knowledge`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.entries ?? [];
  if (!items.length) return <EmptyState icon="📚" text="Нет источников знаний" />;
  const statusColors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    error: "bg-red-500/20 text-red-400",
  };
  return (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground truncate flex-1 mr-2">{e.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[e.status] ?? "bg-muted text-muted-foreground"}`}>{e.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{e.type} · {new Date(e.createdAt).toLocaleDateString("ru")}</p>
        </div>
      ))}
    </div>
  );
}

// ── Contracts Tab ──
function ContractsTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-contracts", id, page],
    queryFn: () => api.get<{ success: boolean; data: { contracts: Contract[]; total: number; templateCount: number } }>(`/clinics/${id}/contracts?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const contracts = data?.data?.contracts ?? [];
  const total = data?.data?.total ?? 0;
  const templateCount = data?.data?.templateCount ?? 0;
  const pages = Math.ceil(total / 50);
  const statusColors: Record<string, string> = {
    signed: "bg-green-500/20 text-green-400",
    sent: "bg-blue-500/20 text-blue-400",
    viewed: "bg-yellow-500/20 text-yellow-400",
    created: "bg-muted text-muted-foreground",
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Договоров" value={total} />
        <StatCard label="Шаблонов" value={templateCount} />
      </div>
      {!contracts.length ? <EmptyState icon="📝" text="Нет договоров" /> : (
        <>
          {contracts.map((c) => (
            <div key={c.id} className="bg-card rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.patientName}</p>
                  <p className="text-xs text-muted-foreground">{c.patientPhone}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${statusColors[c.status] ?? "bg-muted text-muted-foreground"}`}>{c.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{new Date(c.createdAt).toLocaleDateString("ru")}</p>
            </div>
          ))}
          {pages > 1 && (
            <div className="flex gap-2 justify-center pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
              <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Finances Tab ──
function FinancesTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-finances", id],
    queryFn: () => api.get<{ success: boolean; data: { revenue: number; expenses: number; payroll: number; profit: number; months: { month: string; revenue: number; expenses: number }[] } }>(`/clinics/${id}/finances`),
  });
  if (isLoading) return <LoadingSkeleton rows={2} />;
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Выручка / мес" value={`${(d?.revenue ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Расходы / мес" value={`${(d?.expenses ?? 0).toLocaleString()} ₸`} />
        <StatCard label="ФОТ / мес" value={`${(d?.payroll ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Прибыль / мес" value={`${(d?.profit ?? 0).toLocaleString()} ₸`} />
      </div>
      {(d?.months ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">По месяцам</p>
          <div className="space-y-1">
            {(d?.months ?? []).map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.month}</span>
                <span className="text-green-400">{m.revenue.toLocaleString()} ₸</span>
                <span className="text-red-400">-{m.expenses.toLocaleString()} ₸</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clinic Logs Tab ──
function ClinicLogsTab({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-logs", id, page],
    queryFn: () => api.get<{ success: boolean; data: { logs: Record<string, unknown>[]; total: number } }>(`/clinics/${id}/logs?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!logs.length) return <EmptyState icon="📋" text="Нет логов" />;
  const typeColors: Record<string, string> = { create: "text-green-400", update: "text-blue-400", delete: "text-red-400", login: "text-purple-400" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {logs.map((l, i) => {
        const at = String(l["actionType"] ?? "");
        const color = Object.entries(typeColors).find(([k]) => at.includes(k))?.[1] ?? "text-foreground";
        return (
          <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-mono font-bold ${color}`}>{at}</span>
              <span className="text-xs text-muted-foreground">{String(l["entityType"] ?? "")}</span>
            </div>
            {l["details"] && <p className="text-xs text-foreground/80">{String(l["details"])}</p>}
            <p className="text-xs text-muted-foreground">{new Date(String(l["createdAt"])).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
        );
      })}
      {pages > 1 && (
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
          <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}

// ── Notifications Tab ──
function NotificationsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-notifications", id],
    queryFn: () => api.get<{ success: boolean; data: { notifications: Notification[]; total: number } }>(`/clinics/${id}/notifications`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.notifications ?? [];
  if (!items.length) return <EmptyState icon="🔔" text="Нет уведомлений" />;
  const typeIcons: Record<string, string> = { red_alert: "🚨", new_message: "💬", appointment: "📅", system: "⚙️", appointment_reminder: "⏰", pending_payment: "💳" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((n) => (
        <div key={n.id} className={`bg-card rounded-lg border p-3 ${n.read ? "border-border opacity-60" : "border-primary/30"}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">{typeIcons[n.type] ?? "🔔"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
            {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Files Tab ──
function FilesTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-files", id],
    queryFn: () => api.get<{ success: boolean; data: { files: ClinicFile[]; total: number } }>(`/clinics/${id}/files`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.files ?? [];
  if (!items.length) return <EmptyState icon="📁" text="Нет файлов" />;
  const sourceLabels: Record<string, string> = { contract_template: "📝 Шаблон", knowledge_source: "📚 База знаний" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((f) => (
        <div key={f.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">{sourceLabels[f.source] ?? f.source} · {f.type}</p>
            </div>
            {f.url && (
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex-shrink-0">↗</a>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{new Date(f.createdAt).toLocaleDateString("ru")}</p>
        </div>
      ))}
    </div>
  );
}

// ── Clinic Card root ──
export default function ClinicCard({ clinic, onBack }: { clinic: Clinic; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("info");

  const tabContent: Record<Tab, JSX.Element> = {
    info: <InfoTab clinic={clinic} />,
    users: <UsersTab id={clinic.id} />,
    patients: <PatientsTab id={clinic.id} />,
    chatbot: <ChatbotTab id={clinic.id} />,
    sessions: <SessionsTab id={clinic.id} />,
    messages: <MessagesTab id={clinic.id} />,
    channels: <ChannelsTab id={clinic.id} />,
    procedures: <ProceduresTab id={clinic.id} />,
    analytics: <AnalyticsTab id={clinic.id} />,
    broadcasts: <BroadcastsTab id={clinic.id} />,
    knowledge: <KnowledgeTab id={clinic.id} />,
    contracts: <ContractsTab id={clinic.id} />,
    finances: <FinancesTab id={clinic.id} />,
    logs: <ClinicLogsTab id={clinic.id} />,
    notifications: <NotificationsTab id={clinic.id} />,
    files: <FilesTab id={clinic.id} />,
  };

  const currentTab = TABS.find((t) => t.id === tab);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg">←</button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground truncate">{clinic.name}</h2>
            <p className="text-xs text-muted-foreground">{currentTab?.icon} {currentTab?.label}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 pb-24">
        {tabContent[tab]}
      </div>
    </div>
  );
}
