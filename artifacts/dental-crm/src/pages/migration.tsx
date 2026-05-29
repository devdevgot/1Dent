import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  FileSpreadsheet,
  ChevronLeft,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Sparkles,
  FileText,
  FileCog,
  Upload,
  RotateCcw,
  Download,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  useListMigrationJobs,
  getMigrationJobStatus,
  useAnalyzeFileWithAi,
  useConfirmAiImport,
} from "@workspace/api-client-react";
import type { MigrationJob, AiDetectedCategory } from "@workspace/api-client-react";

const AI_FIELD_LABELS: Record<string, string> = {
  "": "— не указано —",
  name: "Имя пациента",
  phone: "Телефон",
  iin: "ИИН",
  dateOfBirth: "Дата рождения",
  gender: "Пол",
  source: "Источник",
  status: "Статус пациента",
  doctorName: "Имя врача",
  notes: "Заметки",
  procedureName: "Название процедуры",
  procedurePrice: "Стоимость процедуры",
  procedureStatus: "Статус процедуры",
  scheduledAt: "Дата приёма",
  paymentMethod: "Способ оплаты",
  procedureNotes: "Заметки к процедуре",
  templateName: "Шаблон услуги",
  templatePrice: "Цена шаблона",
  templateCategory: "Категория шаблона",
};

const AI_FIELD_OPTIONS = Object.keys(AI_FIELD_LABELS);

const CATEGORY_LABELS: Record<AiDetectedCategory, string> = {
  patients: "Пациенты",
  procedures: "Процедуры",
  templates: "Шаблоны услуг",
};

const CATEGORY_COLORS: Record<AiDetectedCategory, string> = {
  patients: "bg-blue-50 text-blue-700 border-blue-200",
  procedures: "bg-emerald-50 text-emerald-700 border-emerald-200",
  templates: "bg-amber-50 text-amber-700 border-amber-200",
};

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

