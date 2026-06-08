import { useState } from "react";
import {
  useListPatientContracts,
  useListContractTemplates,
  useSendContract,
  type PatientContract,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Send, CheckCircle2, Eye, ExternalLink,
  RefreshCw, FileSignature, Clock, ChevronDown, ChevronUp,
  Package, X, ClipboardList, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BundleCardProps {
  hasExtractionInPlan: boolean;
  bundleToken: string | null;
  bundleSent: boolean;
  bundlePreparing: boolean;
  bundleSending: boolean;
  bundleUrl: string | null;
  patientId: string;
  onPrepare: () => void;
  onSend: (token: string) => void;
  onOpenPreview: () => void;
}

interface ContractsTabProps {
  patientId: string;
  bundle?: BundleCardProps;
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Отправлен",
  viewed: "Просмотрен",
  signed: "Подписан",
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; dot: string }> = {
  sent: {
    color: "bg-sky-50 text-sky-700 border-sky-200",
    icon: <Send className="w-3 h-3" />,
    dot: "bg-sky-400",
  },
  viewed: {
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Eye className="w-3 h-3" />,
    dot: "bg-amber-400",
  },
  signed: {
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="w-3 h-3" />,
    dot: "bg-emerald-400",
  },
};

const STATUS_PRIORITY: Record<string, number> = { sent: 0, viewed: 1, signed: 2 };

function bundleAggregateStatus(contracts: PatientContract[]): string {
  if (contracts.every((c) => c.status === "signed")) return "signed";
  if (contracts.some((c) => c.status === "viewed" || c.status === "signed")) return "viewed";
  return "sent";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "short",
  });
}

interface BundleGroup {
  bundleToken: string;
  contracts: PatientContract[];
  createdAt: string | null;
  sentByName: string | null;
}

type HistoryItem =
  | { type: "bundle"; bundle: BundleGroup; sortKey: number }
  | { type: "single"; contract: PatientContract; sortKey: number };

function groupContracts(contracts: PatientContract[]): HistoryItem[] {
  const bundleMap = new Map<string, PatientContract[]>();
  const singles: PatientContract[] = [];

  for (const c of contracts) {
    if (c.bundleToken) {
      const arr = bundleMap.get(c.bundleToken) ?? [];
      arr.push(c);
      bundleMap.set(c.bundleToken, arr);
    } else {
      singles.push(c);
    }
  }

  const items: HistoryItem[] = [];

  for (const [bundleToken, members] of bundleMap.entries()) {
    const sorted = [...members].sort(
      (a, b) => STATUS_PRIORITY[a.status ?? "sent"] - STATUS_PRIORITY[b.status ?? "sent"],
    );
    const createdAt = sorted[0]?.createdAt ?? null;
    const sentByName = sorted[0]?.sentByName ?? null;
    items.push({
      type: "bundle",
      bundle: { bundleToken, contracts: sorted, createdAt, sentByName },
      sortKey: createdAt ? new Date(createdAt).getTime() : 0,
    });
  }

  for (const c of singles) {
    items.push({
      type: "single",
      contract: c,
      sortKey: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    });
  }

  return items.sort((a, b) => b.sortKey - a.sortKey);
}

