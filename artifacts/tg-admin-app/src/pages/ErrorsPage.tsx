import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Clinic, type ErrorEventEntry } from "../lib/api";
import { haptic, hapticNotify } from "../hooks/useTgBackButton";

const SOURCES = ["api", "dental-crm", "tg-admin", "worker"] as const;
const SEVERITIES = ["error", "warning", "fatal"] as const;

const sourceLabels: Record<string, string> = {
  api: "API",
  "dental-crm": "CRM",
  "tg-admin": "Админка",
  worker: "Worker",
};

const severityStyles: Record<string, string> = {
  error: "text-red-400 bg-red-500/10",
  warning: "text-amber-400 bg-amber-500/10",
  fatal: "text-red-500 bg-red-500/20",
};

function ErrorCard({
  event,
  expanded,
  onToggle,
  onResolve,
  resolving,
}: {
  event: ErrorEventEntry;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
  resolving: boolean;
}) {
  const resolved = !!event.resolvedAt;
  return (
    <div className={`bg-card rounded-lg border p-3 space-y-2 ${resolved ? "border-border opacity-70" : "border-red-500/30"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${severityStyles[event.severity] ?? severityStyles.error}`}>
              {event.severity}
            </span>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {sourceLabels[event.source] ?? event.source}
            </span>
            {event.code && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">{event.code}</span>
            )}
            {resolved && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400">решено</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(event.createdAt).toLocaleString("ru")}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground break-words">{event.message}</p>
        {(event.url || event.method) && (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {event.method ? `${event.method} ` : ""}{event.url}
          </p>
        )}
        {event.clinicId && (
          <p className="text-[10px] text-muted-foreground font-mono">clinic: {event.clinicId.slice(0, 8)}…</p>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-border">
          {event.stack && (
            <pre className="text-[10px] leading-relaxed text-muted-foreground bg-background rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
              {event.stack}
            </pre>
          )}
          {event.metadata && (
            <pre className="text-[10px] leading-relaxed text-muted-foreground bg-background rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
          {!resolved && (
            <button
              type="button"
              disabled={resolving}
              onClick={onResolve}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20"
            >
              {resolving ? "Сохранение…" : "Отметить решённой"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ErrorsPage() {
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState("");
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-picker"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: Clinic[] } }>("/clinics"),
    staleTime: 60_000,
  });
  const clinics = clinicsData?.data?.clinics ?? [];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["tma-errors", clinicId, source, severity, search, unresolvedOnly, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (clinicId) params.set("clinicId", clinicId);
      if (source) params.set("source", source);
      if (severity) params.set("severity", severity);
      if (search) params.set("search", search);
      if (unresolvedOnly) params.set("unresolvedOnly", "true");
      return api.get<{
        success: boolean;
        data: {
          events: ErrorEventEntry[];
          total: number;
          unresolvedTotal: number;
          page: number;
        };
      }>(`/errors?${params}`);
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const events = data?.data?.events ?? [];
  const total = data?.data?.total ?? 0;
  const unresolvedTotal = data?.data?.unresolvedTotal ?? 0;

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.patch<{ success: boolean }>(`/errors/${id}/resolve`),
    onMutate: (id) => setResolvingId(id),
    onSettled: () => setResolvingId(null),
    onSuccess: () => {
      hapticNotify("success");
      void qc.invalidateQueries({ queryKey: ["tma-errors"] });
      void qc.invalidateQueries({ queryKey: ["tma-errors-summary"] });
    },
  });

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Ошибки системы</h1>
          <p className="text-sm text-muted-foreground">
            {unresolvedTotal > 0 ? `${unresolvedTotal} нерешённых` : "Нет активных ошибок"}
            {total > 0 ? ` · показано ${events.length} из ${total}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { haptic("light"); void refetch(); }}
          className="text-sm text-primary px-3 py-1.5 bg-primary/10 rounded-lg shrink-0"
        >
          {isFetching ? "…" : "↻"}
        </button>
      </div>

      <div className="space-y-2">
        <select
          value={clinicId}
          onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">Все клиники</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Все источники</option>
            {SOURCES.map((s) => <option key={s} value={s}>{sourceLabels[s]}</option>)}
          </select>
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Все уровни</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск по тексту, URL, коду…"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(e) => { setUnresolvedOnly(e.target.checked); setPage(1); }}
            className="rounded"
          />
          Только нерешённые
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Загрузка…</div>
      ) : events.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Ошибок не найдено</div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <ErrorCard
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId((id) => (id === event.id ? null : event.id))}
              onResolve={() => { haptic("medium"); resolveMutation.mutate(event.id); }}
              resolving={resolvingId === event.id}
            />
          ))}
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm disabled:opacity-40"
          >
            ← Назад
          </button>
          <span className="text-xs text-muted-foreground">Стр. {page}</span>
          <button
            type="button"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm disabled:opacity-40"
          >
            Далее →
          </button>
        </div>
      )}
    </div>
  );
}
