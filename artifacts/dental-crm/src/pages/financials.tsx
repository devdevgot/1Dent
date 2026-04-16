import { useState } from "react";
import { useListProcedures, useListUsers, useGetInventoryConsumption } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Wallet, TrendingUp, TrendingDown, Package, ChevronLeft } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function FinancialsPage() {
  const { t } = useTranslation();
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("completed");

  const today = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  const { data: proceduresData, isLoading } = useListProcedures();
  const { data: usersData } = useListUsers();
  const { data: consumptionData } = useGetInventoryConsumption({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const users = usersData?.data?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const consumption = consumptionData?.data?.consumption ?? [];

  const filtered = allProcedures.filter((p) => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterDoctor && p.doctorId !== filterDoctor) return false;
    const pDate = p.completedAt ?? p.scheduledAt;
    if (dateFrom && pDate && pDate < dateFrom) return false;
    if (dateTo && pDate && pDate > dateTo + "T23:59:59") return false;
    return true;
  });

  const totalRevenue = filtered.reduce((acc, p) => acc + (p.price ?? 0), 0);
  const totalMaterialCost = consumption.reduce((a, r) => a + (r.totalCost ?? 0), 0);
  const grossMargin = totalRevenue - totalMaterialCost;
  const marginPct = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 100) : 0;

  const revenueByDoctor: Record<string, { name: string; total: number; count: number }> = {};
  for (const p of filtered) {
    const doctorId = p.doctorId ?? "unassigned";
    const name = (p.doctorId && userMap.get(p.doctorId)) ?? t("financials.unassigned");
    if (!revenueByDoctor[doctorId]) {
      revenueByDoctor[doctorId] = { name, total: 0, count: 0 };
    }
    revenueByDoctor[doctorId]!.total += p.price ?? 0;
    revenueByDoctor[doctorId]!.count += 1;
  }

  const doctors = users.filter((u) => u.role === "doctor");

  function formatDate(d: string | null | undefined) {
    if (!d) return "—";
    try { return format(new Date(d), "dd.MM.yyyy"); } catch { return d; }
  }

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
          <Wallet className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900">{t("financials.title")}</h1>
        </div>
      </div>
      <div className="p-4 pb-24 space-y-4 max-w-full">

      {/* Date range */}
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.totalRevenue")}</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalRevenue.toLocaleString("ru-RU")} ₸</p>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("financials.procedures")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.avgCheck")}</span>
          </div>
          <p className="text-xl font-bold text-foreground">
            {filtered.length > 0 ? Math.round(totalRevenue / filtered.length).toLocaleString("ru-RU") : 0} ₸
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("financials.perProcedure")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.materialCost")}</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalMaterialCost.toLocaleString("ru-RU")} ₸</p>
          <p className="text-xs text-muted-foreground mt-0.5">{consumption.length} {t("financials.materials")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className={`w-4 h-4 ${grossMargin >= 0 ? "text-emerald-600" : "text-red-500"}`} />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.grossMargin")}</span>
          </div>
          <p className={`text-xl font-bold ${grossMargin >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {grossMargin.toLocaleString("ru-RU")} ₸
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{marginPct}%</p>
        </div>
      </div>

      {/* Material consumption breakdown */}
      {consumption.length > 0 && (
        <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50">
            <span className="text-sm font-semibold text-foreground">{t("financials.materialsBreakdown")}</span>
          </div>
          <div className="divide-y divide-border/50">
            {consumption.slice(0, 5).map((row) => (
              <div key={row.itemId} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{row.itemName}</p>
                  <p className="text-xs text-muted-foreground">{row.totalQuantity} {row.unit ?? "ед."} · {row.procedureCount} {t("financials.proceduresPcs")}</p>
                </div>
                <p className="text-sm font-semibold text-amber-700 shrink-0">
                  {(row.totalCost ?? 0).toLocaleString("ru-RU")} ₸
                </p>
              </div>
            ))}
            {consumption.length > 5 && (
              <div className="px-4 py-2 text-xs text-center text-muted-foreground">
                +{consumption.length - 5} {t("financials.moreItems")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revenue by doctor */}
      {Object.values(revenueByDoctor).length > 0 && (
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("financials.byDoctor")}</h3>
          <div className="space-y-2">
            {Object.values(revenueByDoctor)
              .sort((a, b) => b.total - a.total)
              .map((row) => (
                <div key={row.name} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">{row.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{row.count} {t("financials.pcs")}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">
                    {row.total.toLocaleString("ru-RU")} ₸
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters for procedure list */}
      <div className="flex gap-2">
        <select
          value={filterDoctor}
          onChange={(e) => setFilterDoctor(e.target.value)}
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t("financials.allDoctors")}</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t("financials.allStatuses")}</option>
          <option value="completed">{t("financials.completed")}</option>
          <option value="scheduled">{t("financials.scheduled")}</option>
          <option value="in_progress">{t("financials.inProgress")}</option>
          <option value="cancelled">{t("financials.cancelled")}</option>
        </select>
      </div>

      {/* Procedures list */}
      <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold text-foreground">{t("financials.proceduresList")}</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("financials.empty")}</div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.doctorId ? (userMap.get(p.doctorId) ?? t("financials.unassigned")) : t("financials.unassigned")}
                      {" · "}
                      {p.completedAt ? formatDate(p.completedAt) : formatDate(p.scheduledAt)}
                    </p>
                    {p.materials && p.materials.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.materials.map((m) => (
                          <span
                            key={m.itemId}
                            className="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-1.5 py-0.5"
                          >
                            {m.itemName} ×{m.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {(p.price ?? 0).toLocaleString("ru-RU")} ₸
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      p.status === "completed" ? "text-emerald-600" :
                      p.status === "cancelled" ? "text-destructive" :
                      p.status === "in_progress" ? "text-blue-600" : "text-amber-600"
                    }`}>
                      {t(`procedures.status.${p.status}`)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
