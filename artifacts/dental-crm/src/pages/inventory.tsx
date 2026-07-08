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
  ShieldCheck, ShieldX, Eye, Shield, Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "react-i18next";
import { InventoryListSkeleton } from "@/components/skeletons";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { usePageBack } from "@/hooks/use-page-back";

const CATEGORY_KEYS = [
  "materials", "instruments", "medications",
  "consumables", "prosthetics", "implants", "other",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  materials:   "bg-[#e0f2fe] text-[#0284c7]",
  instruments: "bg-[#f0fdf4] text-[#16a34a]",
  medications: "bg-[#f0fdf4] text-[#16a34a]",
  consumables: "bg-[#fef3c7] text-[#d97706]",
  prosthetics: "bg-[#fef2f2] text-[#dc2626]",
  implants:    "bg-[#e0f2fe] text-[#0284c7]",
  other:       "bg-[#f1ede4] text-[#64748b]",
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
        className="w-20 text-sm px-2 py-1 rounded-xl border border-[#e8e3d9] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
        autoFocus
      />
      <button
        onClick={() => {
          const parsed = parseFloat(value);
          if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0) return;
          onSave(parsed);
        }}
        className="p-1 text-[#1f75fe] hover:text-[#1a65e8]"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-1 text-[#64748b] hover:text-[#0f172a]">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Access Level Badge ─── */
const ACCESS_CONFIG: Record<InventoryAccessLevel, { label: string; icon: React.ElementType; color: string }> = {
  full_access: { label: "Полный доступ", icon: ShieldCheck, color: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
  read_only:   { label: "Только чтение", icon: Eye,         color: "bg-[#e0f2fe] text-[#0284c7] border-[#bae6fd]"       },
  denied:      { label: "Нет доступа",   icon: ShieldX,     color: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]"          },
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
    <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e8e3d9] flex items-center gap-2">
        <Shield className="w-4 h-4 text-[#1f75fe]" />
        <h2 className="text-sm font-bold text-[#0f172a]">Управление доступом к складу</h2>
        <span className="ml-auto text-xs text-[#94a3b8]">Только вы видите этот раздел</span>
      </div>
      <div className="divide-y divide-[#e8e3d9]">
        {users.map((u) => {
          const current = getAccess(u.id, u.role);
          const cfg = ACCESS_CONFIG[current];
          return (
            <div key={u.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-[#faf8f4] transition-colors">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 text-xs font-bold text-[#1f75fe]">
                {u.name[0]?.toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0f172a] truncate">{u.name}</p>
                <p className="text-xs text-[#94a3b8]">{u.role === "admin" ? "Администратор" : "Врач"}</p>
              </div>
              {/* Dropdown select */}
              <div className="relative shrink-0">
                <select
                  value={current}
                  onChange={(e) => setUserAccess(u.id, e.target.value as InventoryAccessLevel)}
                  className={cn(
                    "appearance-none pl-2.5 pr-7 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 transition-colors",
                    current === "full_access" && "bg-[#f0fdf4] border-[#bbf7d0] text-[#16a34a]",
                    current === "read_only"   && "bg-[#e0f2fe] border-[#bae6fd] text-[#0284c7]",
                    current === "denied"      && "bg-[#fef2f2] border-[#fecaca] text-[#dc2626]",
                  )}
                >
                  {ACCESS_LEVELS.map((level) => (
                    <option key={level} value={level}>{ACCESS_CONFIG[level].label}</option>
                  ))}
                </select>
                <cfg.icon className={cn(
                  "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3",
                  current === "full_access" && "text-[#16a34a]",
                  current === "read_only"   && "text-[#0284c7]",
                  current === "denied"      && "text-[#dc2626]",
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
  const goBack = usePageBack();
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
  const lowStock = items.filter((i) => i.minQuantity > 0 && i.quantity <= i.minQuantity);

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
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#fef2f2] flex items-center justify-center mb-4">
          <ShieldX className="w-8 h-8 text-[#dc2626]" />
        </div>
        <h2 className="text-xl font-bold text-[#0f172a] mb-2">Нет доступа</h2>
        <p className="text-sm text-[#64748b] max-w-xs">
          Владелец клиники закрыл вам доступ к складу. Обратитесь к нему для получения прав.
        </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t("inventory.title")}
        subtitle={[
          t("inventory.items", { count: items.length }),
          lowStock.length > 0 ? t("inventory.lowStock", { count: lowStock.length }) : null,
        ].filter(Boolean).join(" · ")}
        icon={<Package className="w-5 h-5" strokeWidth={1.8} />}
        badge={!isOwner ? <AccessBadge level={myAccess} /> : undefined}
        onBack={goBack}
        right={
          canWrite ? (
            <Button onClick={() => setShowCreate((v) => !v)} size="sm" className="gap-1.5 shrink-0 rounded-full bg-[#1f75fe] hover:bg-[#1a65e8] hover:scale-105 font-semibold">
              <Plus className="w-4 h-4" />
              {t("inventory.add")}
            </Button>
          ) : undefined
        }
      />
      <div className="p-4 pb-8 space-y-4">

      {/* Read-only notice */}
      {myAccess === "read_only" && !isOwner && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#e0f2fe] border border-[#bae6fd] rounded-xl text-[#0284c7] text-sm">
          <Eye className="w-4 h-4 shrink-0" />
          Вы просматриваете склад в режиме «только чтение». Изменения недоступны.
        </div>
      )}

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#dc2626] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#dc2626]">{t("inventory.lowStockTitle")}</p>
            <p className="text-xs text-[#dc2626]/80">{lowStock.map((i) => i.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && canWrite && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-[#e8e3d9] p-4 space-y-3 shadow-md">
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
            filterCategory === "all" ? "bg-[#1f75fe] text-white" : "bg-[#f1ede4] text-[#64748b] hover:bg-[#e8e3d9]",
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
                filterCategory === cat ? "bg-[#1f75fe] text-white" : "bg-[#f1ede4] text-[#64748b] hover:bg-[#e8e3d9]",
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
        <InventoryListSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#94a3b8]">
          <Package className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {items.length === 0 ? t("inventory.emptyFirst") : t("inventory.emptySearch")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isLow = item.minQuantity > 0 && item.quantity <= item.minQuantity;
            return (
              <div
                key={item.id}
                className={cn(
                  "bg-white rounded-2xl border p-3.5 flex items-center gap-3 shadow-md hover:shadow-lg transition-shadow",
                  isLow ? "border-[#fecaca]" : "border-[#e8e3d9]",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-[#0f172a] truncate">{item.name}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", CATEGORY_COLORS[item.category])}>
                      {t(`category.${item.category}`)}
                    </span>
                    {isLow && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626] font-medium">
                        {t("inventory.low")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748b] mt-0.5">
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
                        "text-sm font-bold px-2.5 py-1 rounded-xl transition-colors",
                        isLow ? "text-[#dc2626] bg-[#fef2f2]" : "text-[#0f172a] bg-[#f1ede4]",
                        canWrite && "hover:bg-[#1f75fe]/10 hover:text-[#1f75fe] cursor-pointer",
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
                    className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] transition-colors shrink-0"
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
          <div className="flex items-center gap-2 text-xs text-[#94a3b8] font-medium uppercase tracking-wide">
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
    </PageShell>
  );
}
