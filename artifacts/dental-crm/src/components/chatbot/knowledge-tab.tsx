import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, FileText, Trash2, Loader2, Plus, Sparkles, CheckCircle2,
  AlertCircle, Clock, X, Upload, AlignLeft, ChevronDown, ChevronUp,
  BookOpen, GitBranch, Maximize2, RefreshCw,
} from "lucide-react";
import { ScriptMindMap, ScriptMindMapModal, type ScriptMindMapData } from "./script-mindmap";
import { AppDialog } from "@/components/layout/app-dialog";
import { cn } from "@/lib/utils";
import { guessFsmStateFromLabel } from "@/lib/chatbot-fsm-states";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/lib/base-url";
import { getApiErrorMessage } from "@/lib/api-error-message";

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

// ── Types ─────────────────────────────────────────────────────────────────────
interface KnowledgeSource {
  id: string;
  type: "url" | "file";
  name: string;
  url?: string | null;
  status: "pending" | "ready" | "error";
  errorMessage?: string | null;
  createdAt: string;
}

interface ScriptNode {
  id: string;
  label: string;
  detail?: string;
  children?: ScriptNode[];
}

interface GeneratedScript {
  title: string;
  nodes: ScriptNode[];
}

// ── Convert AI-generated scripts to ScriptMindMapData ─────────────────────────
function convertGeneratedScriptsToMindMap(
  primaryScript?: GeneratedScript,
  repeatScript?: GeneratedScript,
): ScriptMindMapData {
  const nodes: ScriptMindMapData["nodes"] = [];
  const edges: ScriptMindMapData["edges"] = [];

  nodes.push({ id: "root", label: "Скрипты продаж", content: "", isRoot: true });

  function flattenTree(node: ScriptNode, parentId: string, prefix: string) {
    const id = `${prefix}_${node.id}`;
    nodes.push({
      id,
      label: node.label,
      content: node.detail ?? "",
      fsmState: guessFsmStateFromLabel(node.label),
    });
    edges.push({
      id: `e_${parentId}_${id}`,
      source: parentId,
      target: id,
      label: node.label,
    });
    for (const child of node.children ?? []) {
      flattenTree(child, id, prefix);
    }
  }

  if (primaryScript) {
    nodes.push({ id: "p_root", label: primaryScript.title, content: "" });
    edges.push({ id: "e_root_p_root", source: "root", target: "p_root" });
    for (const n of primaryScript.nodes) flattenTree(n, "p_root", "p");
  }

  if (repeatScript) {
    nodes.push({ id: "r_root", label: repeatScript.title, content: "" });
    edges.push({ id: "e_root_r_root", source: "root", target: "r_root" });
    for (const n of repeatScript.nodes) flattenTree(n, "r_root", "r");
  }

  return { nodes, edges };
}

