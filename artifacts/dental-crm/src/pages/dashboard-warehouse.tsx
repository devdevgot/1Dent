import { useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { useListInventory, useListProcedures } from "@workspace/api-client-react";
import {
  Package, AlertTriangle, RefreshCw, TrendingDown, Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

export default function WarehouseDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = SITE.dashboardTitles.warehouse;
  }, []);

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
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner dash-stack">
        <div className="dash-page-header">
          <div>
            <h2 className="dash-page-title">
              {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
            </h2>
            <p className="dash-page-subtitle">
              {t("warehouseDashboard.subtitle", { clinic: clinic?.name })}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              aria-label={t("common.refresh", "Обновить")}
              onClick={() => refetch()}
              className="dash-btn-icon"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory")}
              className="dash-btn dash-btn-primary"
            >
              <Package className="w-4 h-4" />
              {t("warehouseDashboard.goToInventory")}
            </button>
          </div>
        </div>

        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="dash-alert-warning flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <div className="bg-[var(--warning)] text-white p-2.5 rounded-xl shrink-0 shadow-sm">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-[var(--warning)]">
                {t("warehouseDashboard.lowStockAlert", { count: lowStockItems.length })}
              </h3>
              <p className="text-[var(--warning)] font-medium mt-0.5 opacity-90">{t("warehouseDashboard.lowStockDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/inventory")}
              className="dash-btn dash-btn-secondary shrink-0"
            >
              {t("warehouseDashboard.review")}
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Package, label: t("warehouseDashboard.totalItems"), value: isLoading ? "—" : items.length, delay: 0, iconBg: "bg-[var(--surface-2)] text-[var(--ds-primary)]" },
            { icon: TrendingDown, label: t("warehouseDashboard.lowStock"), value: isLoading ? "—" : lowStockItems.length, delay: 0.05, iconBg: "bg-[var(--warning-light)] text-[var(--warning)]" },
            { icon: Activity, label: t("warehouseDashboard.totalValue"), value: isLoading ? "—" : `₸ ${totalValue.toLocaleString("ru-KZ")}`, delay: 0.1, iconBg: "bg-[var(--success-light)] text-[var(--success)]", small: true },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stat.delay }}
              className="dash-stat-card"
            >
              <div className={`dash-stat-icon mb-4 ${stat.iconBg}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <p className="dash-stat-label">{stat.label}</p>
              <p className={stat.small ? "text-2xl dash-stat-value" : "dash-stat-value"}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated">
            <div className="flex items-center justify-between mb-6">
              <h3 className="dash-section-title">
                <Package className="w-5 h-5 text-[var(--ds-primary)]" />
                {t("warehouseDashboard.inventoryTitle")}
              </h3>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="dash-skeleton h-12 rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-[var(--text-subtle)]/30 mx-auto mb-3" />
                <p className="text-[var(--text-secondary)] font-medium">{t("warehouseDashboard.emptyInventory")}</p>
                <button
                  type="button"
                  onClick={() => navigate("/inventory")}
                  className="dash-btn dash-btn-primary mt-4"
                >
                  {t("warehouseDashboard.addItem")}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-sm">
                  <thead>
                    <tr>
                      <th>{t("warehouseDashboard.colName")}</th>
                      <th className="text-right">{t("warehouseDashboard.colQty")}</th>
                      <th className="text-right">{t("warehouseDashboard.colMin")}</th>
                      <th className="text-right">{t("warehouseDashboard.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ds-border)]">
                    {items.map((item, i) => {
                      const isLow = item.quantity <= item.minQuantity;
                      return (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={isLow ? "bg-[var(--warning-light)]/40" : ""}
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              {isLow && <span className="w-2 h-2 rounded-full bg-[var(--warning)] flex-none" />}
                              <span className="font-medium text-[var(--text)]">{item.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-semibold text-[var(--text)]">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-3 text-right text-[var(--text-secondary)]">
                            {item.minQuantity} {item.unit}
                          </td>
                          <td className="py-3 text-right">
                            {isLow ? (
                              <span className="dash-badge dash-badge-warning inline-flex items-center gap-1">
                                <TrendingDown className="w-3 h-3" />
                                {t("inventory.low")}
                              </span>
                            ) : (
                              <span className="dash-badge dash-badge-success">OK</span>
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

          <div className="dash-card dash-card-padded dash-card-elevated">
            <h3 className="dash-section-title mb-5">
              <Activity className="w-5 h-5 text-[var(--ds-primary)]" />
              {t("warehouseDashboard.recentWriteoffs")}
            </h3>
            {recentCompleted.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-[var(--text-subtle)]/30 mx-auto mb-3" />
                <p className="text-[var(--text-secondary)] text-sm font-medium">{t("warehouseDashboard.noWriteoffs")}</p>
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
                      className="flex items-start gap-3 py-2 border-b border-[var(--ds-border)] last:border-b-0"
                    >
                      <div className="w-2 h-2 rounded-full bg-[var(--ds-primary)] mt-1.5 flex-none" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{proc.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{proc.doctorName ?? "—"}</p>
                      </div>
                      <span className="text-xs text-[var(--text-subtle)] flex-none">{dateStr}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