function fileTypeFromFile(file: File): "xlsx" | "csv" | "pdf" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".pdf")) return "pdf";
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    pending:    { cls: "bg-amber-50 text-amber-700",   dot: "bg-amber-400",   label: "Ожидание"  },
    processing: { cls: "bg-blue-50 text-blue-700",     dot: "bg-blue-400",    label: "Обработка" },
    done:       { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400", label: "Завершено" },
    failed:     { cls: "bg-red-50 text-red-700",       dot: "bg-red-400",     label: "Ошибка"    },
  };
  const s = map[status] ?? { cls: "bg-gray-50 text-gray-600", dot: "bg-gray-400", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "processing" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-1.5 rounded-full bg-primary transition-all duration-700"
        style={{ width: `${pct}%` }}
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
        if (res.data.job.status === "done" || res.data.job.status === "failed") clearInterval(timer);
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, isActive]);

  useEffect(() => { setJob(initialJob); }, [initialJob]);

  const pct =
    (job.totalRows ?? 0) > 0
      ? Math.min(100, Math.round(((job.processedRows ?? 0) / (job.totalRows ?? 1)) * 100))
      : job.status === "done" ? 100 : 0;

  type ReportError = { row: number; message: string };
  const report = job.report as Record<string, unknown> | null;
  const errors: ReportError[] = Array.isArray(report?.["errors"]) ? (report!["errors"] as ReportError[]) : [];
  const summary = report?.["summary"] as { patients?: number; procedures?: number; templates?: number } | undefined;

  return (
    <div className={`relative bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${
      job.status === "done" ? "border-emerald-100" :
      job.status === "failed" ? "border-red-100" :
      job.status === "processing" ? "border-primary/20" :
      "border-gray-100"
    }`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        job.status === "done" ? "bg-emerald-400" :
        job.status === "failed" ? "bg-red-400" :
        job.status === "processing" ? "bg-primary" :
        "bg-amber-400"
      }`} />
      <div className="pl-4 pr-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">ИИ-импорт</p>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(job.createdAt).toLocaleString("ru")}
              </p>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {(job.totalRows ?? 0) > 0 && (
          <div className="mb-3">
            <ProgressBar value={job.processedRows ?? 0} max={job.totalRows ?? 1} />
            <p className="text-xs text-gray-400 mt-1">{job.processedRows ?? 0} / {job.totalRows ?? 0} строк · {pct}%</p>
          </div>
        )}

        <div className="flex gap-3 text-xs">
          {(job.successCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> {job.successCount} успешно
            </span>
          )}
          {(job.duplicateCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <Info className="w-3.5 h-3.5" /> {job.duplicateCount} дублей
            </span>
          )}
          {(job.errorCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="w-3.5 h-3.5" /> {job.errorCount} ошибок
            </span>
          )}
        </div>

        {summary && job.status === "done" && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {(summary.patients ?? 0) > 0 && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{summary.patients} пациентов</span>
            )}
            {(summary.procedures ?? 0) > 0 && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{summary.procedures} процедур</span>
            )}
            {(summary.templates ?? 0) > 0 && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{summary.templates} шаблонов</span>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-red-500 cursor-pointer hover:text-red-600">Показать ошибки ({errors.length})</summary>
            <ul className="mt-1.5 space-y-1 text-xs text-gray-500 max-h-28 overflow-y-auto">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-gray-300 shrink-0">#{e.row}</span>
                  <span className="truncate">{e.message}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function AiImportTab() {
  type Step = "upload" | "analyze" | "import";
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"xlsx" | "csv" | "pdf" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<{
    mapping: Record<string, string>;
    detectedCategories: AiDetectedCategory[];
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
    isPdf: boolean;
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);

  const analyzeMutation = useAnalyzeFileWithAi();
  const confirmMutation = useConfirmAiImport();

  const reset = () => { setStep("upload"); setAnalysis(null); setFile(null); setFileType(null); setJobId(null); setError(null); };

  const processFile = useCallback(async (f: File) => {
    const ft = fileTypeFromFile(f);
    if (!ft) { setError("Поддерживаются только форматы: .xlsx, .csv, .pdf"); return; }
    setFile(f); setFileType(ft); setError(null); setAnalysis(null); setJobId(null); setStep("analyze");
    try {
      const base64 = await fileToBase64(f);
      const res = await analyzeMutation.mutateAsync({ fileBase64: base64, fileType: ft });
      setAnalysis(res.data);
      setMapping(res.data.mapping);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка при анализе файла");
      setStep("upload");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleImport = async () => {
    if (!analysis || !file || !fileType) return;
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await confirmMutation.mutateAsync({
        fileBase64: base64, fileType, mapping,
        detectedCategories: analysis.detectedCategories,
        rows: analysis.isPdf ? analysis.previewRows : undefined,
      });
      setJobId(res.data.job.id);
      setStep("import");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка при запуске импорта");
    }
  };

  const FORMATS = [
    { icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, label: "Excel", ext: ".xlsx" },
    { icon: <FileCog className="w-4 h-4 text-blue-500" />,           label: "CSV",   ext: ".csv"  },
    { icon: <FileText className="w-4 h-4 text-rose-500" />,          label: "PDF",   ext: ".pdf"  },
  ];

  const STEPS: { key: Step; label: string }[] = [
    { key: "upload",  label: "Загрузка"  },
    { key: "analyze", label: "Анализ ИИ" },
    { key: "import",  label: "Импорт"    },
  ];
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6">

      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  done ? "bg-primary text-white" :
                  active ? "bg-primary/10 text-primary ring-2 ring-primary/30" :
                  "bg-gray-100 text-gray-400"
                }`}>
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? "text-primary" : done ? "text-primary/70" : "text-gray-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 transition-colors ${i < stepIdx ? "bg-primary/40" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer group ${
              dragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-gray-200 bg-gradient-to-br from-gray-50 to-blue-50/30 hover:border-primary/40 hover:from-blue-50/40 hover:to-blue-50"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
            />
            <div className="flex flex-col items-center gap-4 py-14 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:shadow-md transition-shadow">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Перетащите файл сюда</p>
                <p className="text-xs text-gray-400 mt-1">или нажмите, чтобы выбрать · до 5 000 строк</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {FORMATS.map((f) => (
                  <span key={f.ext} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded-full text-xs text-gray-600 font-medium shadow-sm">
                    {f.icon} {f.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step: Analyze — loading */}
      {step === "analyze" && analyzeMutation.isPending && (
        <div className="flex flex-col items-center gap-5 py-16">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-9 h-9 text-primary animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-800">ИИ анализирует файл…</p>
            <p className="text-sm text-gray-400 mt-1">Определяем структуру данных и сопоставляем колонки</p>
          </div>
          {file && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-full text-xs text-gray-600 shadow-sm">
              <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
              {file.name}
            </div>
          )}
        </div>
      )}

      {/* Step: Analyze — results */}
      {step === "analyze" && analysis && !analyzeMutation.isPending && (
        <div className="space-y-4">

          {/* File pill + detected categories */}
          <div className="flex items-center gap-3 flex-wrap">
            {file && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs text-primary font-medium">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {file.name}
                <span className="text-primary/50">·</span>
                {analysis.totalRows} строк
              </div>
            )}
            {analysis.detectedCategories.map((cat) => (
              <span key={cat} className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium ${CATEGORY_COLORS[cat]}`}>
                <Check className="w-3 h-3" />
                {CATEGORY_LABELS[cat]}
              </span>
            ))}
          </div>

          {/* PDF warning */}
          {analysis.isPdf && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-semibold">PDF: структура восстановлена ИИ</p>
                <p className="text-xs text-amber-700 mt-0.5">Проверьте сопоставление колонок перед импортом.</p>
              </div>
            </div>
          )}

          {/* Column mapping */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Сопоставление колонок</p>
            {analysis.headers.map((header) => (
              <div key={header} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
                <span className="flex-1 text-sm text-gray-700 font-medium truncate min-w-0" title={header}>{header}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <div className="relative flex-1 min-w-0">
                  <select
                    value={mapping[header] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm bg-white text-gray-700 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none appearance-none"
                  >
                    {AI_FIELD_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{AI_FIELD_LABELS[opt]}</option>
                    ))}
                  </select>
                </div>
                {mapping[header] ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Preview table */}
          {analysis.previewRows.length > 0 && (
            <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Предпросмотр</p>
                <p className="text-xs text-gray-400">первые {Math.min(analysis.previewRows.length, 10)} строк</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {analysis.headers.map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {analysis.previewRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                        {analysis.headers.map((h) => (
                          <td key={h} className="px-4 py-2.5 text-gray-600 whitespace-nowrap max-w-[160px] truncate">{row[h] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50 hover:text-gray-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Другой файл
            </button>
            <button
              onClick={handleImport}
              disabled={confirmMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-primary hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Запуск…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Импортировать {analysis.totalRows} строк</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step: Import done */}
      {step === "import" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-800">Импорт запущен!</p>
              <p className="text-sm text-gray-400 mt-1">Следите за прогрессом в истории ниже.</p>
            </div>
            {jobId && <p className="text-xs text-gray-300">ID: {jobId}</p>}
          </div>
          <button
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Импортировать ещё один файл
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

function ExportSection() {
  const [exporting, setExporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [done, setDone] = useState<"export" | "wipe" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const triggerDownload = async (): Promise<boolean> => {
    const res = await fetch("/api/migration/export", {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cd = res.headers.get("content-disposition") ?? "";
    const match = cd.match(/filename="?([^"]+)"?/);
    a.download = match?.[1] ?? `1dent_export_${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setDone(null);
    try {
      await triggerDownload();
      setDone("export");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  };

  const handleWipe = async () => {
    setWiping(true);
    setError(null);
    setDone(null);
    try {
      await triggerDownload();
      const res = await fetch("/api/migration/wipe", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setDone("wipe");
      setConfirmWipe(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка при удалении данных");
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">Экспорт данных</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Скачайте все данные клиники в XLSX — пациенты, карты зубов, планы лечения, процедуры и шаблоны услуг
        </p>
      </div>

      {done === "export" && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Файл скачан. Импортируйте его снова в любой момент.
        </div>
      )}
      {done === "wipe" && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Данные экспортированы и удалены. Вы можете восстановить их через импорт.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => void handleExport()}
          disabled={exporting || wiping}
          className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Экспортировать XLSX
        </button>
        <button
          onClick={() => { setConfirmWipe(true); setError(null); }}
          disabled={exporting || wiping}
          className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-sm font-medium text-red-600 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Экспорт и очистить все данные
        </button>
      </div>

      {/* Confirmation dialog */}
      {confirmWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !wiping && setConfirmWipe(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Удалить все данные клиники?</p>
                <p className="text-xs text-gray-400 mt-0.5">Это действие необратимо</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Сначала будет скачан XLSX-файл со всеми данными. Затем из системы удалятся все пациенты, карты зубов, планы лечения и процедуры.
              <br /><br />
              Для восстановления используйте этот файл через импорт.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmWipe(false)}
                disabled={wiping}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                onClick={() => void handleWipe()}
                disabled={wiping}
                className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {wiping ? <><Loader2 className="w-4 h-4 animate-spin" /> Удаление…</> : <>Скачать и удалить</>}
              </button>
            </div>
          </div>
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

  if (isLoading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">История импортов</h2>
          <p className="text-xs text-gray-400 mt-0.5">{jobs.length > 0 ? `${jobs.length} задач` : "Нет задач"}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Обновить
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-300">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-gray-200" />
          История импортов пуста
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
}

export default function MigrationPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setLocation("/menu")}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[17px] font-semibold text-gray-900">Миграция данных</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Excel, CSV или PDF — до 5 000 строк</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <AiImportTab />
        </div>

        <ExportSection />
        <JobHistory />
      </div>
    </div>
  );
}
