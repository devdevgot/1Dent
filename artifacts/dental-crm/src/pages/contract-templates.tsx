import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListContractTemplates,
  useUploadContractTemplate,
  useDeleteContractTemplate,
  type ContractTemplate,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  FileText, Upload, Trash2, ChevronLeft, Loader2, AlertCircle, CheckCircle2, Plus,
} from "lucide-react";
import { useLocation } from "wouter";

export default function ContractTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customName, setCustomName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const { data, isLoading } = useListContractTemplates();
  const uploadMutation = useUploadContractTemplate();
  const deleteMutation = useDeleteContractTemplate();

  const templates = data?.data?.templates ?? [];

  const handleFile = (file: File) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
    ];
    if (!allowed.includes(file.type) && !file.name.endsWith(".docx") && !file.name.endsWith(".pdf")) {
      toast({ title: "Поддерживаются только DOCX и PDF файлы", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    if (customName.trim()) formData.append("name", customName.trim());

    uploadMutation.mutate(formData, {
      onSuccess: (res) => {
        const mappings = res.data.template.fieldMappings;
        toast({
          title: `Шаблон «${res.data.template.name}» загружен`,
          description: mappings.length > 0
            ? `AI обнаружил ${mappings.length} поле(й) для автозаполнения`
            : "AI не нашёл динамических полей",
        });
        setCustomName("");
        void queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Ошибка при загрузке";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Удалить шаблон «${name}»? Уже отправленные договоры сохранятся.`)) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Шаблон удалён" });
        void queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Ошибка при удалении";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setLocation("/menu")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Шаблоны договоров</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Загрузите DOCX или PDF — AI автоматически найдёт поля для заполнения
            </p>
          </div>
        </div>

        {/* Upload section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Загрузить новый шаблон
          </h2>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Название шаблона{" "}
              <span className="text-gray-400 font-normal">(необязательно — по умолчанию имя файла)</span>
            </label>
            <input
              type="text"
              placeholder="Например: Договор на лечение зубов"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/40 hover:bg-gray-50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
              className="hidden"
              onChange={handleInputChange}
            />
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Загрузка и анализ файла…</p>
                  <p className="text-xs text-gray-400 mt-1">AI определяет поля для автозаполнения</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Перетащите файл или нажмите</p>
                  <p className="text-xs text-gray-400 mt-1">DOCX или PDF, до 10 МБ</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI info */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6 flex gap-3">
          <div className="shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Как работает AI-анализ</p>
            <p>
              После загрузки AI сканирует договор и находит места с пустыми строками, метками
              (ФИО, ИИН, дата) и плейсхолдерами. Эти поля автоматически заполняются данными
              пациента при отправке.
            </p>
          </div>
        </div>

        {/* Templates list */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">
            Загруженные шаблоны {!isLoading && `(${templates.length})`}
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center bg-white rounded-2xl border border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileText className="w-6 h-6 text-gray-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Нет шаблонов</p>
                <p className="text-xs text-gray-400 mt-0.5">Загрузите первый шаблон договора</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tmpl: ContractTemplate) => {
                const fieldCount = tmpl.fieldMappings?.length ?? 0;
                return (
                  <div key={tmpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{tmpl.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {tmpl.fileType.toUpperCase()} · Загружен {new Date(tmpl.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        {fieldCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            {fieldCount} поле(й) AI
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                            Без AI-полей
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(tmpl.id, tmpl.name)}
                      disabled={deleteMutation.isPending}
                      className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
