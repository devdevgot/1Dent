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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Plus, Search, Pencil, Trash2, Check, X, ClipboardList,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderAddButton } from "@/components/layout/page-header";
import { ServicesTableSkeleton } from "@/components/skeletons";

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

function templatePrice(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTemplatePrice(value: unknown): string {
  const price = templatePrice(value);
  if (price <= 0) return "бесплатно";
  return price.toLocaleString("ru-KZ");
}

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
  const { toast } = useToast();
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
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось добавить услугу", variant: "destructive" });
        setSaving(false);
      },
    },
  });

  const updateMutation = useUpdateProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setEditing(null);
        setSaving(false);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось сохранить изменения", variant: "destructive" });
        setSaving(false);
      },
    },
  });

  const deleteMutation = useDeleteProcedureTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProcedureTemplatesQueryKey() });
        setConfirmDeleteId(null);
        setSaving(false);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось удалить услугу", variant: "destructive" });
        setSaving(false);
      },
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

  const colClass = isOwner
    ? "grid-cols-[56px_1fr_120px_80px]"
    : "grid-cols-[56px_1fr_120px]";

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title="Прейскурант"
        subtitle={`${templates.length} услуг в каталоге`}
        onBack={() => window.history.back()}
        right={
          isOwner ? (
            <PageHeaderAddButton
              onClick={() => {
                setShowAdd(true);
                setTimeout(() => document.getElementById("add-service-name")?.focus(), 50);
              }}
              title="Добавить"
            />
          ) : undefined
        }
      />

      {/* ── Category tabs ───────────────────────────── */}
      <div className="bg-white border-b border-[#e8e3d9] overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  "px-3.5 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2 relative",
                  isActive
                    ? "text-[#1f75fe] border-[var(--ds-primary)]"
                    : "text-[#64748b] border-transparent hover:text-[#0f172a]",
                )}
              >
                {cat.label}
                {cat.key !== "all" && (
                  <span className={cn(
                    "ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-[var(--ds-primary)]/10 text-[#1f75fe]" : "bg-[#f1ede4] text-[#94a3b8]",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-3xl w-full mx-auto p-4 pb-12 space-y-4">

          {/* Add form (owner only) */}
          {showAdd && isOwner && (
            <form
              onSubmit={handleAdd}
              className="bg-white rounded-2xl border border-[var(--ds-primary)]/20 shadow-md p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-[#0f172a] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1f75fe]" />
                Новая услуга
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">Название *</label>
                  <input
                    id="add-service-name"
                    value={addState.name}
                    onChange={(e) => setAddState({ ...addState, name: e.target.value })}
                    placeholder="Например: Чистка зубов"
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748b] mb-1">Цена (₸)</label>
                  <input
                    type="number"
                    min="0"
                    value={addState.price}
                    onChange={(e) => setAddState({ ...addState, price: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748b] mb-1">Категория</label>
                <select
                  value={addState.category}
                  onChange={(e) => setAddState({ ...addState, category: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#e8e3d9] text-sm text-[#0f172a] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 bg-white"
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
                  className="px-4 py-2 rounded-full border border-[#e8e3d9] text-xs text-[#64748b] hover:bg-[#f1ede4] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={!addState.name.trim() || saving}
                  className="px-5 py-2 rounded-full bg-[var(--ds-primary)] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#1a65e8] hover:scale-105 transition-all disabled:hover:scale-100"
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#e8e3d9] bg-white text-sm text-[#0f172a] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Services table */}
          <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
            {/* Horizontal scroll wrapper */}
            <div className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:#e8e3d9_transparent]">
              <div className="min-w-[480px]">

                {/* Table header */}
                <div className={cn(
                  "grid px-4 py-2.5 border-b border-[#e8e3d9] bg-[#faf8f4]",
                  colClass,
                )}>
                  <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Код</span>
                  <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Услуга</span>
                  <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide text-right">Цена (₸)</span>
                  {isOwner && <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide text-right">Действия</span>}
                </div>

                {isLoading ? (
                  <ServicesTableSkeleton rows={7} />
                ) : filtered.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <ClipboardList className="w-10 h-10 text-[#e8e3d9] mx-auto mb-3" />
                    <p className="text-xs text-[#94a3b8]">
                      {search ? "Услуги не найдены" : "В этой категории нет услуг"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#e8e3d9]">
                    {filtered.map((t) => {
                      const isEditing = editing?.id === t.id;
                      return (
                        <div
                          key={t.id}
                          className={cn(
                            "grid items-center px-4 py-3 transition-colors",
                            colClass,
                            isEditing ? "bg-[var(--ds-primary)]/5" : "hover:bg-[#faf8f4]",
                          )}
                        >
                          {/* Code */}
                          <span className="text-xs text-[#94a3b8] font-mono truncate">{t.code ?? "—"}</span>

                          {/* Name */}
                          <span className="text-sm text-[#0f172a] pr-3 leading-snug">{t.name}</span>

                          {/* Price */}
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              value={editing.price}
                              onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                              onKeyDown={handlePriceKeyDown}
                              autoFocus
                              className="w-full px-2 py-1 rounded-xl border border-[var(--ds-primary)]/40 text-sm text-right focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 font-mono text-[#0f172a]"
                            />
                          ) : (
                            <span
                              className={cn(
                                "text-sm text-right font-mono tabular-nums",
                                templatePrice(t.defaultPrice) <= 0 ? "text-[#94a3b8]" : "text-[#0f172a]",
                                isOwner && "cursor-pointer hover:text-[#1f75fe] transition-colors",
                              )}
                              onClick={isOwner ? () => setEditing({ id: t.id, price: String(templatePrice(t.defaultPrice)) }) : undefined}
                              title={isOwner ? "Нажмите для изменения цены" : undefined}
                            >
                              {formatTemplatePrice(t.defaultPrice)}
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
                                    className="p-1.5 rounded-xl bg-[var(--ds-primary)] text-white hover:bg-[#1a65e8] disabled:opacity-50 transition-colors"
                                    title="Сохранить"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => { setEditing(null); setSaving(false); }}
                                    className="p-1.5 rounded-xl border border-[#e8e3d9] text-[#64748b] hover:bg-[#f1ede4] transition-colors"
                                    title="Отмена"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setEditing({ id: t.id, price: String(templatePrice(t.defaultPrice)) })}
                                    className="p-1.5 rounded-xl text-[#94a3b8] hover:text-[#1f75fe] hover:bg-[var(--ds-primary)]/10 transition-colors"
                                    title="Изменить цену"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(t.id)}
                                    className="p-1.5 rounded-xl text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
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
            </div>
          </div>

          {/* Итого по активной вкладке */}
          {filtered.length > 0 && !search && (
            <div className="text-xs text-[#94a3b8] text-right px-1">
              {filtered.length} услуг ·{" "}
              {activeTab === "all"
                ? "все категории"
                : CATEGORIES.find((c) => c.key === activeTab)?.label}
            </div>
          )}

        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (!confirmDeleteId || saving) return;
          handleDelete(confirmDeleteId);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </PageShell>
  );
}
