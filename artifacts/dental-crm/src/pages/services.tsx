import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProcedureTemplates,
  useCreateProcedureTemplate,
  useDeleteProcedureTemplate,
  useUpdateProcedureTemplate,
  getListProcedureTemplatesQueryKey,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Plus, Search, Pencil, Trash2, Check, X, ChevronLeft, ClipboardList,
} from "lucide-react";

const CATEGORIES = [
  { key: "all",            label: "Все" },
  { key: "therapy",        label: "Терапия" },
  { key: "surgery",        label: "Хирургия" },
  { key: "orthopedics",    label: "Ортопедия" },
  { key: "implantation",   label: "Имплантация" },
  { key: "pediatric",      label: "Детский прайс" },
  { key: "hygiene",        label: "Гигиена" },
  { key: "periodontology", label: "Пародонтология" },
  { key: "radiology",      label: "Рентген" },
  { key: "restoration",    label: "Реставрация" },
  { key: "other",          label: "Прочее" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

interface AddState {
  name: string;
  price: string;
  category: string;
}

interface EditState {
  id: string;
  price: string;
}

export default function ServicesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isOwner = user?.role === "owner";

  const [activeTab, setActiveTab] = useState<CategoryKey>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addState, setAddState] = useState<AddState>({ name: "", price: "", category: "therapy" });
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useListProcedureTemplates();
  const templates: ProcedureTemplate[] = useMemo(
    () => (data?.data?.templates ?? []) as ProcedureTemplate[],
    [data],
  );

  const filtered = useMemo(() => {
    let list = templates;
    if (activeTab !== "all") {
      list = list.filter((t) => (t.category ?? "other") === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [templates, activeTab, search]);

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length };
    for (const t of templates) {
      const cat = t.category ?? "other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const createMutation = useCreateProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setShowAdd(false);
        setAddState({ name: "", price: "", category: "therapy" });
        setSaving(false);
      },
      onError: () => setSaving(false),
    },
  });

  const updateMutation = useUpdateProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setEditing(null);
        setSaving(false);
      },
      onError: () => setSaving(false),
    },
  });

  const deleteMutation = useDeleteProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setConfirmDeleteId(null);
        setSaving(false);
      },
      onError: () => setSaving(false),
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addState.name.trim() || saving) return;
    setSaving(true);
    createMutation.mutate({
      data: {
        name: addState.name.trim(),
        defaultPrice: parseFloat(addState.price) || 0,
        category: addState.category,
      } as Parameters<typeof createMutation.mutate>[0]["data"],
    });
  }

  function handlePriceSave() {
    if (!editing || saving) return;
    const newPrice = parseFloat(editing.price);
    if (isNaN(newPrice) || newPrice < 0) return;
    setSaving(true);
    updateMutation.mutate({ id: editing.id, data: { defaultPrice: newPrice } });
  }

  function handlePriceKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handlePriceSave(); }
    if (e.key === "Escape") { setEditing(null); setSaving(false); }
  }

  function handleDelete(id: string) {
    setSaving(true);
    deleteMutation.mutate({ id });
  }

  return (
    <div className="min-h-full bg-[#f2f2f7] flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-3 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">Прейскурант</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} услуг в каталоге</p>
        </div>
        {isOwner && (
          <button
            onClick={() => {
              setShowAdd(true);
              setTimeout(() => document.getElementById("add-service-name")?.focus(), 50);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto scrollbar-hide">
        <div className="flex gap-0 px-2 min-w-max">
          {CATEGORIES.map((cat) => {
            const count = categoryCount[cat.key] ?? 0;
            if (cat.key !== "all" && count === 0) return null;
            const isActive = activeTab === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => { setActiveTab(cat.key); setSearch(""); }}
                className={cn(
                  "px-3.5 py-3 text-[13px] font-medium transition-colors whitespace-nowrap border-b-2 relative",
                  isActive
                    ? "text-primary border-primary"
                    : "text-gray-500 border-transparent hover:text-gray-700",
                )}
              >
                {cat.label}
                {cat.key !== "all" && (
                  <span className={cn(
                    "ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto p-4 pb-12 space-y-4">

        {/* Add form (owner only) */}
        {showAdd && isOwner && (
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-2xl border border-primary/20 shadow-sm p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Новая услуга
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Название *</label>
                <input
                  id="add-service-name"
                  value={addState.name}
                  onChange={(e) => setAddState({ ...addState, name: e.target.value })}
                  placeholder="Например: Чистка зубов"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Цена (₸)</label>
                <input
                  type="number"
                  min="0"
                  value={addState.price}
                  onChange={(e) => setAddState({ ...addState, price: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Категория</label>
              <select
                value={addState.category}
                onChange={(e) => setAddState({ ...addState, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
              >
                {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddState({ name: "", price: "", category: "therapy" }); }}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!addState.name.trim() || saving}
                className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Services table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className={cn(
            "grid px-4 py-2.5 border-b border-gray-100 bg-gray-50/80",
            isOwner ? "grid-cols-[60px_1fr_130px_90px]" : "grid-cols-[60px_1fr_130px]",
          )}>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Код</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Услуга</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Цена (₸)</span>
            {isOwner && <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Действия</span>}
          </div>

          {isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                {search ? "Услуги не найдены" : "В этой категории нет услуг"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((t) => {
                const isEditing = editing?.id === t.id;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "grid items-center px-4 py-3 transition-colors",
                      isOwner ? "grid-cols-[60px_1fr_130px_90px]" : "grid-cols-[60px_1fr_130px]",
                      isEditing ? "bg-primary/3" : "hover:bg-gray-50/60",
                    )}
                  >
                    {/* Code */}
                    <span className="text-xs text-gray-400 font-mono">{t.code ?? "—"}</span>

                    {/* Name */}
                    <span className="text-sm text-gray-800 pr-3 leading-snug">{t.name}</span>

                    {/* Price */}
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editing.price}
                        onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                        onKeyDown={handlePriceKeyDown}
                        autoFocus
                        className="w-full px-2 py-1 rounded-lg border border-primary/40 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                      />
                    ) : (
                      <span
                        className={cn(
                          "text-sm text-right font-mono tabular-nums",
                          t.defaultPrice === 0 ? "text-gray-400" : "text-gray-800",
                          isOwner && "cursor-pointer hover:text-primary transition-colors",
                        )}
                        onClick={isOwner ? () => setEditing({ id: t.id, price: String(t.defaultPrice) }) : undefined}
                        title={isOwner ? "Нажмите для изменения цены" : undefined}
                      >
                        {t.defaultPrice > 0 ? t.defaultPrice.toLocaleString("ru-RU") : "бесплатно"}
                      </span>
                    )}

                    {/* Actions (owner only) */}
                    {isOwner && (
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={handlePriceSave}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              title="Сохранить"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setEditing(null); setSaving(false); }}
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                              title="Отмена"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditing({ id: t.id, price: String(t.defaultPrice) })}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                              title="Изменить цену"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(t.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Итого по активной вкладке */}
        {filtered.length > 0 && !search && (
          <div className="text-xs text-gray-400 text-right px-1">
            {filtered.length} услуг ·{" "}
            {activeTab === "all"
              ? "все категории"
              : CATEGORIES.find((c) => c.key === activeTab)?.label}
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => { handleDelete(confirmDeleteId!); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
