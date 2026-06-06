import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListContractTemplates,
  useUploadContractTemplate,
  useDeleteContractTemplate,
  useUpdateTemplateMappings,
  type ContractTemplate,
  type FieldMappingItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  FileText, Upload, Trash2, ChevronLeft, Loader2, AlertCircle, CheckCircle2, Plus,
  ChevronDown, ChevronUp, Pencil, Save, X, Lock, Eye, Folder, FolderOpen, ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";

const PATIENT_FIELDS = [
  { field: "patient.name",        label: "ФИО пациента" },
  { field: "patient.phone",       label: "Телефон" },
  { field: "patient.iin",         label: "ИИН" },
  { field: "patient.dateOfBirth", label: "Дата рождения" },
  { field: "patient.gender",      label: "Пол" },
  { field: "doctor.name",         label: "Врач" },
  { field: "clinic.name",         label: "Название клиники" },
  { field: "date.today",          label: "Сегодняшняя дата" },
  { field: "date.year",           label: "Год" },
];

function MappingEditor({ template, onClose }: { template: ContractTemplate; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateTemplateMappings();

  const rawMappings = Array.isArray(template.fieldMappings)
    ? (template.fieldMappings as unknown as FieldMappingItem[])
    : [];

  const [mappings, setMappings] = useState<FieldMappingItem[]>(
    rawMappings.length > 0 ? rawMappings : [],
  );

  const updateMapping = (idx: number, key: keyof FieldMappingItem, value: string) => {
    setMappings((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx]!, [key]: value };
      // Auto-update label when patientField changes
      if (key === "patientField") {
        const found = PATIENT_FIELDS.find((f) => f.field === value);
        if (found) copy[idx] = { ...copy[idx]!, label: found.label };
      }
      return copy;
    });
  };

  const removeMapping = (idx: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== idx));
  };

  const addMapping = () => {
    setMappings((prev) => [
      ...prev,
      { placeholder: "", patientField: "patient.name", label: "ФИО пациента" },
    ]);
  };

  const handleSave = () => {
    updateMutation.mutate(
      { id: template.id, fieldMappings: mappings },
      {
        onSuccess: () => {
          toast({ title: "Маппинг сохранён" });
          void queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Ошибка сохранения";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl mt-3 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        Маппинг полей ({mappings.length})
      </p>
      <p className="text-xs text-gray-500">
        Укажите, какой плейсхолдер в документе соответствует какому полю пациента.
      </p>

      {mappings.length === 0 && (
        <p className="text-xs text-gray-400 italic py-2 text-center">
          Нет полей. Нажмите «Добавить» или AI не обнаружил плейсхолдеров.
        </p>
      )}

      <div className="space-y-2">
        {mappings.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg p-2">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 mb-1"
                placeholder="Плейсхолдер (напр. «ФИО»)"
                value={m.placeholder}
                onChange={(e) => updateMapping(idx, "placeholder", e.target.value)}
              />
              <select
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                value={m.patientField}
                onChange={(e) => updateMapping(idx, "patientField", e.target.value)}
              >
                {PATIENT_FIELDS.map((f) => (
                  <option key={f.field} value={f.field}>{f.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => removeMapping(idx)}
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addMapping}>
          <Plus className="w-3 h-3" />
          Добавить поле
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
          Отмена
        </Button>
        <Button size="sm" className="gap-1.5 text-xs" disabled={updateMutation.isPending} onClick={handleSave}>
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

export default function ContractTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customName, setCustomName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useListContractTemplates();
  const uploadMutation = useUploadContractTemplate();
  const deleteMutation = useDeleteContractTemplate();

  const allTemplates = data?.data?.templates ?? [];
  const systemTemplates = allTemplates.filter((t: ContractTemplate) => t.isSystem);
  const templates = allTemplates.filter((t: ContractTemplate) => !t.isSystem);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "Имплантация": true, // Expand Implantation by default as requested
  });
  const [expandedSubcategories, setExpandedSubcategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleSubcategory = (sub: string) => {
    setExpandedSubcategories((prev) => ({ ...prev, [sub]: !prev[sub] }));
  };

  const SYSTEM_CATEGORIES = ["Детская стоматология", "Имплантация", "Ортодонтия", "Ортопедия", "Терапия", "Хирургия"];

  const groupedSystemTemplates = useMemo(() => {
    const groups: Record<string, Record<string, ContractTemplate[]>> = {};
    for (const tmpl of systemTemplates) {
      const category = (tmpl as any).category || "Другое";
      const subcategory = (tmpl as any).subcategory || "Общие";
      if (!groups[category]) {
        groups[category] = {};
      }
      if (!groups[category][subcategory]) {
        groups[category][subcategory] = [];
      }
      groups[category][subcategory].push(tmpl);
    }
    return groups;
  }, [systemTemplates]);

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
        const mappings = res.data.template.fieldMappings as unknown as FieldMappingItem[];
        toast({
          title: `Шаблон «${res.data.template.name}» загружен`,
          description:
            Array.isArray(mappings) && mappings.length > 0
              ? `AI обнаружил ${mappings.length} поле(й) для автозаполнения`
              : "AI не нашёл динамических полей — добавьте маппинги вручную",
        });
        setCustomName("");
        void queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
        // Auto-open mapping editor for new template
        if (res.data.template.id) {
          setExpandedId(res.data.template.id);
          setEditingId(res.data.template.id);
        }
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
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Как работает AI-анализ</p>
            <p>
              После загрузки AI сканирует договор и находит места с пустыми строками, метками
              (ФИО, ИИН, дата) и плейсхолдерами. Вы можете отредактировать обнаруженные поля,
              нажав на значок карандаша рядом с шаблоном.
            </p>
          </div>
        </div>

        {/* System (built-in) templates — read-only */}
        {!isLoading && systemTemplates.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-gray-700">Встроенные пакеты документов</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" />
                Только просмотр
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Пакеты документов готовятся автоматически в зависимости от услуг в плане лечения.
            </p>

            <div className="space-y-3">
              {SYSTEM_CATEGORIES.map((category) => {
                const subcategories = groupedSystemTemplates[category];
                if (!subcategories) return null;

                const isCatExpanded = !!expandedCategories[category];
                const totalDocs = Object.values(subcategories).reduce((sum, list) => sum + list.length, 0);

                return (
                  <div key={category} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition-colors">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary shrink-0">
                          {isCatExpanded ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{category}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{totalDocs} документов в пакете</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCatExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {/* Subcategories & Files */}
                    {isCatExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-4 space-y-4">
                        {Object.keys(subcategories).sort().map((subcategory) => {
                          const docs = subcategories[subcategory]!;
                          const subKey = `${category}:${subcategory}`;
                          const isSubExpanded = !!expandedSubcategories[subKey];

                          return (
                            <div key={subcategory} className="space-y-2">
                              {/* Subcategory Header */}
                              <button
                                onClick={() => toggleSubcategory(subKey)}
                                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1 outline-none"
                              >
                                {isSubExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>{subcategory}</span>
                                <span className="bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded-full text-[10px]">
                                  {docs.length}
                                </span>
                              </button>

                              {/* Document list under Subcategory */}
                              {isSubExpanded && (
                                <div className="pl-4 space-y-2 border-l-2 border-dashed border-slate-200 ml-1.5 py-1">
                                  {docs.map((tmpl) => {
                                    const isExpanded = expandedId === tmpl.id;
                                    return (
                                      <div key={tmpl.id} className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-xs">
                                        <div className="p-3 flex items-center justify-between gap-4">
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                                            <p className="text-xs font-medium text-gray-700 truncate">{tmpl.name}</p>
                                          </div>
                                          <button
                                            onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                                            title="Посмотреть содержимое"
                                          >
                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                          </button>
                                        </div>
                                        {isExpanded && tmpl.extractedText && (
                                          <div className="px-3 pb-3 border-t border-slate-100 pt-2 bg-slate-50/50">
                                            <div className="bg-white rounded-lg border border-slate-100 p-2.5 max-h-48 overflow-y-auto">
                                              <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
                                                {tmpl.extractedText}
                                              </pre>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* User templates list */}
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
                const rawMappings = Array.isArray(tmpl.fieldMappings)
                  ? (tmpl.fieldMappings as unknown as FieldMappingItem[])
                  : [];
                const fieldCount = rawMappings.length;
                const isExpanded = expandedId === tmpl.id;
                const isEditing = editingId === tmpl.id;

                return (
                  <div key={tmpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{tmpl.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {tmpl.fileType.toUpperCase()} · {new Date(tmpl.createdAt).toLocaleDateString("ru-RU")}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {fieldCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              {fieldCount} поле(й) AI
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              Нет полей
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                              setExpandedId(null);
                            } else {
                              setExpandedId(tmpl.id);
                              setEditingId(tmpl.id);
                            }
                          }}
                          className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                          title="Редактировать маппинг полей"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded && !isEditing ? null : tmpl.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                          title="Показать поля"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(tmpl.id, tmpl.name)}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Удалить шаблон"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded mapping view / editor */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-50 pt-2">
                        {isEditing ? (
                          <MappingEditor
                            template={tmpl}
                            onClose={() => { setEditingId(null); setExpandedId(null); }}
                          />
                        ) : (
                          <div className="space-y-1.5">
                            {rawMappings.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">Нет полей</p>
                            ) : rawMappings.map((m, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 max-w-[160px] truncate">
                                  {m.placeholder}
                                </span>
                                <span className="text-gray-300">→</span>
                                <span className="font-medium text-gray-700">{m.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
