import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInventory,
  useCreateInventoryItem,
  useUpdateInventoryStock,
  useDeleteInventoryItem,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import type { InventoryItem } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Package, AlertTriangle, Pencil, Trash2, Check, X } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  materials:    "Материалы",
  instruments:  "Инструменты",
  medications:  "Медикаменты",
  consumables:  "Расходники",
  prosthetics:  "Протезы",
  implants:     "Имплантаты",
  other:        "Прочее",
};

const CATEGORY_COLORS: Record<string, string> = {
  materials:    "bg-blue-50 text-blue-700",
  instruments:  "bg-purple-50 text-purple-700",
  medications:  "bg-green-50 text-green-700",
  consumables:  "bg-amber-50 text-amber-700",
  prosthetics:  "bg-pink-50 text-pink-700",
  implants:     "bg-teal-50 text-teal-700",
  other:        "bg-slate-100 text-slate-600",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

interface CreateForm {
  name: string;
  category: string;
  unit: string;
  unitPrice: string;
  quantity: string;
  minQuantity: string;
}

function StockEditor({
  item,
  onSave,
  onCancel,
}: {
  item: InventoryItem & { quantity: number; minQuantity: number };
  onSave: (qty: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(item.quantity));
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={0.1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 text-sm px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      />
      <button onClick={() => onSave(parseFloat(value) || 0)} className="p-1 text-primary hover:text-primary/80">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function InventoryPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({
    name: "",
    category: "materials",
    unit: "шт",
    unitPrice: "0",
    quantity: "0",
    minQuantity: "0",
  });

  const { data, isLoading } = useListInventory({
    query: { queryKey: getListInventoryQueryKey() },
  });

  const items = (data?.data?.items ?? []) as (InventoryItem & { quantity: number; minQuantity: number })[];

  const filtered = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || item.category === filterCategory;
    return matchSearch && matchCat;
  });

  const lowStock = items.filter((i) => i.minQuantity > 0 && i.quantity < i.minQuantity);

  const createMutation = useCreateInventoryItem({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        setShowCreate(false);
        setForm({ name: "", category: "materials", unit: "шт", unitPrice: "0", quantity: "0", minQuantity: "0" });
      },
    },
  });

  const stockMutation = useUpdateInventoryStock({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        setEditingStockId(null);
      },
    },
  });

  const deleteMutation = useDeleteInventoryItem({
    mutation: {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }),
    },
  });

  const canWrite = ["owner", "admin", "warehouse"].includes(user?.role ?? "");
  const canDelete = ["owner", "admin"].includes(user?.role ?? "");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    createMutation.mutate({
      data: {
        name: form.name.trim(),
        category: form.category as InventoryItem["category"],
        unit: form.unit,
        unitPrice: parseFloat(form.unitPrice) || 0,
        quantity: parseFloat(form.quantity) || 0,
        minQuantity: parseFloat(form.minQuantity) || 0,
      },
    });
  };

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Склад</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} позиций · {lowStock.length > 0 && (
              <span className="text-destructive font-semibold">{lowStock.length} заканчиваются</span>
            )}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowCreate((v) => !v)} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        )}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Низкий запас</p>
            <p className="text-xs text-destructive/80">
              {lowStock.map((i) => i.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && canWrite && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-border/50 p-4 space-y-3 shadow-sm"
        >
          <p className="font-semibold text-sm mb-1">Новый товар / материал</p>
          <Input
            placeholder="Название"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Единица (шт, мл, г)"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number"
              placeholder="Цена"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              className="text-sm"
            />
            <Input
              type="number"
              placeholder="Кол-во"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="text-sm"
            />
            <Input
              type="number"
              placeholder="Мин. запас"
              value={form.minQuantity}
              onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
              className="text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? "Сохранение..." : "Создать"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterCategory("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
            filterCategory === "all"
              ? "bg-primary text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          Все ({items.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = items.filter((i) => i.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                filterCategory === cat
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <Input
        placeholder="Поиск по названию..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm"
      />

      {/* Table / List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {items.length === 0 ? "Склад пустой. Добавьте первый товар." : "Ничего не найдено"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isLow = item.minQuantity > 0 && item.quantity < item.minQuantity;
            return (
              <div
                key={item.id}
                className={cn(
                  "bg-white rounded-xl border p-3.5 flex items-center gap-3 shadow-sm",
                  isLow ? "border-destructive/30" : "border-border/50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", CATEGORY_COLORS[item.category])}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    {isLow && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        Мало
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.unitPrice > 0 && `${item.unitPrice.toLocaleString("ru-RU")} ₽ / ${item.unit}`}
                    {item.minQuantity > 0 && ` · Мин: ${item.minQuantity} ${item.unit}`}
                  </p>
                </div>

                {/* Stock editor */}
                <div className="shrink-0 text-right">
                  {canWrite && editingStockId === item.id ? (
                    <StockEditor
                      item={item}
                      onSave={(qty) => stockMutation.mutate({ id: item.id, data: { quantity: qty } })}
                      onCancel={() => setEditingStockId(null)}
                    />
                  ) : (
                    <button
                      onClick={() => canWrite && setEditingStockId(item.id)}
                      className={cn(
                        "text-sm font-bold px-2.5 py-1 rounded-lg transition-colors",
                        isLow ? "text-destructive bg-destructive/10" : "text-foreground bg-slate-100",
                        canWrite && "hover:bg-primary/10 hover:text-primary cursor-pointer",
                      )}
                    >
                      {item.quantity} {item.unit}
                    </button>
                  )}
                </div>

                {canDelete && (
                  <button
                    onClick={() => deleteMutation.mutate({ id: item.id })}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
