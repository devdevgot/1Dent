import { useState } from "react";
import { useListInventory, useGetInventoryConsumption } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Package, AlertTriangle, TrendingDown, BarChart3 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

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
    materials:   "bg-[#e0f2fe] text-[#0284c7]",
    instruments: "bg-[#f0fdf4] text-[#16a34a]",
    medications: "bg-[#f0fdf4] text-[#16a34a]",
    consumables: "bg-[#fef3c7] text-[#d97706]",
    prosthetics: "bg-[#fef2f2] text-[#dc2626]",
    implants:    "bg-[#e0f2fe] text-[#0284c7]",
    other:       "bg-[#f1ede4] text-[#64748b]",
  };

  function stockBarWidth(qty: number, min: number): string {
    if (min === 0) return "100%";
    return `${Math.min(100, Math.round((qty / (min * 2)) * 100))}%`;
  }

  function stockBarColor(qty: number, min: number): string {
    if (min === 0 || qty > min * 1.5) return "bg-[#16a34a]";
    if (qty > min) return "bg-[#d97706]";
    return "bg-[#dc2626]";
  }

  const InventoryRow = ({ item }: { item: typeof items[number] }) => (
    <div className="px-4 py-3 hover:bg-[#faf8f4] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#0f172a] truncate">{item.name}</p>
            {(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-[#dc2626] shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[item.category ?? "other"] ?? categoryColors.other}`}>
              {t(`inventory.category.${item.category ?? "other"}`)}
            </span>
            <span className="text-xs text-[#64748b]">{item.unit}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 ? "text-[#dc2626]" : "text-[#0f172a]"}`}>
            {item.quantity ?? 0}
          </p>
          {(item.minQuantity ?? 0) > 0 && (
            <p className="text-xs text-[#64748b]">{t("warehouse.min")}: {item.minQuantity}</p>
          )}
        </div>
      </div>
      {(item.minQuantity ?? 0) > 0 && (
        <div className="w-full h-1.5 bg-[#f1ede4] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${stockBarColor(item.quantity ?? 0, item.minQuantity ?? 0)}`}
            style={{ width: stockBarWidth(item.quantity ?? 0, item.minQuantity ?? 0) }}
          />
        </div>
      )}
    </div>
  );

  return (
    <PageShell withTabBarOffset>
      <PageHeader
        title={t("warehouse.title")}
        icon={<Package className="w-5 h-5" strokeWidth={1.8} />}
        onBack={() => window.history.back()}
      />
      <div className="p-4 space-y-4 max-w-full">

      {/* Tabs */}
      <div className="flex bg-[#f1ede4] rounded-xl p-1 gap-1">
        {(["stock", "consumption"] as Tab[]).map((t_) => (
          <button
            key={t_}
            onClick={() => setTab(t_)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
              tab === t_ ? "bg-white text-[#0f172a] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
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
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[#0f172a]">{items.length}</p>
              <p className="text-xs text-[#64748b] mt-0.5">{t("warehouse.totalItems")}</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[#16a34a]">{normalStock.length}</p>
              <p className="text-xs text-[#64748b] mt-0.5">{t("warehouse.inStock")}</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[#dc2626]">{lowStock.length}</p>
              <p className="text-xs text-[#64748b] mt-0.5">{t("warehouse.lowStock")}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-8 text-center text-[#64748b] text-sm">
              {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-8 text-center text-[#64748b] text-sm">
              {t("warehouse.empty")}
            </div>
          ) : (
            <>
              {lowStock.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#fecaca] shadow-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#fecaca] flex items-center gap-2 bg-[#fef2f2]">
                    <TrendingDown className="w-4 h-4 text-[#dc2626]" />
                    <span className="text-sm font-semibold text-[#dc2626]">{t("warehouse.lowStockAlert")} ({lowStock.length})</span>
                  </div>
                  <div className="divide-y divide-[#e8e3d9]">
                    {lowStock.map((item) => <InventoryRow key={item.id} item={item} />)}
                  </div>
                </div>
              )}
              {normalStock.length > 0 && (
                <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#e8e3d9]">
                    <span className="text-sm font-semibold text-[#0f172a]">{t("warehouse.allItems")} ({normalStock.length})</span>
                  </div>
                  <div className="divide-y divide-[#e8e3d9]">
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
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-[#e8e3d9] bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-[#e8e3d9] bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            />
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-[#d97706]" />
              <span className="text-xs font-semibold text-[#64748b]">{t("warehouse.totalConsumptionCost")}</span>
            </div>
            <p className="text-xl font-bold text-[#0f172a]">{totalConsumptionCost.toLocaleString("ru-RU")} ₸</p>
            <p className="text-xs text-[#64748b] mt-0.5">{consumption.length} {t("warehouse.itemsUsed")}</p>
          </div>

          {consumptionLoading ? (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-8 text-center text-[#64748b] text-sm">
              {t("common.loading")}
            </div>
          ) : consumption.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-8 text-center text-[#64748b] text-sm">
              {t("warehouse.consumptionEmpty")}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#e8e3d9] shadow-md overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e8e3d9]">
                <span className="text-sm font-semibold text-[#0f172a]">{t("warehouse.consumptionByItem")}</span>
              </div>
              <div className="divide-y divide-[#e8e3d9]">
                {consumption.map((row) => (
                  <div key={row.itemId} className="px-4 py-3 hover:bg-[#faf8f4] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0f172a] truncate">{row.itemName}</p>
                        <p className="text-xs text-[#64748b] mt-0.5">
                          {row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("warehouse.procedures")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-[#0f172a]">
                          {(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸
                        </p>
                        {row.unitPrice && (
                          <p className="text-xs text-[#94a3b8]">{row.unitPrice.toLocaleString("ru-RU")} ₸/{row.unit ?? "ед."}</p>
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
    </PageShell>
  );
}
