import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProcedureTemplates,
  useCreateProcedureTemplate,
  useDeleteProcedureTemplate,
  getListProcedureTemplatesQueryKey,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Plus, Search, Pencil, Trash2, Check, X, Stethoscope, DollarSign,
  AlertTriangle, ChevronLeft,
} from "lucide-react";

interface EditState {
  id: string;
  name: string;
  price: string;
}

export default function ServicesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useListProcedureTemplates();
  const templates: ProcedureTemplate[] = useMemo(
    () => (data?.data?.templates ?? []) as ProcedureTemplate[],
    [data],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const createMutation = useCreateProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setShowAdd(false);
        setAddName("");
        setAddPrice("");
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

  const canManage = ["owner", "admin"].includes(user?.role ?? "");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || saving) return;
    setSaving(true);
    createMutation.mutate({
      data: {
        name: addName.trim(),
        defaultPrice: parseFloat(addPrice) || 0,
      },
    });
  }

  function handleEditSave() {
    if (!editing || !editing.name.trim() || saving) return;
    setSaving(true);
    const oldId = editing.id;
    const newName = editing.name.trim();
    const newPrice = parseFloat(editing.price) || 0;
    deleteMutation.mutateAsync({ id: oldId }).then(() => {
      createMutation.mutate({ data: { name: newName, defaultPrice: newPrice } });
      setEditing(null);
    }).catch(() => setSaving(false));
  }

  function handleDelete(id: string) {
    setSaving(true);
    deleteMutation.mutate({ id });
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">Услуги клиники</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} услуг в каталоге</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowAdd(true); setTimeout(() => document.getElementById("add-service-name")?.focus(), 50); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>
      <div className="max-w-3xl mx-auto p-6 pb-12 space-y-6">

      {/* Add form */}
      {showAdd && canManage && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-2xl border border-primary/20 shadow-sm p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Новая услуга
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Название услуги *
              </label>
              <input
                id="add-service-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Например: Чистка зубов"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  Цена по умолчанию (₸)
                </span>
              </label>
              <input
                type="number"
                min="0"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddName(""); setAddPrice(""); }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!addName.trim() || saving}
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
          placeholder="Поиск услуги..."
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_140px_120px] px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Услуга</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Цена (₸)</span>
          {canManage && <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Действия</span>}
        </div>

        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Stethoscope className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {search ? "Услуги не найдены" : "Нет услуг — добавьте первую"}
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
                    "grid grid-cols-[1fr_140px_120px] px-5 py-3.5 items-center transition-colors",
                    isEditing ? "bg-primary/3" : "hover:bg-gray-50/80",
                  )}
                >
                  {/* Name */}
                  {isEditing ? (
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      autoFocus
                      className="w-full px-3 py-1.5 rounded-lg border border-primary/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mr-2"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{t.name}</span>
                  )}

                  {/* Price */}
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      value={editing.price}
                      onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-primary/30 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  ) : (
                    <span className="text-sm text-gray-700 text-right font-mono">
                      {t.defaultPrice.toLocaleString("ru-RU")}
                    </span>
                  )}

                  {/* Actions */}
                  {canManage && (
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={handleEditSave}
                            disabled={!editing.name.trim() || saving}
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
                            onClick={() => setEditing({ id: t.id, name: t.name, price: String(t.defaultPrice) })}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                            title="Редактировать"
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

      {/* Footer info */}
      {templates.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Редактирование услуги создаёт новую запись — записи на приём с предыдущим шаблоном сохраняются без изменений.
          </span>
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => { handleDelete(confirmDeleteId!); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      </div>
    </div>
  );
}
