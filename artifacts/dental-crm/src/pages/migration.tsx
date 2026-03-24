import { useState, useCallback, useEffect } from "react";
import {
  FileSpreadsheet,
  Upload,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Loader2,
  Trello,
  Link,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import {
  usePreviewExcelImport,
  useConfirmExcelImport,
  useConnectTrello,
  useStartTrelloImport,
  useListMigrationJobs,
  getMigrationJobStatus,
} from "@workspace/api-client-react";
import type { MigrationJob } from "@workspace/api-client-react";

type Tab = "excel" | "trello";
type ColumnKey = "name" | "phone" | "age" | "notes" | "status";
const COLUMN_KEYS: ColumnKey[] = ["name", "phone", "age", "notes", "status"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:    { cls: "bg-amber-50 text-amber-700 border border-amber-200",       label: "Ожидание" },
    processing: { cls: "bg-blue-50 text-blue-700 border border-blue-200",         label: "Обработка" },
    done:       { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", label: "Завершено" },
    failed:     { cls: "bg-red-50 text-red-700 border border-red-200",            label: "Ошибка" },
  };
  const s = map[status] ?? { cls: "bg-gray-50 text-gray-600 border border-gray-200", label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: "linear-gradient(to right, #6366f1, #8b5cf6)" }}
      />
    </div>
  );
}

function JobCard({ job: initialJob }: { job: MigrationJob }) {
  const [job, setJob] = useState<MigrationJob>(initialJob);
  const isActive = job.status === "pending" || job.status === "processing";

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(async () => {
      try {
        const res = await getMigrationJobStatus(job.id);
        setJob(res.data.job);
        if (res.data.job.status === "done" || res.data.job.status === "failed") {
          clearInterval(timer);
        }
      } catch {
        // silent - keep polling
      }
    }, 2500);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, isActive]);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  const pct =
    (job.totalRows ?? 0) > 0
      ? Math.min(100, Math.round(((job.processedRows ?? 0) / (job.totalRows ?? 1)) * 100))
      : job.status === "done" ? 100 : 0;

  const report = job.report as Record<string, unknown> | null;
  const errors = Array.isArray(report?.["errors"]) ? (report!["errors"] as string[]) : [];

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {job.type === "excel-import" ? (
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          ) : (
            <Trello className="w-4 h-4 text-blue-500" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {job.type === "excel-import" ? "Excel" : "Trello"}
          </span>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {(job.totalRows ?? 0) > 0 && (
        <div className="mb-2">
          <ProgressBar value={job.processedRows ?? 0} max={job.totalRows ?? 1} />
          <p className="text-xs text-gray-400 mt-1">
            {job.processedRows ?? 0} / {job.totalRows ?? 0} строк ({pct}%)
          </p>
        </div>
      )}

      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          {job.successCount} успешно
        </span>
        {(job.duplicateCount ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-amber-500" />
            {job.duplicateCount} дублей
          </span>
        )}
        {(job.errorCount ?? 0) > 0 && (
          <span className="flex items-center gap-1">
            <XCircle className="w-3 h-3 text-red-500" />
            {job.errorCount} ошибок
          </span>
        )}
      </div>

      {errors.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-red-600 cursor-pointer">Показать ошибки</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-gray-500 max-h-32 overflow-y-auto">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i} className="truncate">{e}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-400 mt-2">
        <Clock className="inline w-3 h-3 mr-1" />
        {new Date(job.createdAt).toLocaleString("ru")}
      </p>
    </div>
  );
}

