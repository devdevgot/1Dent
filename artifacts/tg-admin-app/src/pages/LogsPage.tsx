import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LogEntry, type Clinic } from "../lib/api";
import { useTgBackButton, haptic } from "../hooks/useTgBackButton";

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
        <h1 className="text-xl font-bold text-foreground">Логи</h1>
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
              </div>
              <span className="text-muted-foreground text-lg">›</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const typeColors: Record<string, string> = {
    CREATE: "text-green-400", UPDATE: "text-blue-400", DELETE: "text-red-400", login: "text-purple-400",
    create: "text-green-400", update: "text-blue-400", delete: "text-red-400",
  };
  const color = Object.entries(typeColors).find(([k]) => log.actionType.toUpperCase().includes(k.toUpperCase()))?.[1] ?? "text-foreground";
  return (
    <div className="bg-card rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-mono font-bold ${color}`}>{log.actionType}</span>
        <span className="text-xs text-muted-foreground">{log.entityType}</span>
      </div>
      {log.details && <p className="text-xs text-foreground/80 line-clamp-2">{log.details}</p>}
      <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
    </div>
  );
}

function LogsContent({ clinic, onBack }: { clinic: { id: string; name: string }; onBack: () => void }) {
  const [page, setPage] = useState(1);

  const handleBack = useCallback(() => { haptic("light"); onBack(); }, [onBack]);
  useTgBackButton(handleBack);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-logs-content", clinic.id, page],
    queryFn: () => api.get<{ success: boolean; data: { logs: LogEntry[]; total: number } }>(`/clinics/${clinic.id}/logs?page=${page}`),
  });

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="px-4 pt-4 space-y-4 pb-4">
      <div className="flex items-center gap-2">
        <button onClick={handleBack} className="text-muted-foreground">←</button>
        <div>
          <h1 className="text-lg font-bold text-foreground">{clinic.name}</h1>
          <p className="text-xs text-muted-foreground">Логи · {total} записей</p>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-card rounded-lg border border-border animate-pulse" />)
          : logs.length === 0
          ? <div className="py-10 text-center"><p className="text-3xl mb-2">📋</p><p className="text-sm text-muted-foreground">Нет логов</p></div>
          : logs.map((log) => <LogRow key={log.id} log={log} />)}
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

export default function LogsPage() {
  const [clinic, setClinic] = useState<{ id: string; name: string } | null>(null);
  if (!clinic) return <ClinicPickerScreen onSelect={setClinic} />;
  return <LogsContent clinic={clinic} onBack={() => setClinic(null)} />;
}
