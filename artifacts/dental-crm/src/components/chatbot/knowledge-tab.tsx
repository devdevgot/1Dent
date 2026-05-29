import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, FileText, Trash2, Loader2, Plus, Sparkles, CheckCircle2,
  AlertCircle, Clock, X, Upload,
  BookOpen, GitBranch, Maximize2,
} from "lucide-react";
import { ScriptMindMap, ScriptMindMapModal, type ScriptMindMapData } from "./script-mindmap";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? res.statusText);
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
    nodes.push({ id, label: node.label, content: node.detail ?? "" });
    edges.push({ id: `e_${parentId}_${id}`, source: parentId, target: id });
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
}: {
  onScriptsGenerated?: (data: ScriptMindMapData) => void;
}) {
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileModalOpen, setFileModalOpen] = useState(false);
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

  const handleDeleteSource = async (id: string) => {
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" });
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 95000);
    try {
      const token = getToken();
      const res = await fetch("/api/knowledge/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message;
        throw new Error(msg ?? "Ошибка сервера");
      }
      const json = await res.json();
      const { primaryScript, repeatScript } = json.data as {
        primaryScript: GeneratedScript;
        repeatScript: GeneratedScript;
      };
      const mindMapData = convertGeneratedScriptsToMindMap(primaryScript, repeatScript);
      onScriptsGenerated?.(mindMapData);
      toast({ title: "Скрипты готовы!", description: "ИИ сгенерировал скрипты — смотрите в майнд-мэпе ниже" });
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

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-foreground">База знаний</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Добавьте ссылки и файлы — ИИ обучится на них и сгенерирует скрипты в майнд-мэпе
        </p>
      </div>

      {/* URL input */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">Добавить ссылку</p>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddUrl(); }}
            className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={() => void handleAddUrl()}
            disabled={addingUrl || !urlInput.trim()}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity shrink-0"
          >
            {addingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Добавить
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Сайт клиники, Instagram, 2GIS, отзывы — любая публичная страница
        </p>
      </div>

      {/* File upload — compact button */}
      <button
        onClick={() => setFileModalOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border/60 bg-card hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Upload className="h-3.5 w-3.5 shrink-0" />
        Загрузить файл
      </button>

      {/* File upload modal */}
      {fileModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !uploadingFile && setFileModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Загрузить файл</p>
                <p className="text-xs text-muted-foreground mt-0.5">Прайс-лист, презентация, скрипт — до 10 МБ</p>
              </div>
              <button
                onClick={() => setFileModalOpen(false)}
                disabled={uploadingFile}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="w-full flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm text-muted-foreground disabled:opacity-50"
            >
              {uploadingFile ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Загрузка…</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground/60" />
                  <span className="text-xs font-medium">Нажмите, чтобы выбрать файл</span>
                  <span className="text-[11px] text-muted-foreground/70">PDF, DOCX, TXT, MD</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  void handleFileUpload(f).then(() => setFileModalOpen(false));
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Sources list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      ) : sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {sources.length} источник{sources.length === 1 ? "" : sources.length < 5 ? "а" : "ов"}
            {pendingSources.length > 0 && (
              <span className="ml-2 text-amber-600 animate-pulse">· {pendingSources.length} обрабатывается…</span>
            )}
          </p>
          <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card overflow-hidden">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="shrink-0">
                  {source.type === "url"
                    ? <Globe className="h-3.5 w-3.5 text-blue-500" />
                    : <FileText className="h-3.5 w-3.5 text-violet-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{source.name}</p>
                  {source.url && (
                    <p className="text-[10px] text-muted-foreground truncate">{source.url}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {source.status === "pending" && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                  {source.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {source.status === "error" && (
                    <div className="flex items-center gap-1.5 max-w-[140px]">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <span className="text-[10px] text-red-500 truncate" title={friendlyError(source.errorMessage)}>
                        {friendlyError(source.errorMessage)}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => void handleDeleteSource(source.id)}
                    className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={() => void handleGenerate()}
        disabled={generating || readySources.length === 0}
        className={cn(
          "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all",
          readySources.length > 0
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        {generating
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Генерация скриптов…</>
          : <><Sparkles className="h-4 w-4" /> Сгенерировать скрипты продаж</>
        }
      </button>

      {readySources.length === 0 && sources.length > 0 && pendingSources.length > 0 && (
        <p className="text-xs text-center text-muted-foreground">
          Дождитесь обработки источников, затем нажмите «Сгенерировать»
        </p>
      )}
      {sources.length === 0 && (
        <p className="text-xs text-center text-muted-foreground">
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">База знаний и скрипт</p>
          <p className="text-xs text-gray-400 leading-tight">Обучение чат-бота и сценарий разговора</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Knowledge base */}
        <div className="px-4 py-5">
          <KnowledgeTab onScriptsGenerated={handleScriptsGenerated} />
        </div>

        {/* Divider */}
        <div className="h-px bg-border/50 mx-4" />

        {/* Mind map inline section */}
        <div className="px-4 py-4 pb-8 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Скрипт диалога</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {liveMindMapData?.nodes?.length
                    ? "Нажмите на узел для редактирования"
                    : "Сгенерируйте скрипты выше — они появятся здесь"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMapExpanded(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-border/50 hover:bg-gray-100 transition-colors shrink-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              На весь экран
            </button>
          </div>
          <div
            className="rounded-xl border border-border/50 overflow-hidden bg-white"
            style={{ height: 320 }}
          >
            <ScriptMindMap
              key={`${open}-${liveMindMapData?.nodes?.length ?? 0}`}
              initialData={liveMindMapData}
              onSave={handleSaveMindMap}
              saveStatus={mindMapSaveStatus}
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