function BundleModal({ bundle, onClose }: { bundle: BundleGroup; onClose: () => void }) {
  const aggStatus = bundleAggregateStatus(bundle.contracts);
  const aggCfg = STATUS_CONFIG[aggStatus] ?? STATUS_CONFIG.sent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-gray-900">Пакет договоров</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                  aggCfg.color,
                )}>
                  {aggCfg.icon}
                  {STATUS_LABELS[aggStatus]}
                </span>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatDateShort(bundle.createdAt)}
                </span>
                {bundle.sentByName && (
                  <span className="text-[10px] text-gray-400">· {bundle.sentByName}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contracts list */}
        <div className="px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {bundle.contracts.map((c) => {
            const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.sent;
            return (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-primary/70" />
                  </div>
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-50",
                    cfg.dot,
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 leading-snug line-clamp-1">
                    {c.templateName}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={cn(
                      "inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] font-semibold border",
                      cfg.color,
                    )}>
                      {cfg.icon}
                      {STATUS_LABELS[c.status]}
                    </span>
                    {c.status === "signed" && c.signedAt && (
                      <span className="text-[10px] text-emerald-600">
                        {formatDateShort(c.signedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <a
                  href={`/p/contract/${c.token}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-primary hover:bg-white transition-colors border border-transparent hover:border-gray-100"
                  title="Открыть договор"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>

        {/* Footer — open full bundle */}
        <div className="px-4 pb-4 pt-2">
          <a
            href={`/p/bundle/${bundle.bundleToken}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Открыть весь пакет
          </a>
        </div>
      </div>
    </div>
  );
}

export function ContractsTab({ patientId, bundle }: ContractsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openBundle, setOpenBundle] = useState<BundleGroup | null>(null);

  const { data: contractsData, isLoading: contractsLoading } = useListPatientContracts(patientId);
  const { data: templatesData, isLoading: templatesLoading } = useListContractTemplates();
  const sendMutation = useSendContract();

  const allContracts = contractsData?.data?.contracts ?? [];
  const contracts = allContracts.filter((c: PatientContract) => c.status !== "created");
  const templates = templatesData?.data?.templates ?? [];

  const historyItems = groupContracts(contracts);

  const handleSend = () => {
    if (!selectedTemplateId) return;
    sendMutation.mutate(
      { patientId, templateId: selectedTemplateId },
      {
        onSuccess: () => {
          toast({ title: "✓ Договор отправлен по WhatsApp" });
          setSelectedTemplateId("");
          void queryClient.invalidateQueries({ queryKey: ["patient-contracts", patientId] });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Ошибка при отправке";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-4 py-4 space-y-5">

          {/* ── Send contract card ── */}
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
            <div className="px-4 pt-4 pb-3 border-b border-gray-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileSignature className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-gray-900">Отправить договор</p>
                  <p className="text-[11px] text-gray-400">Выберите шаблон и отправьте через WhatsApp</p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3 space-y-3">
              {templatesLoading ? (
                <div className="flex items-center gap-2 py-3 text-[12px] text-gray-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Загрузка шаблонов…
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <FileText className="w-8 h-8 text-gray-200" />
                  <p className="text-[12px] text-gray-500">
                    Нет шаблонов.{" "}
                    <span className="font-medium text-primary">Меню → Шаблоны договоров</span>
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <div className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-0 transition-all",
                      selectedTemplateId
                        ? "border-primary/40 bg-primary/3 ring-1 ring-primary/20"
                        : "border-gray-200 bg-gray-50 hover:border-gray-300",
                    )}>
                      <FileText className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        selectedTemplateId ? "text-primary" : "text-gray-400",
                      )} />
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="flex-1 bg-transparent text-[13px] font-medium text-gray-700 py-3 outline-none appearance-none cursor-pointer"
                      >
                        <option value="">— Выберите шаблон —</option>
                        {templates.map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                        ))}
                      </select>
                      <ChevronDown className={cn(
                        "w-4 h-4 shrink-0 transition-all pointer-events-none",
                        selectedTemplateId ? "text-primary" : "text-gray-400",
                      )} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!selectedTemplateId || sendMutation.isPending}
                    className={cn(
                      "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[14px] font-semibold transition-all",
                      selectedTemplateId
                        ? "bg-[#25D366] hover:bg-[#22c55e] active:bg-[#16a34a] text-white shadow-md shadow-[#25D366]/25"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed",
                    )}
                  >
                    {sendMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    )}
                    {sendMutation.isPending
                      ? "Отправляем…"
                      : selectedTemplateId
                        ? `Отправить «${selectedTemplate?.name ?? ""}»`
                        : "Выберите шаблон"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Extraction bundle card ── */}
          {bundle?.hasExtractionInPlan && (
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4 text-slate-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 leading-tight">Пакет договоров</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">Договор · ИДС · Вкладыш · Памятка</p>
                </div>
              </div>
              <div className="px-4 py-3">
                {bundle.bundlePreparing && (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Формируем документы…
                  </div>
                )}
                {!bundle.bundlePreparing && bundle.bundleToken && !bundle.bundleSent && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={bundle.onOpenPreview}
                      className="flex-1 h-8 text-[12px] font-medium text-gray-700 border border-border rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Предпросмотр
                    </button>
                    <button
                      disabled={bundle.bundleSending}
                      onClick={() => bundle.onSend(bundle.bundleToken!)}
                      className="flex-1 h-8 text-[12px] font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {bundle.bundleSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.107 1.514 5.836L0 24l6.335-1.493A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.028-1.383l-.36-.214-3.732.979.997-3.645-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                      )}
                      {bundle.bundleSending ? "Отправляем…" : "Отправить"}
                    </button>
                  </div>
                )}
                {!bundle.bundlePreparing && bundle.bundleSent && bundle.bundleToken && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Отправлено пациенту
                    </div>
                    <button
                      onClick={bundle.onOpenPreview}
                      className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      Открыть
                    </button>
                  </div>
                )}
                {!bundle.bundlePreparing && !bundle.bundleToken && (
                  <button
                    onClick={bundle.onPrepare}
                    className="w-full h-8 text-[12px] font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Подготовить документы
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Contract history ── */}
          <div>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between mb-3 group"
            >
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  История договоров
                </p>
                {historyItems.length > 0 && (
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {historyItems.length}
                  </span>
                )}
              </div>
              {historyOpen
                ? <ChevronUp className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
                : <ChevronDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />}
            </button>

            {historyOpen && (
              <>
                {contractsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
                    <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-[12px] text-gray-400">Договоров ещё не отправлено</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyItems.map((item) => {
                      if (item.type === "bundle") {
                        const { bundle } = item;
                        const aggStatus = bundleAggregateStatus(bundle.contracts);
                        const cfg = STATUS_CONFIG[aggStatus] ?? STATUS_CONFIG.sent;
                        const signedCount = bundle.contracts.filter((c) => c.status === "signed").length;
                        return (
                          <button
                            key={bundle.bundleToken}
                            type="button"
                            onClick={() => setOpenBundle(bundle)}
                            className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:border-primary/30 hover:shadow-md transition-all group"
                          >
                            <div className="flex items-start gap-3 px-3.5 py-3">
                              <div className="relative shrink-0 mt-0.5">
                                <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                  <Package className="w-4 h-4 text-primary" />
                                </div>
                                <span className={cn(
                                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                                  cfg.dot,
                                )} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[13px] font-semibold text-gray-800 leading-snug">
                                    Пакет договоров
                                  </p>
                                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                                    {bundle.contracts.length} док.
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                                    cfg.color,
                                  )}>
                                    {cfg.icon}
                                    {aggStatus === "signed"
                                      ? "Все подписаны"
                                      : signedCount > 0
                                        ? `${signedCount}/${bundle.contracts.length} подписано`
                                        : STATUS_LABELS[aggStatus]}
                                  </span>
                                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {formatDateShort(bundle.createdAt)}
                                  </span>
                                  {bundle.sentByName && (
                                    <span className="text-[10px] text-gray-400">· {bundle.sentByName}</span>
                                  )}
                                </div>
                              </div>

                              <ChevronDown className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors shrink-0 mt-2.5 rotate-[-90deg]" />
                            </div>
                          </button>
                        );
                      }

                      const c = item.contract;
                      const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.sent;
                      return (
                        <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                          <div className="flex items-start gap-3 px-3.5 py-3">
                            <div className="relative shrink-0 mt-0.5">
                              <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-primary" />
                              </div>
                              <span className={cn(
                                "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                                cfg.dot,
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-gray-800 truncate leading-snug">
                                {c.templateName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                                  cfg.color,
                                )}>
                                  {cfg.icon}
                                  {STATUS_LABELS[c.status]}
                                </span>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatDateShort(c.createdAt)}
                                </span>
                                {c.sentByName && (
                                  <span className="text-[10px] text-gray-400">· {c.sentByName}</span>
                                )}
                              </div>
                              {c.status === "signed" && c.signedAt && (
                                <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Подписан {formatDate(c.signedAt)}
                                </p>
                              )}
                            </div>
                            <a
                              href={`/p/contract/${c.token}?preview=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-primary hover:bg-primary/5 transition-colors mt-0.5"
                              title="Открыть договор"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>

      {openBundle && (
        <BundleModal bundle={openBundle} onClose={() => setOpenBundle(null)} />
      )}
    </div>
  );
}
