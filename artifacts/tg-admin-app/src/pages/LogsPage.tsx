import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LogEntry, type Clinic } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

function LogRow({ log }: { log: LogEntry }) {
  const typeColors: Record<string, string> = {
    CREATE: "text-green-400", UPDATE: "text-blue-400", DELETE: "text-red-400",
    create: "text-green-400", update: "text-blue-400", delete: "text-red-400",
    login: "text-purple-400",
  };
  const color = Object.entries(typeColors).find(([k]) => log.actionType.toUpperCase().includes(k.toUpperCase()))?.[1] ?? "text-foreground";
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase ${color}`}>{log.actionType}</span>
        {log.entityType && <span className="text-xs text-muted-foreground">{log.entityType}</span>}
        {log.userId && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">uid:{log.userId.slice(0, 8)}</span>}
      </div>
      {log.description && <p className="text-sm text-foreground">{log.description}</p>}
      <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("ru")}</p>
    </div>
  );
}

export default function LogsPage() {
  const [clinicId, setClinicId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = clinicsData?.data?.clinics ?? [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tma-logs", clinicId, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const endpoint = clinicId ? `/clinics/${clinicId}/logs?${params}` : `/logs?${params}`;
      return api.get<{ success: boolean; data: { logs: LogEntry[]; total: number; page: number } }>(endpoint);
    },
    staleTime: 30_000,
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;

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

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={clinicId}
          onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">🏥 Все клиники</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск..."
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        />
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
          <span className="px-3 py-2 text-sm text-muted-foreground">Стр. {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={logs.length < 50}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  );
}
