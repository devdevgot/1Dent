import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardPaste, Copy, RefreshCw } from "lucide-react";
import { api, type Clinic, type ErrorEventEntry } from "../lib/api";
import { haptic, hapticNotify } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { PageHeaderIconButton } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";

const SOURCES = ["api", "dental-crm", "tg-admin", "worker"] as const;
const SEVERITIES = ["error", "warning", "fatal"] as const;

const sourceLabels: Record<string, string> = {
  api: "API",
  "dental-crm": "CRM",
  "tg-admin": "Админка",
  worker: "Worker",
};

const severityStyles: Record<string, string> = {
  error: "text-[#dc2626] bg-[#fef2f2]",
  warning: "text-[#d97706] bg-[#fef3c7]",
  fatal: "text-[#dc2626] bg-[#fef2f2] border border-[#dc2626]/20",
};

function formatErrorForCopy(event: ErrorEventEntry): string {
  const lines = [
    `[${event.severity.toUpperCase()}] ${sourceLabels[event.source] ?? event.source}`,
    `ID: ${event.id}`,
    `Время: ${new Date(event.createdAt).toLocaleString("ru")}`,
    event.code ? `Код: ${event.code}` : null,
    event.clinicId ? `Клиника: ${event.clinicId}` : null,
    event.method || event.url ? `Запрос: ${event.method ?? ""} ${event.url ?? ""}`.trim() : null,
    "",
    event.message,
    event.stack ? `\n--- Stack trace ---\n${event.stack}` : null,
    event.metadata ? `\n--- Metadata ---\n${JSON.stringify(event.metadata, null, 2)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function ErrorCard({
  event,
  expanded,
  onToggle,
  onResolve,
  resolving,
  copied,
  onCopy,
}: {
  event: ErrorEventEntry;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
  resolving: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const resolved = !!event.resolvedAt;
  return (
    <div className={`bg-white rounded-xl border p-3 space-y-2 ${resolved ? "border-[#e8e3d9] opacity-70" : "border-[#dc2626]/30"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${severityStyles[event.severity] ?? severityStyles.error}`}>
              {event.severity}
            </span>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-[#f1ede4] text-[#64748b]">
              {sourceLabels[event.source] ?? event.source}
            </span>
            {event.code && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#f1ede4] text-[#64748b]">{event.code}</span>
            )}
            {resolved && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#f0fdf4] text-[#16a34a]">решено</span>
            )}
          </div>
          <span className="text-[10px] text-[#64748b] shrink-0">
            {new Date(event.createdAt).toLocaleString("ru")}
          </span>
        </div>
        <p className="text-sm font-medium text-[#0f172a] break-words">{event.message}</p>
        {(event.url || event.method) && (
          <p className="text-xs text-[#64748b] font-mono truncate">
            {event.method ? `${event.method} ` : ""}{event.url}
          </p>
        )}
        {event.clinicId && (
          <p className="text-[10px] text-[#64748b] font-mono">clinic: {event.clinicId.slice(0, 8)}…</p>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-[#e8e3d9]">
          {event.stack && (
            <pre className="text-[10px] leading-relaxed text-[#64748b] bg-[#faf8f4] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
              {event.stack}
            </pre>
          )}
          {event.metadata && (
            <pre className="text-[10px] leading-relaxed text-[#64748b] bg-[#faf8f4] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[#f1ede4] text-[#64748b] border border-[#e8e3d9]"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
            {!resolved && (
              <button
                type="button"
                disabled={resolving}
                onClick={onResolve}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20"
              >
                {resolving ? "Сохранение…" : "Отметить решённой"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErrorsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState("");
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

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

  const handleCopy = useCallback(async (event: ErrorEventEntry) => {
    haptic("light");
    const ok = await copyToClipboard(formatErrorForCopy(event));
    if (ok) {
      setCopiedId(event.id);
      hapticNotify("success");
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      hapticNotify("error");
    }
  }, []);

  const handlePaste = useCallback(async () => {
    haptic("light");
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setSearch(text.trim());
        setPage(1);
        setPasteHint("Текст вставлен в поиск");
        hapticNotify("success");
        setTimeout(() => setPasteHint(null), 2000);
      }
    } catch {
      hapticNotify("error");
      setPasteHint("Нет доступа к буферу обмена");
      setTimeout(() => setPasteHint(null), 3000);
    }
  }, []);

  return (
    <TmaPage
      title="Ошибки системы"
      subtitle={
        unresolvedTotal > 0
          ? `${unresolvedTotal} нерешённых${total > 0 ? ` · ${events.length} из ${total}` : ""}`
          : total > 0 ? `Показано ${events.length} из ${total}` : "Нет активных ошибок"
      }
      onBack={() => navigate("/more")}
      right={
        <PageHeaderIconButton
          title="Обновить"
          onClick={() => { haptic("light"); void refetch(); }}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </PageHeaderIconButton>
      }
    >
      <div className="space-y-2">
        <select
          value={clinicId}
          onChange={(e) => { setClinicId(e.target.value); setPage(1); }}
          className="w-full bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:border-[#1f75fe]"
        >
          <option value="">Все клиники</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex gap-2">
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="flex-1 bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">Все источники</option>
            {SOURCES.map((s) => <option key={s} value={s}>{sourceLabels[s]}</option>)}
          </select>
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="flex-1 bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">Все уровни</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Поиск по тексту, URL, коду…"
            className="flex-1 bg-white border border-[#e8e3d9] rounded-xl px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void handlePaste()}
            title="Вставить из буфера"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e8e3d9] bg-white text-[#64748b] text-xs font-medium hover:bg-[#f1ede4] transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            Вставить
          </button>
        </div>
        {pasteHint && (
          <p className="text-xs text-[#1f75fe] px-1">{pasteHint}</p>
        )}

        <label className="flex items-center gap-2 text-sm text-[#64748b]">
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
        <div className="text-center py-10 text-[#64748b] text-sm">Загрузка…</div>
      ) : events.length === 0 ? (
        <EmptyState text="Ошибок не найдено" />
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
              copied={copiedId === event.id}
              onCopy={() => void handleCopy(event)}
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
            className="px-3 py-1.5 rounded-xl bg-white border border-[#e8e3d9] text-sm disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-xs text-[#64748b]">Стр. {page}</span>
          <button
            type="button"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-xl bg-white border border-[#e8e3d9] text-sm disabled:opacity-40"
          >
            Далее
          </button>
        </div>
      )}
    </TmaPage>
  );
}
