import { useListInventory } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Package, AlertTriangle, TrendingDown } from "lucide-react";

export default function WarehousePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useListInventory();

  const items = data?.data?.items ?? [];

  const lowStock = items.filter((i) => (i.quantity ?? 0) <= (i.minQuantity ?? 0) && (i.minQuantity ?? 0) > 0);
  const normalStock = items.filter((i) => (i.quantity ?? 0) > (i.minQuantity ?? 0) || (i.minQuantity ?? 0) === 0);

  const categoryColors: Record<string, string> = {
    materials:   "bg-blue-50 text-blue-700",
    instruments: "bg-purple-50 text-purple-700",
    medications: "bg-green-50 text-green-700",
    consumables: "bg-amber-50 text-amber-700",
    prosthetics: "bg-pink-50 text-pink-700",
    implants:    "bg-teal-50 text-teal-700",
    other:       "bg-slate-100 text-slate-600",
  };

  function stockBarWidth(qty: number, min: number): string {
    if (min === 0) return "100%";
    const pct = Math.min(100, Math.round((qty / (min * 2)) * 100));
    return `${pct}%`;
  }

  function stockBarColor(qty: number, min: number): string {
    if (min === 0 || qty > min * 1.5) return "bg-emerald-500";
    if (qty > min) return "bg-amber-400";
    return "bg-red-500";
  }

  const InventoryRow = ({ item }: { item: typeof items[number] }) => (
    <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
            {(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[item.category ?? "other"] ?? categoryColors.other}`}>
              {t(`inventory.category.${item.category ?? "other"}`)}
            </span>
            <span className="text-xs text-muted-foreground">{item.unit}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 ? "text-red-600" : "text-foreground"}`}>
            {item.quantity ?? 0}
          </p>
          {(item.minQuantity ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">{t("warehouse.min")}: {item.minQuantity}</p>
          )}
        </div>
      </div>
      {(item.minQuantity ?? 0) > 0 && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${stockBarColor(item.quantity ?? 0, item.minQuantity ?? 0)}`}
            style={{ width: stockBarWidth(item.quantity ?? 0, item.minQuantity ?? 0) }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 pb-24 space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">{t("warehouse.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("warehouse.subtitle")}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-foreground">{items.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("warehouse.totalItems")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{normalStock.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("warehouse.inStock")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-red-600">{lowStock.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("warehouse.lowStock")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
          {t("common.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
          {t("warehouse.empty")}
        </div>
      ) : (
        <>
          {/* Low stock alert section */}
          {lowStock.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2 bg-red-50">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-700">{t("warehouse.lowStockAlert")} ({lowStock.length})</span>
              </div>
              <div className="divide-y divide-border/50">
                {lowStock.map((item) => <InventoryRow key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* Normal stock */}
          {normalStock.length > 0 && (
            <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <span className="text-sm font-semibold text-foreground">{t("warehouse.allItems")} ({normalStock.length})</span>
              </div>
              <div className="divide-y divide-border/50">
                {normalStock.map((item) => <InventoryRow key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
