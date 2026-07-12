import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, FileText, Trash2, Loader2, Plus, Sparkles, CheckCircle2,
  AlertCircle, Clock, X, Upload, AlignLeft, ChevronDown, ChevronUp,
  BookOpen, RefreshCw, Wand2, ListChecks, Info,
} from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/lib/base-url";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";

// ── Error message helper ──────────────────────────────────────────────────────
function friendlyError(msg: string | null | undefined): string {
  if (!msg) return "Не удалось обработать источник";
  const m = msg.toLowerCase();
  if (m.includes("429")) return "Сайт временно заблокировал доступ — попробуйте позже или удалите и добавьте снова";
  if (m.includes("403") || m.includes("forbidden")) return "Сайт запрещает автоматический доступ";
  if (m.includes("404") || m.includes("not found")) return "Страница не найдена — проверьте ссылку";
  if (m.includes("timeout") || m.includes("timed out")) return "Сайт не ответил вовремя — попробуйте позже";
  if (m.includes("enotfound") || m.includes("econnrefused") || m.includes("network")) return "Не удалось подключиться к сайту — проверьте ссылку";
  if (m.includes("ssl") || m.includes("certificate")) return "Ошибка безопасного соединения с сайтом";
  if (m.includes("500") || m.includes("502") || m.includes("503")) return "Сервер сайта временно недоступен";
  if (m.includes("invalid url") || m.includes("invalid") && m.includes("url")) return "Некорректная ссылка";
  return "Не удалось загрузить страницу — проверьте ссылку";
}

// ── Auth helper ───────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}
async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(getApiErrorMessage({ data: body }, res.statusText));
  }
  return res.json();
}

const PROMPT_AMENDMENTS_MARKER = "=== ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ (доработки клиники) ===";

function splitComposedPrompt(prompt: string): { base: string; amendments: string[] } {
  const trimmed = prompt.trim();
  const idx = trimmed.indexOf(PROMPT_AMENDMENTS_MARKER);
  if (idx === -1) return { base: trimmed, amendments: [] };

  const base = trimmed.slice(0, idx).trim();
  const block = trimmed.slice(idx + PROMPT_AMENDMENTS_MARKER.length).trim();
  if (!block) return { base, amendments: [] };

  const amendments = block
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[\).\]]\s*/, "").trim())
    .filter(Boolean);

  return { base, amendments };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PromptStatus {
  exists: boolean;
  refined: boolean;
  length: number;
  prompt: string | null;
  amendmentsCount: number;
  amendments: string[];
  baseLength: number;
}

interface KnowledgeSource {
  id: string;
  type: "url" | "file";
  name: string;
  url?: string | null;
  status: "pending" | "ready" | "error";
  errorMessage?: string | null;
  createdAt: string;
}

