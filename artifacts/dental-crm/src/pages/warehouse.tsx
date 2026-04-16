import { useState } from "react";
import { useListInventory, useGetInventoryConsumption } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Package, AlertTriangle, TrendingDown, BarChart3, ChevronLeft } from "lucide-react";

type Tab = "stock" | "consumption";

export default function WarehousePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("stock");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useListInventory();
  const { data: consumptionData, isLoading: consumptionLoading } = useGetInventoryConsumption({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const items = data?.data?.items ?? [];
  const consumption = consumptionData?.data?.consumption ?? [];

  const lowStock = items.filter((i) => (i.quantity ?? 0) <= (i.minQuantity ?? 0) && (i.minQuantity ?? 0) > 0);
  const normalStock = items.filter((i) => (i.quantity ?? 0) > (i.minQuantity ?? 0) || (i.minQuantity ?? 0) === 0);

  const totalConsumptionCost = consumption.reduce((a, r) => a + (r.totalCost ?? 0), 0);

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
    return `${Math.min(100, Math.round((qty / (min * 2)) * 100))}%`;
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
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900">{t("warehouse.title")}</h1>
        </div>
      </div>
      <div className="p-4 pb-24 space-y-4 max-w-full">

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {(["stock", "consumption"] as Tab[]).map((t_) => (
          <button
            key={t_}
            onClick={() => setTab(t_)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === t_ ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`warehouse.tab.${t_}`)}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
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
        </>
      )}

      {tab === "consumption" && (
        <>
          {/* Date filters */}
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-muted-foreground">{t("warehouse.totalConsumptionCost")}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{totalConsumptionCost.toLocaleString("ru-RU")} ₸</p>
            <p className="text-xs text-muted-foreground mt-0.5">{consumption.length} {t("warehouse.itemsUsed")}</p>
          </div>

          {consumptionLoading ? (
            <div className="bg-white rounded-2xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
              {t("common.loading")}
            </div>
          ) : consumption.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
              {t("warehouse.consumptionEmpty")}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <span className="text-sm font-semibold text-foreground">{t("warehouse.consumptionByItem")}</span>
              </div>
              <div className="divide-y divide-border/50">
                {consumption.map((row) => (
                  <div key={row.itemId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{row.itemName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("warehouse.procedures")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          {(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸
                        </p>
                        {row.unitPrice && (
                          <p className="text-xs text-muted-foreground">{row.unitPrice.toLocaleString("ru-RU")} ₸/{row.unit ?? "ед."}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
