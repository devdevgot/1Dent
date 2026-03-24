import { useState } from "react";
import { useListProcedures, useListUsers } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Wallet, TrendingUp } from "lucide-react";
import { format } from "date-fns";

export default function FinancialsPage() {
  const { t } = useTranslation();
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterStatus, setFilterStatus] = useState("completed");

  const { data: proceduresData, isLoading } = useListProcedures();
  const { data: usersData } = useListUsers();

  const allProcedures = proceduresData?.data?.procedures ?? [];
  const users = usersData?.data?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const filtered = allProcedures.filter((p) => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterDoctor && p.doctorId !== filterDoctor) return false;
    return true;
  });

  const totalRevenue = filtered.reduce((acc, p) => acc + (p.price ?? 0), 0);

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
    <div className="p-4 pb-24 space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">{t("financials.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("financials.subtitle")}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.totalRevenue")}</span>
          </div>
          <p className="text-xl font-bold text-foreground">
            {totalRevenue.toLocaleString("ru-RU")} ₸
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("financials.procedures")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-muted-foreground">{t("financials.avgCheck")}</span>
          </div>
          <p className="text-xl font-bold text-foreground">
            {filtered.length > 0
              ? Math.round(totalRevenue / filtered.length).toLocaleString("ru-RU")
              : 0} ₸
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("financials.perProcedure")}</p>
        </div>
      </div>

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

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={filterDoctor}
          onChange={(e) => setFilterDoctor(e.target.value)}
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t("financials.allDoctors")}</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
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
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {(p.price ?? 0).toLocaleString("ru-RU")} ₸
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      p.status === "completed" ? "text-emerald-600" :
                      p.status === "cancelled" ? "text-destructive" :
                      p.status === "in_progress" ? "text-blue-600" :
                      "text-amber-600"
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
  );
}