// ── Main KnowledgeTab component ───────────────────────────────────────────────
export function KnowledgeTab() {
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [composing, setComposing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineInstructions, setRefineInstructions] = useState("");
  const [promptStatus, setPromptStatus] = useState<PromptStatus>({
    exists: false,
    refined: false,
    length: 0,
    prompt: null,
    amendmentsCount: 0,
    amendments: [],
    baseLength: 0,
  });
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [rescanningIds, setRescanningIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPromptStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/knowledge/prompt-status");
      const data = res.data as Partial<PromptStatus> | undefined;
      setPromptStatus({
        exists: data?.exists ?? false,
        refined: data?.refined ?? false,
        length: data?.length ?? 0,
        prompt: data?.prompt ?? null,
        amendmentsCount: data?.amendmentsCount ?? data?.amendments?.length ?? 0,
        amendments: data?.amendments ?? [],
        baseLength: data?.baseLength ?? 0,
      });
    } catch {
      // silent
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/knowledge");
      setSources((res.data.sources as KnowledgeSource[]) ?? []);
      await loadPromptStatus();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [loadPromptStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll when any source is pending
  useEffect(() => {
    const hasPending = sources.some((s) => s.status === "pending");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 3000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [sources, load]);

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setAddingUrl(true);
    try {
      const res = await apiFetch("/api/knowledge/url", {
        method: "POST",
        body: JSON.stringify({ url, name: new URL(url).hostname }),
      });
      setSources((prev) => [...prev, res.data.source as KnowledgeSource]);
      setUrlInput("");
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    } finally {
      setAddingUrl(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const urlRes = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = urlRes as { uploadURL: string; objectPath: string };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      const regRes = await apiFetch("/api/knowledge/file", {
        method: "POST",
        body: JSON.stringify({ objectPath, name: file.name, mimeType: file.type }),
      });
      setSources((prev) => [...prev, regRes.data.source as KnowledgeSource]);
      toast({ title: "Файл загружен", description: "Извлечение текста начато…" });
    } catch (err) {
      toast({ title: "Ошибка загрузки", description: String(err), variant: "destructive" });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddText = async () => {
    if (!textContent.trim()) return;
    setAddingText(true);
    try {
      const name = textName.trim() || "Текстовый источник";
      const res = await apiFetch("/api/knowledge/text", {
        method: "POST",
        body: JSON.stringify({ name, text: textContent.trim() }),
      });
      setSources((prev) => [...prev, res.data.source as KnowledgeSource]);
      setTextName("");
      setTextContent("");
      setTextModalOpen(false);
      toast({ title: "Текст добавлен", description: "Источник готов для генерации скриптов" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    } finally {
      setAddingText(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" });
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  };

  const handleRescan = async (id: string) => {
    setRescanningIds((prev) => new Set(prev).add(id));
    try {
      const res = await apiFetch(`/api/knowledge/${id}/rescan`, { method: "POST" });
      setSources((prev) => prev.map((s) => s.id === id ? (res.data.source as KnowledgeSource) : s));
      toast({ title: "Обновление запущено", description: "Идёт повторное извлечение контента…" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    } finally {
      setRescanningIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const applyPromptResponse = (data: {
    prompt?: string;
    promptLength?: number;
    refined?: boolean;
    amendmentsCount?: number;
    amendments?: string[];
    amendment?: string;
    baseLength?: number;
  }) => {
    const prompt = data.prompt ?? null;
    const length = data.promptLength ?? prompt?.length ?? 0;
    const split = prompt ? splitComposedPrompt(prompt) : { base: "", amendments: [] as string[] };
    const amendments = data.amendments ?? split.amendments;
    const amendmentsCount = data.amendmentsCount ?? amendments.length;
    setPromptStatus({
      exists: Boolean(prompt),
      refined: data.refined ?? amendmentsCount > 0,
      length,
      prompt,
      amendmentsCount,
      amendments,
      baseLength: data.baseLength ?? split.base.length,
    });
    if (prompt) setPromptExpanded(true);
  };

  const postPromptAction = async (
    path: "/api/knowledge/compose-prompt" | "/api/knowledge/refine-prompt",
    timeoutMs: number,
    body?: Record<string, unknown>,
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = getToken();
      const res = await fetch(`${getBaseUrl()}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage({ data: body }, "Ошибка сервера"));
      }
      const json = await res.json();
      applyPromptResponse(json.data ?? {});
      return json;
    } finally {
      clearTimeout(timer);
    }
  };

  const handleComposePrompt = async () => {
    setComposing(true);
    try {
      await postPromptAction("/api/knowledge/compose-prompt", 100_000);
      toast({
        title: "Промпт создан",
        description: "Claude Opus 4.8 собрал базовый system prompt. При желании нажмите «Доработать» и опишите дополнительные условия.",
      });
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      toast({
        title: "Не удалось создать промпт",
        description: isAbort
          ? "Генерация заняла слишком много времени. Попробуйте ещё раз."
          : err instanceof Error ? err.message : "Попробуйте ещё раз.",
        variant: "destructive",
      });
    } finally {
      setComposing(false);
    }
  };

  const handleRefinePrompt = async () => {
    const instructions = refineInstructions.trim();
    if (instructions.length < 5) {
      toast({
        title: "Опишите доработку",
        description: "Напишите хотя бы несколько слов — что именно нужно изменить в поведении бота.",
        variant: "destructive",
      });
      return;
    }

    setRefining(true);
    try {
      const json = await postPromptAction("/api/knowledge/refine-prompt", 70_000, { instructions });
      const amendment = (json.data as { amendment?: string } | undefined)?.amendment;
      setRefineInstructions("");
      setRefineModalOpen(false);
      toast({
        title: "Условие добавлено",
        description: amendment
          ? `Новое правило добавлено к промпту. Базовый промпт не изменён.`
          : "Доработка сохранена. Базовый промпт не изменён.",
      });
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      toast({
        title: "Не удалось добавить условие",
        description: isAbort
          ? "Доработка заняла слишком много времени. Попробуйте ещё раз."
          : err instanceof Error ? err.message : "Попробуйте ещё раз.",
        variant: "destructive",
      });
    } finally {
      setRefining(false);
    }
  };

  const promptPreview = promptStatus.prompt ? splitComposedPrompt(promptStatus.prompt) : null;

  const readySources = sources.filter((s) => s.status === "ready");
  const pendingSources = sources.filter((s) => s.status === "pending");

  const showAddForms = sources.length === 0 || addSourceOpen;

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-[#0f172a]">База знаний</p>
        <p className="text-xs text-[#64748b] mt-0.5">
          Добавьте ссылки и файлы — Claude Opus составит единый промпт, Gemini ведёт диалог
        </p>
      </div>

      {/* Add-source forms — visible when no sources yet, or manually opened */}
      {showAddForms && (
        <>
          {/* URL input */}
          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-3">
            <p className="text-xs font-medium text-[#0f172a]">Добавить ссылку</p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddUrl(); }}
                className="flex-1 h-9 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => void handleAddUrl()}
                disabled={addingUrl || !urlInput.trim()}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#1f75fe] text-white text-xs font-medium disabled:opacity-50 hover:bg-[#1a65e8] transition-colors shrink-0"
              >
                {addingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Добавить
              </button>
            </div>
            <p className="text-[11px] text-[#64748b]">
              Сайт клиники, Instagram, 2GIS, отзывы — любая публичная страница
            </p>
          </div>

          {/* File / text buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFileModalOpen(true)}
              className="flex items-center gap-2 h-9 px-3 rounded-xl border border-[#e8e3d9] bg-white hover:bg-[#faf8f4] text-xs font-medium text-[#64748b] hover:text-[#0f172a] transition-colors"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              Загрузить файл / фото
            </button>
            <button
              onClick={() => setTextModalOpen(true)}
              className="flex items-center gap-2 h-9 px-3 rounded-xl border border-[#e8e3d9] bg-white hover:bg-[#faf8f4] text-xs font-medium text-[#64748b] hover:text-[#0f172a] transition-colors"
            >
              <AlignLeft className="h-3.5 w-3.5 shrink-0" />
              Добавить текст
            </button>
          </div>
        </>
      )}

      {/* File upload modal */}
      <AppDialog
        open={fileModalOpen}
        onOpenChange={(open) => { if (!uploadingFile) setFileModalOpen(open); }}
        title="Загрузить файл или фото"
        description="Прайс-лист, скрипт, фото актуального — до 10 МБ"
        size="sm"
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="w-full flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-[#e8e3d9] hover:border-[var(--ds-primary)]/50 hover:bg-[var(--primary-light)] transition-colors text-sm text-[#64748b] disabled:opacity-50"
        >
          {uploadingFile ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-[#1f75fe]" />
              <span className="text-xs">Загрузка…</span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-[#94a3b8]/60" />
              <span className="text-xs font-medium">Нажмите, чтобы выбрать файл</span>
              <span className="text-[11px] text-[#94a3b8]/70">PDF, DOCX, TXT, JPG, PNG, WEBP</span>
            </>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.bmp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              void handleFileUpload(f).then(() => setFileModalOpen(false));
            }
          }}
        />
      </AppDialog>

      {/* Text modal */}
      <AppDialog
        open={textModalOpen}
        onOpenChange={(open) => { if (!addingText) setTextModalOpen(open); }}
        title="Добавить текст"
        description="Адреса, расписание, прайс — скопируйте из Instagram, 2GIS или напишите вручную"
        size="sm"
        footer={
          <button
            onClick={() => void handleAddText()}
            disabled={addingText || !textContent.trim()}
            className="dash-btn dash-btn-primary w-full flex items-center justify-center gap-2"
          >
            {addingText ? <><Loader2 className="h-4 w-4 animate-spin" /> Добавление…</> : <>Добавить источник</>}
          </button>
        }
      >
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Название (например: Адреса клиники)"
            value={textName}
            onChange={(e) => setTextName(e.target.value)}
            className="w-full h-9 rounded-xl border border-[#e8e3d9] bg-white px-3 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20"
          />

          <textarea
            placeholder={"Вставьте или напишите текст…\n\nНапример:\nАдреса клиники:\n• ул. Абая 12 — пн-пт 9:00–19:00\n• ул. Навои 5 — пн-сб 9:00–20:00"}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={7}
            className="w-full rounded-xl border border-[#e8e3d9] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 resize-none"
          />
        </div>
      </AppDialog>

      {/* Sources list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 text-[#1f75fe] animate-spin" />
        </div>
      ) : sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#64748b]">
            {sources.length} источник{sources.length === 1 ? "" : sources.length < 5 ? "а" : "ов"}
            {pendingSources.length > 0 && (
              <span className="ml-2 text-amber-600 animate-pulse">· {pendingSources.length} обрабатывается…</span>
            )}
          </p>
          <div className="divide-y divide-[#e8e3d9] rounded-2xl border border-[#e8e3d9] bg-white overflow-hidden">
            {sources.map((source) => {
              const isRescanning = rescanningIds.has(source.id);
              return (
                <div key={source.id} className="flex flex-col gap-1 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      {source.type === "text"
                        ? <AlignLeft className="h-3.5 w-3.5 text-teal-500" />
                        : source.type === "url"
                          ? <Globe className="h-3.5 w-3.5 text-blue-500" />
                          : <FileText className="h-3.5 w-3.5 text-violet-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#0f172a] truncate">{source.name}</p>
                      {source.url && (
                        <p className="text-[10px] text-[#64748b] truncate">{source.url}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {source.status === "pending" && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                      {source.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {source.status === "error" && (
                        <div className="flex items-center gap-1.5 max-w-[120px]">
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span className="text-[10px] text-red-500 truncate" title={friendlyError(source.errorMessage)}>
                            {friendlyError(source.errorMessage)}
                          </span>
                        </div>
                      )}
                      {source.type === "url" && (
                        <button
                          onClick={() => void handleRescan(source.id)}
                          disabled={isRescanning || source.status === "pending"}
                          title="Повторно извлечь контент"
                          className="p-1 rounded hover:bg-blue-50 text-[#64748b] hover:text-blue-500 transition-colors disabled:opacity-40"
                        >
                          <RefreshCw className={cn("h-3 w-3", isRescanning && "animate-spin")} />
                        </button>
                      )}
                      <button
                        onClick={() => void handleDeleteSource(source.id)}
                        className="p-1 rounded hover:bg-red-50 text-[#64748b] hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "Add source" toggle — shown only when sources already exist */}
      {sources.length > 0 && (
        <button
          onClick={() => setAddSourceOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-[#e8e3d9] bg-white hover:bg-[#faf8f4] text-xs font-medium text-[#64748b] hover:text-[#0f172a] transition-colors"
        >
          {addSourceOpen
            ? <><ChevronUp className="h-3.5 w-3.5" /> Скрыть формы добавления</>
            : <><Plus className="h-3.5 w-3.5" /> Добавить источник</>
          }
        </button>
      )}

      {/* Prompt pipeline: Opus creates, Sonnet refines */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => void handleComposePrompt()}
          disabled={composing || refining || readySources.length === 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all",
            readySources.length > 0 && !composing && !refining
              ? "bg-[#1f75fe] text-white hover:bg-[#1a65e8]"
              : "bg-[#f1ede4] text-[#64748b] cursor-not-allowed",
          )}
        >
          {composing
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Создание промпта (Opus)…</>
            : <><Sparkles className="h-4 w-4" /> Создать промпт</>
          }
        </button>

        <button
          onClick={() => setRefineModalOpen(true)}
          disabled={composing || refining || !promptStatus.exists}
          className={cn(
            "w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium transition-all border",
            promptStatus.exists && !composing && !refining
              ? "border-[#1f75fe] text-[#1f75fe] bg-white hover:bg-[#f0f7ff]"
              : "border-[#e8e3d9] text-[#64748b] bg-white cursor-not-allowed",
          )}
        >
          {refining
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Добавление условия…</>
            : promptStatus.amendmentsCount > 0
              ? <><Wand2 className="h-4 w-4" /> Доработать ({promptStatus.amendmentsCount})</>
              : <><Wand2 className="h-4 w-4" /> Доработать</>
          }
        </button>

        {promptStatus.exists && (
          <p className="text-xs text-center text-[#64748b]">
            {promptStatus.amendmentsCount > 0
              ? `Базовый промпт: ${(promptStatus.baseLength || promptPreview?.base.length || 0).toLocaleString("ru-RU")} симв. · ${promptStatus.amendmentsCount} доработ${promptStatus.amendmentsCount === 1 ? "ка" : promptStatus.amendmentsCount < 5 ? "ки" : "ок"}`
              : `Черновик: ${promptStatus.length.toLocaleString("ru-RU")} символов — можно добавить условия`}
          </p>
        )}
      </div>

      {/* Refine modal */}
      <AppDialog
        open={refineModalOpen}
        onOpenChange={(open) => { if (!refining) setRefineModalOpen(open); }}
        title="Доработать промпт"
        description="Опишите, что нужно изменить в поведении бота. Базовый промпт останется без изменений — добавится только новое условие."
        size="lg"
        footer={
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={() => void handleRefinePrompt()}
              disabled={refining || refineInstructions.trim().length < 5}
              className="dash-btn dash-btn-primary w-full flex items-center justify-center gap-2"
            >
              {refining
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Добавление…</>
                : <><Wand2 className="h-4 w-4" /> Добавить условие</>
              }
            </button>
            <p className="text-[11px] text-center text-[#64748b]">
              Можно добавлять несколько условий — каждое дополняет предыдущие
            </p>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[#dbeafe] bg-[#f0f7ff] px-3.5 py-3">
            <Info className="h-4 w-4 text-[#1f75fe] shrink-0 mt-0.5" />
            <p className="text-xs text-[#334155] leading-relaxed">
              Мы <span className="font-medium">не переписываем</span> существующий промпт Opus.
              Ваше описание превратится в одно короткое правило и добавится в конец — так чатбот продолжит работать стабильно.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="refine-instructions" className="text-xs font-medium text-[#0f172a]">
              Что доработать?
            </label>
            <textarea
              id="refine-instructions"
              placeholder={"Опишите своими словами, что должен делать бот по-другому.\n\nНапример:\n• Не предлагать скидки, пока пациент сам не спросит\n• Всегда уточнять филиал перед записью\n• Отвечать на казахском, если пациент пишет на казахском"}
              value={refineInstructions}
              onChange={(e) => setRefineInstructions(e.target.value)}
              rows={7}
              maxLength={2000}
              className="w-full rounded-xl border border-[#e8e3d9] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 resize-none"
            />
            <p className="text-[11px] text-[#94a3b8] text-right">
              {refineInstructions.length}/2000
            </p>
          </div>

          {promptStatus.amendments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#64748b] flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Уже добавленные условия ({promptStatus.amendments.length})
              </p>
              <ol className="space-y-1.5 rounded-xl border border-[#e8e3d9] bg-[#faf8f4] p-3">
                {promptStatus.amendments.map((rule, i) => (
                  <li key={`${i}-${rule.slice(0, 24)}`} className="flex gap-2 text-xs text-[#334155] leading-relaxed">
                    <span className="shrink-0 font-semibold text-[#1f75fe]">{i + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </AppDialog>

      {promptStatus.prompt && promptPreview && (
        <div className="rounded-xl border border-[#e8e3d9] bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setPromptExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-[#e8e3d9] bg-[#faf8f4] text-left"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#1f75fe]" />
              <span className="text-sm font-semibold text-[#0f172a]">Промпт чатбота</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#64748b]">
                {promptStatus.amendmentsCount > 0
                  ? `Opus + ${promptStatus.amendmentsCount} доработ${promptStatus.amendmentsCount === 1 ? "ка" : promptStatus.amendmentsCount < 5 ? "ки" : "ок"}`
                  : "Черновик Opus"}
              </span>
              {promptExpanded
                ? <ChevronUp className="h-4 w-4 text-[#64748b]" />
                : <ChevronDown className="h-4 w-4 text-[#64748b]" />
              }
            </div>
          </button>
          {promptExpanded && (
            <div className="max-h-[min(50vh,480px)] overflow-y-auto">
              <div className="p-4 border-b border-[#e8e3d9]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b] mb-2">
                  Базовый промпт (не изменяется)
                </p>
                <pre className="text-xs text-[#334155] whitespace-pre-wrap font-mono leading-relaxed">
                  {promptPreview.base}
                </pre>
              </div>
              {promptPreview.amendments.length > 0 && (
                <div className="p-4 bg-[#f0f7ff]/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1f75fe] mb-2">
                    Дополнительные условия
                  </p>
                  <ol className="space-y-2">
                    {promptPreview.amendments.map((rule, i) => (
                      <li key={`preview-${i}-${rule.slice(0, 16)}`} className="flex gap-2 text-xs text-[#334155] leading-relaxed">
                        <span className="shrink-0 font-semibold text-[#1f75fe]">{i + 1}.</span>
                        <span className="font-mono">{rule}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {readySources.length === 0 && sources.length > 0 && pendingSources.length > 0 && (
        <p className="text-xs text-center text-[#64748b]">
          Дождитесь обработки источников, затем нажмите «Создать промпт»
        </p>
      )}
      {sources.length === 0 && (
        <p className="text-xs text-center text-[#64748b]">
          Добавьте хотя бы один источник — чатбот будет отвечать по вашим материалам
        </p>
      )}
    </div>
  );
}

// ── Knowledge modal (fullscreen) ──────────────────────────────────────────────
interface KnowledgeModalProps {
  open: boolean;
  onClose: () => void;
}

export function KnowledgeModal({ open, onClose }: KnowledgeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f1f5f9] font-manrope">
      <div className="shrink-0 flex items-center gap-4 px-5 py-4 bg-white border-b border-[#e8e3d9] shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#60a5fa] text-white shadow-sm shrink-0">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[#0f172a]">База знаний</p>
          <p className="text-xs text-[#64748b] leading-tight mt-0.5">
            Материалы клиники → Claude Opus составляет промпт → Gemini ведёт диалог
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-[#f1f5f9] transition-colors shrink-0"
        >
          <X className="h-5 w-5 text-[#64748b]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <KnowledgeTab />
      </div>
    </div>
  );
}

/** @deprecated Use KnowledgeModal */
export const KnowledgeAndScriptModal = KnowledgeModal;