function ExcelTab() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);

  const previewMutation = usePreviewExcelImport();
  const confirmMutation = useConfirmExcelImport();

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setPreview(null);
    setParsingLoading(true);
    try {
      const base64 = await fileToBase64(f);
      const res = await previewMutation.mutateAsync({ data: { fileBase64: base64 } });
      const d = res.data;
      setPreview({
        headers: d.headers,
        rows: d.rows as Record<string, string>[],
        suggestedMapping: d.suggestedMapping as Record<string, string>,
        totalRows: d.totalRows,
      });
      setMapping(d.suggestedMapping as Record<string, string>);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка при разборе файла");
    } finally {
      setParsingLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile],
  );

  const handleImport = async () => {
    if (!preview || !file) return;
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await confirmMutation.mutateAsync({
        data: {
          fileBase64: base64,
          mapping: mapping as { name?: string; phone?: string; age?: string; notes?: string; status?: string },
        },
      });
      setJobId(res.data.job.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка при импорте");
    }
  };

  const labelOf: Record<ColumnKey, string> = {
    name: "Имя пациента",
    phone: "Телефон",
    age: "Возраст",
    notes: "Заметки",
    status: "Статус",
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : file
            ? "border-emerald-300 bg-emerald-50"
            : "border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />
        {parsingLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-sm text-gray-500">Парсинг файла…</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-2">
            <Check className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700">{file.name}</p>
            <p className="text-xs text-gray-400">Нажмите, чтобы выбрать другой файл</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">Перетащите Excel/CSV файл</p>
            <p className="text-xs text-gray-400">или нажмите, чтобы выбрать (max 5 000 строк)</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {preview && (
        <>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <ChevronDown className="w-4 h-4 text-indigo-500" />
              Сопоставление колонок
              <span className="ml-auto text-xs font-normal text-gray-400">
                {preview.totalRows} строк всего
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COLUMN_KEYS.map((key) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{labelOf[key]}</label>
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                  >
                    <option value="">— не указано —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Предпросмотр (первые 20 строк)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {preview.headers.map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-4 py-2 text-gray-600 whitespace-nowrap max-w-[160px] truncate">
                          {row[h] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {jobId ? (
            <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              Импорт запущен! Следите за прогрессом ниже.
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={confirmMutation.isPending || parsingLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {confirmMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Запуск импорта…</>
              ) : (
                <><ArrowRight className="w-4 h-4" /> Импортировать {preview.totalRows} пациентов</>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TrelloTab() {
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectMutation = useConnectTrello();
  const importMutation = useStartTrelloImport();

  const handleConnect = async () => {
    setError(null);
    try {
      const res = await connectMutation.mutateAsync({ data: { apiKey, token } });
      setBoards(res.data.boards);
      if (res.data.boards.length > 0) {
        setSelectedBoard(res.data.boards[0]!.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка подключения к Trello");
    }
  };

  const handleImport = async () => {
    if (!selectedBoard) return;
    setError(null);
    try {
      const res = await importMutation.mutateAsync({ data: { apiKey, token, boardId: selectedBoard } });
      setJobId(res.data.job.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка при запуске импорта");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">Как получить Trello API Key и Token?</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-600 text-xs">
          <li>Перейдите на <a href="https://trello.com/app-key" target="_blank" rel="noreferrer" className="underline">trello.com/app-key</a></li>
          <li>Скопируйте <strong>API Key</strong></li>
          <li>Нажмите «Token» → разрешите доступ → скопируйте токен</li>
        </ol>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Link className="w-4 h-4 text-blue-500" />
          Подключение к Trello
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Вставьте API Key"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Вставьте Token"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={!apiKey || !token || connectMutation.isPending}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {connectMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Подключение…</>
          ) : (
            <><Trello className="w-4 h-4" /> Подключить</>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {boards.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Выберите доску Trello</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBoard(b.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedBoard === b.id
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-200 hover:bg-blue-50/40"
                }`}
              >
                <Trello className={`w-4 h-4 ${selectedBoard === b.id ? "text-blue-500" : "text-gray-400"}`} />
                <span className="truncate">{b.name}</span>
                {selectedBoard === b.id && <Check className="w-4 h-4 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>

          {jobId ? (
            <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              Импорт запущен! Следите за прогрессом ниже.
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={!selectedBoard || importMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {importMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Запуск импорта…</>
              ) : (
                <><ArrowRight className="w-4 h-4" /> Импортировать карточки с доски</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function JobHistory() {
  const { data, refetch, isLoading } = useListMigrationJobs();
  const jobs = data?.data.jobs ?? [];

  useEffect(() => {
    const timer = setInterval(() => refetch(), 5000);
    return () => clearInterval(timer);
  }, [refetch]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">История импортов</h2>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Обновить
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          Нет истории импортов
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MigrationPage() {
  const [tab, setTab] = useState<Tab>("excel");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "excel",
      label: "Excel / CSV",
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      key: "trello",
      label: "Trello",
      icon: <Trello className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Миграция данных</h1>
          <p className="text-sm text-gray-500 mt-1">
            Импортируйте пациентов из Excel/CSV файла или с доски Trello
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100">
            <nav className="flex">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                    tab === t.key
                      ? "border-indigo-500 text-indigo-600 bg-indigo-50/30"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {tab === "excel" && <ExcelTab />}
            {tab === "trello" && <TrelloTab />}
          </div>
        </div>

        <JobHistory />
      </div>
    </div>
  );
}
