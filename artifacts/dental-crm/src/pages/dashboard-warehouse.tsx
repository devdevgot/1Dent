import { useAuthStore } from "@/hooks/use-auth";
import { useListInventory, useListProcedures } from "@workspace/api-client-react";
import {
  Package, AlertTriangle, RefreshCw, TrendingDown, Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

export default function WarehouseDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  const { data: inventoryData, isLoading, refetch } = useListInventory();
  const { data: proceduresData } = useListProcedures();

  const items = inventoryData?.data?.items ?? [];
  const lowStockItems = items.filter((item) => item.quantity <= item.minQuantity);
  const totalValue = items.reduce((acc, item) => acc + (item.unitPrice ?? 0) * item.quantity, 0);

  const procedures = proceduresData?.data?.procedures ?? [];
  const recentCompleted = procedures
    .filter((p) => p.status === "completed" && p.completedAt)
    .sort((a, b) => {
      const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return db - da;
    })
    .slice(0, 8);

  return (
    <div className="space-y-4 p-4 pb-8 bg-[#faf8f4] font-manrope min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-sm">
        <div>
          <h2 className="text-3xl font-display font-bold text-[#0f172a]">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="text-[#64748b] mt-1 text-lg">
            {t("warehouseDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="p-2.5 border border-[#e8e3d9] rounded-xl text-[#64748b] hover:bg-[#f1ede4] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate("/inventory")}
            className="px-5 py-2.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-semibold rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            {t("warehouseDashboard.goToInventory")}
          </button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#fef3c7] border-2 border-[#fef3c7] rounded-2xl p-5 flex items-start sm:items-center gap-4"
        >
          <div className="bg-[#d97706] text-white p-2.5 rounded-xl shrink-0 shadow-md">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#d97706]">
              {t("warehouseDashboard.lowStockAlert", { count: lowStockItems.length })}
            </h3>
            <p className="text-[#d97706] font-medium mt-0.5">{t("warehouseDashboard.lowStockDesc")}</p>
          </div>
          <button
            onClick={() => navigate("/inventory")}
            className="mt-3 sm:mt-0 sm:ml-auto px-4 py-2 bg-white text-[#d97706] font-bold rounded-xl border border-[#d97706]/30 hover:bg-[#fef3c7] transition-colors"
          >
            {t("warehouseDashboard.review")}
          </button>
        </motion.div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md"
        >
          <div className="p-3 bg-[#f1ede4] text-[#1f75fe] rounded-xl ring-1 ring-[#e8e3d9]/50 w-fit mb-4">
            <Package className="w-6 h-6" />
          </div>
          <p className="text-[#64748b] text-sm font-medium mb-1">{t("warehouseDashboard.totalItems")}</p>
          <p className="text-3xl font-display font-bold text-[#0f172a]">{isLoading ? "—" : items.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md"
        >
          <div className="p-3 bg-[#fef3c7] text-[#d97706] rounded-xl ring-1 ring-[#fef3c7]/50 w-fit mb-4">
            <TrendingDown className="w-6 h-6" />
          </div>
          <p className="text-[#64748b] text-sm font-medium mb-1">{t("warehouseDashboard.lowStock")}</p>
          <p className="text-3xl font-display font-bold text-[#0f172a]">{isLoading ? "—" : lowStockItems.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-md"
        >
          <div className="p-3 bg-[#f0fdf4] text-[#16a34a] rounded-xl ring-1 ring-[#f0fdf4]/50 w-fit mb-4">
            <Activity className="w-6 h-6" />
          </div>
          <p className="text-[#64748b] text-sm font-medium mb-1">{t("warehouseDashboard.totalValue")}</p>
          <p className="text-2xl font-display font-bold text-[#0f172a]">
            {isLoading ? "—" : `₸ ${totalValue.toLocaleString("ru-KZ")}`}
          </p>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold font-display flex items-center gap-2 text-[#0f172a]">
              <Package className="w-5 h-5 text-[#1f75fe]" />
              {t("warehouseDashboard.inventoryTitle")}
            </h3>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-[#f1ede4] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-[#94a3b8]/30 mx-auto mb-3" />
              <p className="text-[#64748b] font-medium">{t("warehouseDashboard.emptyInventory")}</p>
              <button
                onClick={() => navigate("/inventory")}
                className="mt-4 px-4 py-2 bg-[#1f75fe] hover:bg-[#1a65e8] text-white text-sm font-semibold rounded-full transition-all hover:scale-105 active:scale-95"
              >
                {t("warehouseDashboard.addItem")}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e3d9]">
                    <th className="text-left pb-3 font-semibold text-[#64748b] uppercase text-xs tracking-wide">{t("warehouseDashboard.colName")}</th>
                    <th className="text-right pb-3 font-semibold text-[#64748b] uppercase text-xs tracking-wide">{t("warehouseDashboard.colQty")}</th>
                    <th className="text-right pb-3 font-semibold text-[#64748b] uppercase text-xs tracking-wide">{t("warehouseDashboard.colMin")}</th>
                    <th className="text-right pb-3 font-semibold text-[#64748b] uppercase text-xs tracking-wide">{t("warehouseDashboard.colStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e3d9]">
                  {items.map((item, i) => {
                    const isLow = item.quantity <= item.minQuantity;
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`hover:bg-[#faf8f4] transition-colors ${isLow ? "bg-[#fef3c7]/30" : ""}`}
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {isLow && <span className="w-2 h-2 rounded-full bg-[#d97706] flex-none" />}
                            <span className="font-medium text-[#0f172a]">{item.name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-semibold text-[#0f172a]">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-3 text-right text-[#64748b]">
                          {item.minQuantity} {item.unit}
                        </td>
                        <td className="py-3 text-right">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#d97706]">
                              <TrendingDown className="w-3 h-3" />
                              {t("inventory.low")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a]">
                              OK
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Write-offs (completed procedures) */}
        <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <h3 className="text-lg font-bold font-display mb-5 flex items-center gap-2 text-[#0f172a]">
            <Activity className="w-5 h-5 text-[#1f75fe]" />
            {t("warehouseDashboard.recentWriteoffs")}
          </h3>
          {recentCompleted.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-10 h-10 text-[#94a3b8]/30 mx-auto mb-3" />
              <p className="text-[#64748b] text-sm font-medium">{t("warehouseDashboard.noWriteoffs")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCompleted.map((proc, i) => {
                const dateStr = proc.completedAt
                  ? new Date(proc.completedAt).toLocaleDateString("ru-KZ", { month: "short", day: "numeric" })
                  : "—";
                return (
                  <motion.div
                    key={proc.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 py-2 border-b border-[#e8e3d9] last:border-b-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#1f75fe] mt-1.5 flex-none" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0f172a] truncate">{proc.name}</p>
                      <p className="text-xs text-[#64748b]">{proc.doctorName ?? "—"}</p>
                    </div>
                    <span className="text-xs text-[#94a3b8] flex-none">{dateStr}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
