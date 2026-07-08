import { useState } from "react";
import { useListInventory, useGetInventoryConsumption } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Package, AlertTriangle, TrendingDown, BarChart3 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ListRowsSkeleton, Bone, SkeletonCard } from "@/components/skeletons";

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
    instruments: "bg-[#f0fdf4] text-[var(--success)]",
    medications: "bg-[#f0fdf4] text-[var(--success)]",
    consumables: "bg-[#fef3c7] text-[var(--warning)]",
    prosthetics: "bg-[#fef2f2] text-[var(--danger)]",
    implants:    "bg-[#e0f2fe] text-[#0284c7]",
    other:       "bg-[var(--surface-2)] text-[var(--text-secondary)]",
  };

  function stockBarWidth(qty: number, min: number): string {
    if (min === 0) return "100%";
    return `${Math.min(100, Math.round((qty / (min * 2)) * 100))}%`;
  }

  function stockBarColor(qty: number, min: number): string {
    if (min === 0 || qty > min * 1.5) return "bg-[var(--success)]";
    if (qty > min) return "bg-[var(--warning)]";
    return "bg-[var(--danger)]";
  }

  const InventoryRow = ({ item }: { item: typeof items[number] }) => (
    <div className="px-4 py-3 hover:bg-[var(--bg)] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-body font-medium text-[var(--text)] truncate">{item.name}</p>
            {(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger)] shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-caption px-1.5 py-0.5 rounded-full font-medium ${categoryColors[item.category ?? "other"] ?? categoryColors.other}`}>
              {t(`category.${item.category ?? "other"}`)}
            </span>
            <span className="text-caption text-[var(--text-secondary)]">{item.unit}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-body font-bold ${(item.quantity ?? 0) <= (item.minQuantity ?? 0) && (item.minQuantity ?? 0) > 0 ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
            {item.quantity ?? 0}
          </p>
          {(item.minQuantity ?? 0) > 0 && (
            <p className="text-caption text-[var(--text-secondary)]">{t("warehouse.min")}: {item.minQuantity}</p>
          )}
        </div>
      </div>
      {(item.minQuantity ?? 0) > 0 && (
        <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
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
      <div className="flex bg-[var(--surface-2)] rounded-xl p-1 gap-1">
        {(["stock", "consumption"] as Tab[]).map((t_) => (
          <button
            key={t_}
            onClick={() => setTab(t_)}
            className={`flex-1 py-2 text-body font-semibold rounded-xl transition-colors ${
              tab === t_ ? "bg-[var(--ds-surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text)]"
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
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} className="p-3 text-center">
                  <Bone className="h-7 w-10 rounded mx-auto mb-1" />
                  <Bone className="h-3 w-16 rounded mx-auto" />
                </SkeletonCard>
              ))
            ) : (
              <>
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[var(--text)]">{items.length}</p>
              <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t("warehouse.totalItems")}</p>
            </div>
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[var(--success)]">{normalStock.length}</p>
              <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t("warehouse.inStock")}</p>
            </div>
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-3 text-center">
              <p className="text-xl font-bold text-[var(--danger)]">{lowStock.length}</p>
              <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t("warehouse.lowStock")}</p>
            </div>
              </>
            )}
          </div>

          {isLoading ? (
            <ListRowsSkeleton rows={5} avatar={false} card />
          ) : items.length === 0 ? (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-8 text-center text-[var(--text-secondary)] text-sm">
              {t("warehouse.empty")}
            </div>
          ) : (
            <>
              {lowStock.length > 0 && (
                <div className="bg-[var(--ds-surface)] rounded-2xl border border-[#fecaca] shadow-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#fecaca] flex items-center gap-2 bg-[#fef2f2]">
                    <TrendingDown className="w-4 h-4 text-[var(--danger)]" />
                    <span className="text-body font-semibold text-[var(--danger)]">{t("warehouse.lowStockAlert")} ({lowStock.length})</span>
                  </div>
                  <div className="divide-y divide-[#e8e3d9]">
                    {lowStock.map((item) => <InventoryRow key={item.id} item={item} />)}
                  </div>
                </div>
              )}
              {normalStock.length > 0 && (
                <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--ds-border)]">
                    <span className="text-body font-semibold text-[var(--text)]">{t("warehouse.allItems")} ({normalStock.length})</span>
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
              className="flex-1 text-body px-3 py-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 text-body px-3 py-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/20 focus:border-[#1f75fe]"
            />
          </div>

          {/* Summary */}
          <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-[var(--warning)]" />
              <span className="text-caption font-semibold text-[var(--text-secondary)]">{t("warehouse.totalConsumptionCost")}</span>
            </div>
            <p className="text-xl font-bold text-[var(--text)]">{totalConsumptionCost.toLocaleString("ru-RU")} ₸</p>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">{consumption.length} {t("warehouse.itemsUsed")}</p>
          </div>

          {consumptionLoading ? (
            <ListRowsSkeleton rows={4} avatar={false} card />
          ) : consumption.length === 0 ? (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md p-8 text-center text-[var(--text-secondary)] text-sm">
              {t("warehouse.consumptionEmpty")}
            </div>
          ) : (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--ds-border)]">
                <span className="text-body font-semibold text-[var(--text)]">{t("warehouse.consumptionByItem")}</span>
              </div>
              <div className="divide-y divide-[#e8e3d9]">
                {consumption.map((row) => (
                  <div key={row.itemId} className="px-4 py-3 hover:bg-[var(--bg)] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium text-[var(--text)] truncate">{row.itemName}</p>
                        <p className="text-caption text-[var(--text-secondary)] mt-0.5">
                          {row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("warehouse.procedures")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-body font-semibold text-[var(--text)]">
                          {(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸
                        </p>
                        {row.unitPrice && (
                          <p className="text-caption text-[var(--text-subtle)]">{row.unitPrice.toLocaleString("ru-RU")} ₸/{row.unit ?? "ед."}</p>
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
