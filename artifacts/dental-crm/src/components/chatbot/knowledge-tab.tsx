import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe, FileText, Trash2, Loader2, Plus, Sparkles, CheckCircle2,
  AlertCircle, Clock, RefreshCw, X, Upload, Pencil, Save,
  BookOpen, GitBranch, Maximize2,
} from "lucide-react";
import { ScriptMindMap, ScriptMindMapModal, type ScriptMindMapData } from "./script-mindmap";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

interface KnowledgeScript {
  primaryScript?: GeneratedScript;
  repeatScript?: GeneratedScript;
  generatedAt?: string;
}

// ── Node edit dialog ──────────────────────────────────────────────────────────
interface EditingNode {
  node: ScriptNode;
  scriptKey: "primaryScript" | "repeatScript";
}

function NodeEditDialog({
  editing,
  onClose,
  onSave,
  saving,
}: {
  editing: EditingNode | null;
  onClose: () => void;
  onSave: (scriptKey: "primaryScript" | "repeatScript", nodeId: string, label: string, detail: string) => Promise<void>;
  saving: boolean;
}) {
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (editing) {
      setLabel(editing.node.label);
      setDetail(editing.node.detail ?? "");
    }
  }, [editing]);

  if (!editing) return null;

  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Pencil className="h-3.5 w-3.5 text-primary" />
            Редактировать узел
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Название этапа</label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Название этапа скрипта"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Описание / инструкция</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              rows={5}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Что нужно сказать или сделать на этом этапе…"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => void onSave(editing.scriptKey, editing.node.id, label.trim(), detail.trim())}
            disabled={saving || !label.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Сохранить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Mind Map node component ───────────────────────────────────────────────────
function countNodes(node: ScriptNode): number {
  return 1 + (node.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

function MindNode({
  node, depth = 0, indexOffset = 0, scriptKey, onSelect,
}: {
  node: ScriptNode;
  depth?: number;
  indexOffset?: number;
  scriptKey: "primaryScript" | "repeatScript";
  onSelect: (node: ScriptNode, scriptKey: "primaryScript" | "repeatScript") => void;
}) {
  const [visible, setVisible] = useState(false);
  const delay = indexOffset * 80;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const colors = [
    "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15",
    "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100",
    "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
    "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
    "bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100",
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
        <button
          onClick={() => onSelect(node, scriptKey)}
          className={cn(
            "group relative rounded-xl border px-3 py-2 min-w-[110px] max-w-[160px] shrink-0 shadow-sm text-left cursor-pointer transition-all",
            colorClass,
          )}
          title="Нажмите для просмотра и редактирования"
        >
          <p className="text-xs font-semibold leading-snug">{node.label}</p>
          {node.detail && (
            <p className="text-[10px] opacity-70 mt-0.5 leading-snug line-clamp-2">{node.detail}</p>
          )}
          <Pencil className="absolute top-1.5 right-1.5 h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
        </button>
      </div>

      {/* Children */}
      {childNodes.length > 0 && (
        <div className="flex items-start">
          <div className="flex flex-col items-center justify-center self-stretch">
            <div className="w-4 h-px bg-border/60 mt-[18px]" />
          </div>
          <div className="flex flex-col gap-2">
            {childNodes.map(({ child, offset }) => (
              <div key={child.id} className="flex items-center gap-0">
                <div className="flex items-center">
                  <div className="w-3 h-px bg-border/60" />
                </div>
                <MindNode node={child} depth={depth + 1} indexOffset={offset} scriptKey={scriptKey} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MindMap({
  script, color, scriptKey, onSelect,
}: {
  script: GeneratedScript;
  color: string;
  scriptKey: "primaryScript" | "repeatScript";
  onSelect: (node: ScriptNode, scriptKey: "primaryScript" | "repeatScript") => void;
}) {
  let offset = 0;
  const nodeGroups = script.nodes.map((node) => {
    const o = offset;
    offset += countNodes(node);
    return { node, offset: o };
  });

  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-bold", color)}>{script.title}</h3>
      <p className="text-[10px] text-muted-foreground">Нажмите на любой блок, чтобы посмотреть или изменить</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col gap-3 min-w-max px-1 py-2">
          {nodeGroups.map(({ node, offset: o }) => (
            <MindNode key={node.id} node={node} depth={0} indexOffset={o} scriptKey={scriptKey} onSelect={onSelect} />
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
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null);
  const [savingNode, setSavingNode] = useState(false);
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
      const { primaryScript, repeatScript } = json.data as { primaryScript: GeneratedScript; repeatScript: GeneratedScript };
      setScript({ primaryScript, repeatScript, generatedAt: new Date().toISOString() });
      toast({ title: "Скрипты готовы!", description: "ИИ сгенерировал скрипты на основе ваших материалов" });
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

  // Deep-update a node by id in a script tree
  const updateNodeInTree = (nodes: ScriptNode[], id: string, label: string, detail: string): ScriptNode[] =>
    nodes.map((n) =>
      n.id === id
        ? { ...n, label, detail }
        : { ...n, children: updateNodeInTree(n.children ?? [], id, label, detail) },
    );

  const handleSaveNode = async (
    scriptKey: "primaryScript" | "repeatScript",
    nodeId: string,
    label: string,
    detail: string,
  ) => {
    if (!script) return;
    setSavingNode(true);
    try {
      const current = script[scriptKey];
      if (!current) return;
      const updated: GeneratedScript = {
        ...current,
        nodes: updateNodeInTree(current.nodes, nodeId, label, detail),
      };
      const newScript = { ...script, [scriptKey]: updated };
      await apiFetch("/api/knowledge/scripts", {
        method: "PATCH",
        body: JSON.stringify({ [scriptKey]: updated }),
      });
      setScript(newScript);
      setEditingNode(null);
      toast({ title: "Сохранено", description: "Изменения в скрипте сохранены" });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить изменения", variant: "destructive" });
    } finally {
      setSavingNode(false);
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
                <div className="shrink-0 flex items-center gap-1.5">
                  {source.status === "pending" && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                  {source.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {source.status === "error" && (
                    <div className="flex items-center gap-1.5 max-w-[140px]">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="text-[10px] text-destructive leading-tight line-clamp-2">
                        {friendlyError(source.errorMessage)}
                      </span>
                    </div>
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
              <MindMap
                script={script.primaryScript}
                color="text-primary"
                scriptKey="primaryScript"
                onSelect={(node, key) => setEditingNode({ node, scriptKey: key })}
              />
            </div>
          )}

          {script.repeatScript && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 overflow-hidden">
              <MindMap
                script={script.repeatScript}
                color="text-violet-700"
                scriptKey="repeatScript"
                onSelect={(node, key) => setEditingNode({ node, scriptKey: key })}
              />
            </div>
          )}
        </div>
      )}

      <NodeEditDialog
        editing={editingNode}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveNode}
        saving={savingNode}
      />
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
          <KnowledgeTab />
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
                <p className="text-xs text-gray-400 mt-0.5">Визуальный редактор сценария разговора</p>
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
            style={{ height: 280 }}
          >
            <ScriptMindMap
              key={open ? "combined-open" : "combined-closed"}
              initialData={initialMindMapData}
              onSave={onSaveMindMap}
              saveStatus={mindMapSaveStatus}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay for mind map */}
      <ScriptMindMapModal
        open={mapExpanded}
        onClose={() => setMapExpanded(false)}
        initialData={initialMindMapData}
        onSave={onSaveMindMap}
        saveStatus={mindMapSaveStatus}
      />
    </div>
  );
}
