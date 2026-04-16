import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInventory,
  useListUsers,
  useCreateInventoryItem,
  useUpdateInventoryStock,
  useDeleteInventoryItem,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import type { InventoryItem } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useMyInventoryAccess, useInventoryAccessManager } from "@/hooks/use-inventory-access";
import type { InventoryAccessLevel } from "@/hooks/use-inventory-access";
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
import {
  Plus, Package, AlertTriangle, Trash2, Check, X,
  ShieldCheck, ShieldX, Eye, Shield, Users, ChevronLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

const CATEGORY_KEYS = [
  "materials", "instruments", "medications",
  "consumables", "prosthetics", "implants", "other",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  materials:   "bg-blue-50 text-blue-700",
  instruments: "bg-purple-50 text-purple-700",
  medications: "bg-green-50 text-green-700",
  consumables: "bg-amber-50 text-amber-700",
  prosthetics: "bg-pink-50 text-pink-700",
  implants:    "bg-teal-50 text-teal-700",
  other:       "bg-slate-100 text-slate-600",
};

interface CreateForm {
  name: string; category: string; unit: string;
  unitPrice: string; quantity: string; minQuantity: string;
}

/* ─── Stock editor ─── */
function StockEditor({
  item, onSave, onCancel,
}: {
  item: InventoryItem & { quantity: number; minQuantity: number };
  onSave: (qty: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(item.quantity));
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number" min={0} step={0.1} value={value}
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

/* ─── Access Level Badge ─── */
const ACCESS_CONFIG: Record<InventoryAccessLevel, { label: string; icon: React.ElementType; color: string }> = {
  full_access: { label: "Полный доступ", icon: ShieldCheck, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  read_only:   { label: "Только чтение", icon: Eye,         color: "bg-blue-100 text-blue-700 border-blue-200"       },
  denied:      { label: "Нет доступа",   icon: ShieldX,     color: "bg-red-100 text-red-600 border-red-200"          },
};

function AccessBadge({ level }: { level: InventoryAccessLevel }) {
  const cfg = ACCESS_CONFIG[level];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", cfg.color)}>
      <cfg.icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

/* ─── Owner Access Manager ─── */
function OwnerAccessManager() {
  const { data: usersData } = useListUsers();
  const { getAccess, setUserAccess } = useInventoryAccessManager();
  const managedRoles = ["admin", "doctor"];
  const users = (usersData?.data?.users ?? []).filter((u) => managedRoles.includes(u.role));

  if (users.length === 0) return null;

  const ACCESS_LEVELS: InventoryAccessLevel[] = ["full_access", "read_only", "denied"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-gray-900">Управление доступом к складу</h2>
        <span className="ml-auto text-xs text-gray-400">Только вы видите этот раздел</span>
      </div>
      <div className="divide-y divide-gray-50">
        {users.map((u) => {
          const current = getAccess(u.id, u.role);
          const cfg = ACCESS_CONFIG[current];
          return (
            <div key={u.id} className="px-5 py-3.5 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                {u.name[0]?.toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-400">{u.role === "admin" ? "Администратор" : "Врач"}</p>
              </div>
              {/* Dropdown select */}
              <div className="relative shrink-0">
                <select
                  value={current}
                  onChange={(e) => setUserAccess(u.id, e.target.value as InventoryAccessLevel)}
                  className={cn(
                    "appearance-none pl-2.5 pr-7 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors",
                    current === "full_access" && "bg-emerald-50 border-emerald-200 text-emerald-700",
                    current === "read_only"   && "bg-blue-50 border-blue-200 text-blue-700",
                    current === "denied"      && "bg-red-50 border-red-200 text-red-600",
                  )}
                >
                  {ACCESS_LEVELS.map((level) => (
                    <option key={level} value={level}>{ACCESS_CONFIG[level].label}</option>
                  ))}
                </select>
                <cfg.icon className={cn(
                  "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3",
                  current === "full_access" && "text-emerald-600",
                  current === "read_only"   && "text-blue-600",
                  current === "denied"      && "text-red-500",
                )} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function InventoryPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({
    name: "", category: "materials", unit: "шт",
    unitPrice: "0", quantity: "0", minQuantity: "0",
  });

  const myAccess = useMyInventoryAccess(user?.id, user?.role);
  const isOwner = user?.role === "owner";

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

  const baseCanWrite = ["owner", "admin", "warehouse"].includes(user?.role ?? "");
  const baseCanDelete = ["owner", "admin"].includes(user?.role ?? "");

  const canWrite  = baseCanWrite  && myAccess === "full_access";
  const canDelete = baseCanDelete && myAccess === "full_access";

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
    mutation: { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setEditingStockId(null); } },
  });
  const deleteMutation = useDeleteInventoryItem({
    mutation: { onSuccess: () => void qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }) },
  });

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

  /* ── Access denied screen ── */
  if (myAccess === "denied" && !isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Нет доступа</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Владелец клиники закрыл вам доступ к складу. Обратитесь к нему для получения прав.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      {/* Page Header */}
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">{t("inventory.title")}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {t("inventory.items", { count: items.length })}
            {lowStock.length > 0 && (
              <> · <span className="text-destructive font-semibold">{t("inventory.lowStock", { count: lowStock.length })}</span></>
            )}
            {!isOwner && <span className="ml-0.5"><AccessBadge level={myAccess} /></span>}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowCreate((v) => !v)} size="sm" className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />
            {t("inventory.add")}
          </Button>
        )}
      </div>
      <div className="p-4 pb-8 space-y-4">

      {/* Read-only notice */}
      {myAccess === "read_only" && !isOwner && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
          <Eye className="w-4 h-4 shrink-0" />
          Вы просматриваете склад в режиме «только чтение». Изменения недоступны.
        </div>
      )}

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">{t("inventory.lowStockTitle")}</p>
            <p className="text-xs text-destructive/80">{lowStock.map((i) => i.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && canWrite && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-border/50 p-4 space-y-3 shadow-sm">
          <p className="font-semibold text-sm mb-1">{t("inventory.newItem")}</p>
          <Input
            placeholder={t("inventory.name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required className="text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_KEYS.map((c) => (
                  <SelectItem key={c} value={c}>{t(`category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t("inventory.unit")}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" placeholder={t("inventory.price")}  value={form.unitPrice}  onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}  className="text-sm" />
            <Input type="number" placeholder={t("inventory.qty")}    value={form.quantity}   onChange={(e) => setForm({ ...form, quantity: e.target.value })}   className="text-sm" />
            <Input type="number" placeholder={t("inventory.minQty")} value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? t("inventory.creating") : t("inventory.create")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              {t("inventory.cancel")}
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
            filterCategory === "all" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          {t("inventory.allFilter", { count: items.length })}
        </button>
        {CATEGORY_KEYS.map((cat) => {
          const count = items.filter((i) => i.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                filterCategory === cat ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {t(`category.${cat}`)} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <Input
        placeholder={t("inventory.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm"
      />

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {items.length === 0 ? t("inventory.emptyFirst") : t("inventory.emptySearch")}
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
                      {t(`category.${item.category}`)}
                    </span>
                    {isLow && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        {t("inventory.low")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.unitPrice > 0 && `${item.unitPrice.toLocaleString()} / ${item.unit}`}
                    {item.minQuantity > 0 && ` · ${t("inventory.min", { qty: item.minQuantity, unit: item.unit })}`}
                  </p>
                </div>

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
                        !canWrite && "cursor-default",
                      )}
                    >
                      {item.quantity} {item.unit}
                    </button>
                  )}
                </div>

                {canDelete && (
                  <button
                    onClick={() => setConfirmDeleteId(item.id)}
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

      {/* Owner-only: access management */}
      {isOwner && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 font-medium uppercase tracking-wide">
            <Users className="w-3.5 h-3.5" />
            Права доступа к складу
          </div>
          <OwnerAccessManager />
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => { deleteMutation.mutate({ id: confirmDeleteId! }); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      </div>
    </div>
  );
}