// ── Main KnowledgeTab component ───────────────────────────────────────────────
export function KnowledgeTab({
  onScriptsGenerated,
  hasExistingMindMap = false,
}: {
  onScriptsGenerated?: (data: ScriptMindMapData) => void;
  hasExistingMindMap?: boolean;
}) {
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/knowledge");
      setSources((res.data.sources as KnowledgeSource[]) ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleGenerate = async () => {
    if (hasExistingMindMap) {
      const ok = window.confirm(
        "Текущий майнд-мэп скрипта будет заменён новой генерацией. Продолжить?",
      );
      if (!ok) return;
    }
    setGenerating(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 130_000);
    try {
      const token = getToken();
      const res = await fetch(`${getBaseUrl()}/api/knowledge/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage({ data: body }, "Ошибка сервера"));
      }
      const json = await res.json();
      const { primaryScript, repeatScript, scriptMindMap, mindMapValidation } = json.data as {
        primaryScript: GeneratedScript;
        repeatScript: GeneratedScript;
        scriptMindMap?: ScriptMindMapData;
        mindMapValidation?: { warnings?: string[] };
      };

      if (scriptMindMap?.nodes?.length) {
        onScriptsGenerated?.(scriptMindMap);
        const warnCount = mindMapValidation?.warnings?.length ?? 0;
        toast({
          title: "Скрипт сохранён",
          description:
            warnCount > 0
              ? `Mind map (${scriptMindMap.nodes.length} узлов) сохранён в настройки чатбота. ${warnCount} предупреждений валидации.`
              : `Mind map (${scriptMindMap.nodes.length} узлов) автоматически сохранён как главный скрипт.`,
        });
      } else {
        const mindMapData = convertGeneratedScriptsToMindMap(primaryScript, repeatScript);
        onScriptsGenerated?.(mindMapData);
        toast({ title: "Скрипты готовы!", description: "ИИ сгенерировал скрипты — смотрите в майнд-мэпе ниже" });
      }
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      toast({
        title: "Не удалось сгенерировать скрипты",
        description: isAbort
          ? "Генерация заняла слишком много времени. Попробуйте ещё раз."
          : err instanceof Error ? err.message : "Попробуйте ещё раз.",
        variant: "destructive",
      });
    } finally {
      clearTimeout(timer);
      setGenerating(false);
    }
  };

  const readySources = sources.filter((s) => s.status === "ready");
  const pendingSources = sources.filter((s) => s.status === "pending");

  const showAddForms = sources.length === 0 || addSourceOpen;

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-[#0f172a]">База знаний</p>
        <p className="text-xs text-[#64748b] mt-0.5">
          Добавьте ссылки и файлы — ИИ обучится на них и сгенерирует скрипты в майнд-мэпе
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

      {/* Generate button */}
      <button
        onClick={() => void handleGenerate()}
        disabled={generating || readySources.length === 0}
        className={cn(
          "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all",
          readySources.length > 0
            ? "bg-[#1f75fe] text-white hover:bg-[#1a65e8]"
            : "bg-[#f1ede4] text-[#64748b] cursor-not-allowed",
        )}
      >
        {generating
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Генерация скриптов…</>
          : <><Sparkles className="h-4 w-4" /> Сгенерировать скрипты продаж</>
        }
      </button>

      {readySources.length === 0 && sources.length > 0 && pendingSources.length > 0 && (
        <p className="text-xs text-center text-[#64748b]">
          Дождитесь обработки источников, затем нажмите «Сгенерировать»
        </p>
      )}
      {sources.length === 0 && (
        <p className="text-xs text-center text-[#64748b]">
          Добавьте хотя бы один источник, чтобы ИИ мог создать скрипты
        </p>
      )}
    </div>
  );
}

// ── Combined knowledge + script modal ─────────────────────────────────────────
interface KnowledgeAndScriptModalProps {
  open: boolean;
  onClose: () => void;
  initialMindMapData?: ScriptMindMapData | null;
  onSaveMindMap: (data: ScriptMindMapData) => void;
  mindMapSaveStatus?: "idle" | "saving" | "saved";
}

export function KnowledgeAndScriptModal({
  open,
  onClose,
  initialMindMapData,
  onSaveMindMap,
  mindMapSaveStatus,
}: KnowledgeAndScriptModalProps) {
  const [mapExpanded, setMapExpanded] = useState(false);
  const [liveMindMapData, setLiveMindMapData] = useState<ScriptMindMapData | null | undefined>(initialMindMapData);

  // Sync if parent data changes (e.g. on first load)
  useEffect(() => {
    setLiveMindMapData(initialMindMapData);
  }, [initialMindMapData]);

  const handleScriptsGenerated = useCallback((data: ScriptMindMapData) => {
    setLiveMindMapData(data);
    onSaveMindMap(data);
  }, [onSaveMindMap]);

  const handleSaveMindMap = useCallback((data: ScriptMindMapData) => {
    setLiveMindMapData(data);
    onSaveMindMap(data);
  }, [onSaveMindMap]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f1f5f9] font-manrope">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 px-5 py-4 bg-white border-b border-[#e8e3d9] shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#60a5fa] text-white shadow-sm shrink-0">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-[#0f172a]">База знаний и скрипт</p>
          <p className="text-xs text-[#64748b] leading-tight mt-0.5">Обучение чат-бота и визуальный сценарий разговора</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-[#f1f5f9] transition-colors shrink-0"
        >
          <X className="h-5 w-5 text-[#64748b]" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Knowledge base */}
        <div className="px-4 py-5">
          <KnowledgeTab
            onScriptsGenerated={handleScriptsGenerated}
            hasExistingMindMap={(liveMindMapData?.nodes?.length ?? 0) > 0}
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--ds-border)] mx-4" />

        {/* Mind map inline section */}
        <div className="px-4 py-4 pb-8 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f75fe] to-[#60a5fa] text-white shadow-sm shrink-0">
                <GitBranch className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0f172a]">Скрипт диалога</p>
                <p className="text-xs text-[#64748b] mt-0.5 truncate">
                  {liveMindMapData?.nodes?.length
                    ? "Цветные карточки по этапам · нажмите узел для редактирования"
                    : "Сгенерируйте скрипты выше — они появятся здесь"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMapExpanded(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b] hover:text-[#0f172a] px-3 py-2 rounded-xl border border-[#e8e3d9] bg-white hover:bg-[#f8fafc] shadow-sm transition-colors shrink-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              На весь экран
            </button>
          </div>
          <div
            className="rounded-2xl border border-[#e2e8f0] overflow-hidden bg-[#f8fafc] relative shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
            style={{ height: 520 }}
          >
            <ScriptMindMap
              key={`${open}-${liveMindMapData?.nodes?.length ?? 0}`}
              initialData={liveMindMapData}
              onSave={handleSaveMindMap}
              saveStatus={mindMapSaveStatus}
              mode="inline"
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay for mind map */}
      <ScriptMindMapModal
        open={mapExpanded}
        onClose={() => setMapExpanded(false)}
        initialData={liveMindMapData}
        onSave={handleSaveMindMap}
        saveStatus={mindMapSaveStatus}
      />
    </div>
  );
}
