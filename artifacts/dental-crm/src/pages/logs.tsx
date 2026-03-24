import { useState } from "react";
import { useGetActionLogs, useListUsers } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Activity, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { format } from "date-fns";

const ACTION_TYPES = ["CREATE", "UPDATE", "DELETE"];
const ENTITY_TYPES = ["patients", "procedures", "inventory", "users", "followups"];

export default function LogsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [actionType, setActionType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const LIMIT = 50;

  const { data, isLoading } = useGetActionLogs({
    userId: userId || undefined,
    actionType: actionType || undefined,
    entityType: entityType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: LIMIT,
  });

  const { data: usersData } = useListUsers();

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const users = usersData?.data?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const actionBadgeColor: Record<string, string> = {
    CREATE: "bg-green-50 text-green-700 border-green-200",
    UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
  };

  function formatDate(d: string) {
    try { return format(new Date(d), "dd.MM.yyyy HH:mm:ss"); } catch { return d; }
  }

  return (
    <div className="p-4 pb-24 space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">{t("logs.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("logs.subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
          <Filter className="w-4 h-4" />
          {t("logs.filters")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            className="text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("logs.allUsers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <select
            value={actionType}
            onChange={(e) => { setActionType(e.target.value); setPage(1); }}
            className="text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("logs.allActions")}</option>
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("logs.allEntities")}</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t("logs.dateFrom")}
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-sm px-3 py-2 rounded-xl border border-border/50 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary col-span-1"
            placeholder={t("logs.dateTo")}
          />

          {(userId || actionType || entityType || dateFrom || dateTo) && (
            <button
              onClick={() => { setUserId(""); setActionType(""); setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              className="text-sm px-3 py-2 rounded-xl border border-destructive/30 text-destructive bg-red-50 hover:bg-red-100 transition-colors"
            >
              {t("logs.clearFilters")}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {t("logs.total")}: <span className="text-primary">{total}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t("logs.empty")}</div>
        ) : (
          <div className="divide-y divide-border/50">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${actionBadgeColor[log.actionType] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                      {log.actionType}
                    </span>
                    <span className="text-sm text-foreground font-medium truncate">
                      {log.entityType}
                      {log.entityId && <span className="text-muted-foreground font-normal"> #{log.entityId.slice(0, 8)}</span>}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(log.createdAt)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{log.userId ? (userMap.get(log.userId) ?? log.userId.slice(0, 8)) : t("logs.unknownUser")}</span>
                  {log.ipAddress && <span className="text-border">•</span>}
                  {log.ipAddress && <span>{log.ipAddress}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
