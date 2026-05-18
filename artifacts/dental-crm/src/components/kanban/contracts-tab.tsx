import { useState } from "react";
import {
  useListPatientContracts,
  useListContractTemplates,
  useSendContract,
  type PatientContract,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  FileText, Send, CheckCircle2, Eye, ExternalLink, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

interface ContractsTabProps {
  patientId: string;
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Отправлен",
  viewed: "Просмотрен",
  signed: "Подписан",
};

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  viewed: "bg-amber-50 text-amber-700 border-amber-200",
  signed: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sent: <Send className="w-3 h-3" />,
  viewed: <Eye className="w-3 h-3" />,
  signed: <CheckCircle2 className="w-3 h-3" />,
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ContractsTab({ patientId }: ContractsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showSend, setShowSend] = useState(false);
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
          toast({ title: "Договор отправлен по WhatsApp" });
          setShowSend(false);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-6 py-5 space-y-4">

          {/* Send new contract */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => setShowSend((v) => !v)}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Send className="w-4 h-4 text-primary" />
                Отправить договор
              </div>
              {showSend ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showSend && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
                {templatesLoading ? (
                  <p className="text-xs text-gray-400">Загрузка шаблонов…</p>
                ) : templates.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Нет шаблонов. Сначала загрузите шаблон в разделе{" "}
                    <span className="font-medium text-primary">Меню → Шаблоны договоров</span>.
                  </p>
                ) : (
                  <>
                    <select
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                      <option value="">— Выберите шаблон —</option>
                      {templates.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      disabled={!selectedTemplateId || sendMutation.isPending}
                      onClick={handleSend}
                    >
                      {sendMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Отправить по WhatsApp
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Contract history */}
          <div>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between mb-3 group"
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">История договоров</p>
              {historyOpen
                ? <ChevronUp className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
                : <ChevronDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />}
            </button>
            {historyOpen && (
              <>
                {contractsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" />
                  </div>
                ) : contracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-gray-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Договоров нет</p>
                      <p className="text-xs text-gray-400 mt-0.5">Отправьте первый договор пациенту</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((c: PatientContract) => (
                      <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{c.templateName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatDate(c.createdAt)}
                              {c.sentByName && ` · ${c.sentByName}`}
                            </p>
                            {c.status === "signed" && c.signedAt && (
                              <p className="text-xs text-green-600 mt-0.5">
                                Подписан: {formatDate(c.signedAt)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[c.status]}`}>
                              {STATUS_ICONS[c.status]}
                              {STATUS_LABELS[c.status]}
                            </span>
                            <a
                              href={`/p/contract/${c.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Открыть
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
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
