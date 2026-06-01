import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LogEntry, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

const ACTION_TYPES = ["CREATE", "UPDATE", "DELETE", "login", "assign", "approve", "cancel", "view"];

function LogRow({ log }: { log: LogEntry }) {
  const typeColors: Record<string, string> = {
    CREATE: "text-green-400", UPDATE: "text-blue-400", DELETE: "text-red-400",
    create: "text-green-400", update: "text-blue-400", delete: "text-red-400",
    login: "text-purple-400", approve: "text-emerald-400", cancel: "text-orange-400",
  };
  const color = Object.entries(typeColors).find(([k]) => log.actionType.toUpperCase().includes(k.toUpperCase()))?.[1] ?? "text-foreground";
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase ${color}`}>{log.actionType}</span>
        {log.entityType && <span className="text-xs text-muted-foreground">{log.entityType}</span>}
        {log.entityId && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">id:{log.entityId.slice(0, 8)}</span>}
        {log.userId && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">u:{log.userId.slice(0, 8)}</span>}
      </div>
      {log.details && <p className="text-sm text-foreground">{log.details}</p>}
      <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("ru")}</p>
    </div>
  );
}

export default function LogsPage() {
  const [clinicId, setClinicId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = clinicsData?.data?.clinics ?? [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tma-logs", clinicId, search, action, userId, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (action) params.set("action", action);
      if (userId) params.set("userId", userId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const endpoint = clinicId ? `/clinics/${clinicId}/logs?${params}` : `/logs?${params}`;
      return api.get<{ success: boolean; data: { logs: LogEntry[]; total: number; page: number } }>(endpoint);
    },
    staleTime: 30_000,
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const hasActiveFilters = !!(search || action || userId || dateFrom || dateTo);

  const clearFilters = () => { setSearch(""); setAction(""); setUserId(""); setDateFrom(""); setDateTo(""); setPage(1); };

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Логи</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} событий` : "Платформенные события"}
            {clinicId && clinics.find((c) => c.id === clinicId) ? ` · ${clinics.find((c) => c.id === clinicId)!.name}` : ""}
          </p>
        </div>
        <button onClick={() => { haptic("light"); void refetch(); }}
          className="text-sm text-primary px-3 py-1.5 bg-primary/10 rounded-lg">↻ Обновить</button>
      </div>

      {/* Primary filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={clinicId}
            onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="">🏥 Все клиники</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-2 rounded-lg border text-sm transition-colors ${hasActiveFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground"}`}
          >
            {hasActiveFilters ? `⚡ (${[search, action, userId, dateFrom, dateTo].filter(Boolean).length})` : "⚙️"}
          </button>
        </div>

        {showAdvanced && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Фильтры</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-red-400">Сбросить</button>
              )}
            </div>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Поиск по тексту / entity ID..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                <option value="">Все действия</option>
                {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setPage(1); }}
                placeholder="User ID..."
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">С даты</p>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">По дату</p>
                <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />)
          : logs.length === 0
            ? <p className="text-center text-muted-foreground text-sm py-8">Логов нет</p>
            : logs.map((log) => <LogRow key={log.id} log={log} />)
        }
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex gap-2 justify-center">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40">← Назад</button>
          <span className="px-3 py-2 text-sm text-muted-foreground">Стр. {page} · {total} записей</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={logs.length < 50}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  );
}
