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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractsTabProps {
  patientId: string;
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

export function ContractsTab({ patientId }: ContractsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(true);

  const { data: contractsData, isLoading: contractsLoading } = useListPatientContracts(patientId);
  const { data: templatesData, isLoading: templatesLoading } = useListContractTemplates();
  const sendMutation = useSendContract();

  const contracts = contractsData?.data?.contracts ?? [];
  const templates = templatesData?.data?.templates ?? [];

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
            {/* Header */}
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
                  {/* Template cards */}
                  <div className="space-y-2">
                    {templates.map((tmpl) => {
                      const isSelected = selectedTemplateId === tmpl.id;
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(isSelected ? "" : tmpl.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all text-left",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                              : "border-gray-100 bg-gray-50/60 hover:border-gray-200 hover:bg-gray-50",
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isSelected ? "bg-primary/15" : "bg-white border border-gray-100",
                          )}>
                            <FileText className={cn("w-4 h-4", isSelected ? "text-primary" : "text-gray-400")} />
                          </div>
                          <span className={cn(
                            "flex-1 text-[13px] font-medium leading-snug",
                            isSelected ? "text-primary" : "text-gray-700",
                          )}>
                            {tmpl.name}
                          </span>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* WhatsApp send button */}
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
                {contracts.length > 0 && (
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {contracts.length}
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
                ) : contracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
                    <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-[12px] text-gray-400">Договоров ещё не отправлено</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((c: PatientContract) => {
                      const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.sent;
                      return (
                        <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                          <div className="flex items-start gap-3 px-3.5 py-3">
                            {/* Icon */}
                            <div className="relative shrink-0 mt-0.5">
                              <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-primary" />
                              </div>
                              <span className={cn(
                                "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                                cfg.dot,
                              )} />
                            </div>

                            {/* Content */}
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

                            {/* Open link */}
                            <a
                              href={`/p/contract/${c.token}`}
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
    </div>
  );
}
