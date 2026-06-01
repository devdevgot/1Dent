import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LogEntry } from "../lib/api";

function LogRow({ log }: { log: LogEntry }) {
  const typeColors: Record<string, string> = {
    create: "text-green-400",
    update: "text-blue-400",
    delete: "text-red-400",
    login: "text-purple-400",
    logout: "text-muted-foreground",
  };
  const color = Object.entries(typeColors).find(([k]) => log.actionType.includes(k))?.[1] ?? "text-foreground";
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-mono font-bold ${color}`}>{log.actionType}</span>
        <span className="text-xs text-muted-foreground">{log.entityType}</span>
        {log.clinicId && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
            {log.clinicId.slice(0, 8)}…
          </span>
        )}
      </div>
      {log.details && <p className="text-xs text-foreground/80">{log.details}</p>}
      <p className="text-xs text-muted-foreground">
        {new Date(log.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </div>
  );
}

export default function Logs() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-logs", page],
    queryFn: () => api.get<{ success: boolean; data: { logs: LogEntry[]; total: number; page: number } }>(`/logs?page=${page}`),
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="px-4 pt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Логи</h1>
        <p className="text-sm text-muted-foreground">Все действия платформы · {total} записей</p>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />
            ))
          : logs.map((log) => <LogRow key={log.id} log={log} />)}
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
