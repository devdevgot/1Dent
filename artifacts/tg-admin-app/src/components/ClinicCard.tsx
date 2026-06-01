import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Clinic } from "../lib/api";

type Tab =
  | "info"
  | "users"
  | "patients"
  | "chatbot"
  | "channels"
  | "procedures"
  | "analytics"
  | "broadcasts"
  | "knowledge"
  | "contracts"
  | "finances"
  | "logs"
  | "notifications"
  | "files";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "info", label: "Инфо", icon: "ℹ️" },
  { id: "users", label: "Персонал", icon: "👥" },
  { id: "patients", label: "Пациенты", icon: "🦷" },
  { id: "chatbot", label: "Чат-бот", icon: "🤖" },
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

// -- Generic data table --
function DataTable({ keys, rows }: { keys: string[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-1">
          {keys.map((k) => (
            <div key={k} className="flex gap-2">
              <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{k}</span>
              <span className="text-xs text-foreground truncate">{String(row[k] ?? "—")}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <p className="text-3xl mb-2">📭</p>
      <p className="text-sm">Нет данных</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 bg-card rounded-lg border border-border animate-pulse" />
      ))}
    </div>
  );
}

// -- Tab content components --

function InfoTab({ clinic }: { clinic: Clinic }) {
  const qc = useQueryClient();
  const [editPlan, setEditPlan] = useState(false);
  const [plan, setPlan] = useState(clinic.plan);

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinic.id}`, { plan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
      setEditPlan(false);
    },
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
            <p className="text-xs text-muted-foreground">ID: {clinic.id.slice(0, 16)}…</p>
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

function UsersTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-users", id],
    queryFn: () => api.get<{ success: boolean; data: { users: Record<string, unknown>[] } }>(`/clinics/${id}/users`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const users = data?.data?.users ?? [];
  return <DataTable keys={["name", "email", "role", "createdAt"]} rows={users} />;
}

function PatientsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-patients", id],
    queryFn: () => api.get<{ success: boolean; data: { patients: Record<string, unknown>[] } }>(`/clinics/${id}/patients`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const patients = data?.data?.patients ?? [];
  return <DataTable keys={["name", "phone", "createdAt"]} rows={patients} />;
}

function ChatbotTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-chatbot", id],
    queryFn: () => api.get<{ success: boolean; data: Record<string, unknown> }>(`/clinics/${id}/chatbot`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const cfg = data?.data ?? {};
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      {Object.entries(cfg).map(([k, v]) => (
        <div key={k} className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground w-32 flex-shrink-0">{k}</span>
          <span className="text-xs text-foreground break-all">{String(v ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-channels", id],
    queryFn: () => api.get<{ success: boolean; data: { channels: Record<string, unknown>[] } }>(`/clinics/${id}/channels`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const channels = data?.data?.channels ?? [];
  return <DataTable keys={["type", "name", "phone", "status"]} rows={channels} />;
}

function ProceduresTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-procedures", id],
    queryFn: () => api.get<{ success: boolean; data: { templates: Record<string, unknown>[] } }>(`/clinics/${id}/procedure-templates`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.templates ?? [];
  return <DataTable keys={["name", "price", "duration"]} rows={items} />;
}

function AnalyticsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-analytics", id],
    queryFn: () => api.get<{ success: boolean; data: Record<string, unknown> }>(`/clinics/${id}/analytics`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const d = data?.data ?? {};
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(d).map(([k, v]) => (
        <div key={k} className="bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="text-xl font-bold text-foreground mt-1">{String(v ?? "—")}</p>
        </div>
      ))}
    </div>
  );
}

function BroadcastsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-broadcasts", id],
    queryFn: () => api.get<{ success: boolean; data: { runs: Record<string, unknown>[] } }>(`/clinics/${id}/broadcasts`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = (data?.data as { runs?: Record<string, unknown>[] } | undefined)?.runs ?? [];
  return <DataTable keys={["id", "status", "sentCount", "createdAt"]} rows={items} />;
}

function KnowledgeTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-knowledge", id],
    queryFn: () => api.get<{ success: boolean; data: { entries: Record<string, unknown>[] } }>(`/clinics/${id}/knowledge`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.entries ?? [];
  return <DataTable keys={["title", "type", "createdAt"]} rows={items} />;
}

function ContractsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-contracts", id],
    queryFn: () => api.get<{ success: boolean; data: { contracts: Record<string, unknown>[] } }>(`/clinics/${id}/contracts`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.contracts ?? [];
  return <DataTable keys={["patientName", "status", "createdAt"]} rows={items} />;
}

function FinancesTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-finances", id],
    queryFn: () => api.get<{ success: boolean; data: Record<string, unknown> }>(`/clinics/${id}/finances`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const d = data?.data ?? {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(d).map(([k, v]) => (
          <div key={k} className="bg-card rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-lg font-bold text-foreground mt-1">{String(v ?? "—")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClinicLogsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-logs", id],
    queryFn: () => api.get<{ success: boolean; data: { logs: Record<string, unknown>[] } }>(`/clinics/${id}/logs`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.logs ?? [];
  return <DataTable keys={["actionType", "entityType", "details", "createdAt"]} rows={items} />;
}

function NotificationsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-notifications", id],
    queryFn: () => api.get<{ success: boolean; data: { notifications?: Record<string, unknown>[] } }>(`/clinics/${id}/notifications`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.notifications ?? [];
  if (!items.length) return <EmptyState />;
  return <DataTable keys={["type", "message", "createdAt"]} rows={items} />;
}

function FilesTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-files", id],
    queryFn: () => api.get<{ success: boolean; data: { files?: Record<string, unknown>[] } }>(`/clinics/${id}/files`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.files ?? [];
  if (!items.length) return <EmptyState />;
  return <DataTable keys={["name", "type", "size", "createdAt"]} rows={items} />;
}

// -- Clinic Card root --

export default function ClinicCard({ clinic, onBack }: { clinic: Clinic; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("info");

  const tabContent: Record<Tab, JSX.Element> = {
    info: <InfoTab clinic={clinic} />,
    users: <UsersTab id={clinic.id} />,
    patients: <PatientsTab id={clinic.id} />,
    chatbot: <ChatbotTab id={clinic.id} />,
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground truncate">{clinic.name}</h2>
            <p className="text-xs text-muted-foreground">{currentTab?.icon} {currentTab?.label}</p>
          </div>
        </div>

        {/* Horizontal scrollable tab pills */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 pb-24">
        {tabContent[tab]}
      </div>
    </div>
  );
}
