import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, FileText, Trash2, Loader2, Plus, Sparkles, CheckCircle2,
  AlertCircle, Clock, RefreshCw, X, Upload, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Auth helper ───────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("authToken") ?? localStorage.getItem("token") ?? "";
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

interface KnowledgeScript {
  primaryScript?: GeneratedScript;
  repeatScript?: GeneratedScript;
  generatedAt?: string;
}

// ── Mind Map node component ───────────────────────────────────────────────────
let globalNodeIndex = 0;

function MindNode({ node, depth = 0, indexOffset = 0 }: { node: ScriptNode; depth?: number; indexOffset?: number }) {
  const [visible, setVisible] = useState(false);
  const delay = indexOffset * 80;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const colors = [
    "bg-primary/10 border-primary/30 text-primary",
    "bg-violet-50 border-violet-200 text-violet-700",
    "bg-emerald-50 border-emerald-200 text-emerald-700",
    "bg-amber-50 border-amber-200 text-amber-700",
    "bg-sky-50 border-sky-200 text-sky-700",
  ];
  const colorClass = colors[depth % colors.length] ?? colors[0]!;

  let childOffset = indexOffset + 1;
  const childNodes = (node.children ?? []).map((child) => {
    const offset = childOffset;
    const childCount = countNodes(child);
    childOffset += childCount;
    return { child, offset };
  });

  return (
    <div className="flex items-start gap-0">
      {/* Node box */}
      <div
        className={cn(
          "transition-all duration-500",
          visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4",
        )}
        style={{ transitionDelay: `${delay}ms` }}
      >
        <div className={cn(
          "rounded-xl border px-3 py-2 min-w-[110px] max-w-[160px] shrink-0 shadow-sm",
          colorClass,
        )}>
          <p className="text-xs font-semibold leading-snug">{node.label}</p>
          {node.detail && (
            <p className="text-[10px] opacity-70 mt-0.5 leading-snug line-clamp-2">{node.detail}</p>
          )}
        </div>
      </div>

      {/* Children */}
      {childNodes.length > 0 && (
        <div className="flex items-start">
          {/* Connector */}
          <div className="flex flex-col items-center justify-center self-stretch">
            <div className="w-4 h-px bg-border/60 mt-[18px]" />
          </div>
          {/* Children column */}
          <div className="flex flex-col gap-2">
            {childNodes.map(({ child, offset }) => (
              <div key={child.id} className="flex items-center gap-0">
                <div className="flex items-center">
                  <div className="w-3 h-px bg-border/60" />
                </div>
                <MindNode node={child} depth={depth + 1} indexOffset={offset} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function countNodes(node: ScriptNode): number {
  return 1 + (node.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

function MindMap({ script, color }: { script: GeneratedScript; color: string }) {
  let offset = 0;
  const nodeGroups = script.nodes.map((node) => {
    const o = offset;
    offset += countNodes(node);
    return { node, offset: o };
  });

  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-bold", color)}>{script.title}</h3>
      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col gap-3 min-w-max px-1 py-2">
          {nodeGroups.map(({ node, offset: o }) => (
            <MindNode key={node.id} node={node} depth={0} indexOffset={o} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main KnowledgeTab component ───────────────────────────────────────────────
export function KnowledgeTab() {
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [script, setScript] = useState<KnowledgeScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/knowledge");
      setSources((res.data.sources as KnowledgeSource[]) ?? []);
      setScript(res.data.script as KnowledgeScript | null);
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

  // Show script animation when script changes
  useEffect(() => {
    if (script) {
      globalNodeIndex = 0;
      setShowScript(false);
      setTimeout(() => setShowScript(true), 100);
    }
  }, [script]);

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
      // 1. Get presigned upload URL
      const urlRes = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = urlRes as { uploadURL: string; objectPath: string };

      // 2. Upload directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      // 3. Register with knowledge API
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
    try {
      const res = await apiFetch("/api/knowledge/generate", { method: "POST" });
      const { primaryScript, repeatScript } = res.data as { primaryScript: GeneratedScript; repeatScript: GeneratedScript };
      setScript({ primaryScript, repeatScript, generatedAt: new Date().toISOString() });
      toast({ title: "Скрипты готовы!", description: "ИИ сгенерировал скрипты на основе ваших материалов" });
    } catch (err) {
      toast({ title: "Ошибка генерации", description: String(err), variant: "destructive" });
    } finally {
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
          Добавьте ссылки и файлы — ИИ обучится на них и сгенерирует скрипты продаж
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

      {/* File upload */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">Загрузить файл</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="w-full flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm text-muted-foreground disabled:opacity-50"
        >
          {uploadingFile
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</>
            : <><Upload className="h-4 w-4" /> PDF, DOCX или TXT</>
          }
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileUpload(f);
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Прайс-лист, презентация, скрипт вашей клиники — до 10 МБ
        </p>
      </div>

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
                <div className="shrink-0">
                  {source.status === "pending" && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                  {source.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {source.status === "error" && (
                    <span title={source.errorMessage ?? "Ошибка"}>
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    </span>
                  )}
                </div>
                <button
                  onClick={() => void handleDeleteSource(source.id)}
                  className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
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

      {/* Mind map display */}
      {showScript && script && (
        <div className="space-y-6 mt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Скрипты продаж</p>
              {script.generatedAt && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Обновлено {new Date(script.generatedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <button
              onClick={() => void handleGenerate()}
              disabled={generating || readySources.length === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Пересоздать
            </button>
          </div>

          {script.primaryScript && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 overflow-hidden">
              <MindMap script={script.primaryScript} color="text-primary" />
            </div>
          )}

          {script.repeatScript && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 overflow-hidden">
              <MindMap script={script.repeatScript} color="text-violet-700" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
export function KnowledgeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            База знаний
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Добавьте ссылки или файлы — ИИ изучит их и сгенерирует скрипты продаж
          </p>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <KnowledgeTab />
        </div>
      </DialogContent>
    </Dialog>
  );
}
