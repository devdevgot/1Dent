import { useState } from "react";
import { useGetActionLogs, useListUsers, useListPatients, useListInventory } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Activity, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

const ACTION_TYPES = ["CREATE", "UPDATE", "DELETE"];
const ENTITY_TYPES = ["patients", "procedures", "inventory", "users", "followups"];

function getLogDescription(
  log: any,
  t: any,
  userMap: Map<string, string>,
  patientMap: Map<string, string>,
  inventoryMap: Map<string, string>,
  users: any[]
): string {
  let details: any = null;
  try {
    if (log.details) details = JSON.parse(log.details);
  } catch {}
  const url = details?.url || "";

  const entityId = log.entityId || "";
  const shortId = entityId.slice(0, 8);

  const getPatientName = () => patientMap.get(entityId) || shortId || t("logs.unknownPatient", "пациент");
  const getStaffName = () => userMap.get(entityId) || shortId || t("logs.unknownUser", "сотрудник");
  const getItemName = () => inventoryMap.get(entityId) || shortId || t("logs.unknownItem", "товар");

  const actorUser = users.find((u) => u.id === log.userId);
  const actorRole = actorUser ? t(`role.${actorUser.role}`, actorUser.role) : "";
  const actorName = actorUser ? actorUser.name : t("logs.unknownUser", "Неизвестный сотрудник");
  const actor = actorRole ? `${actorRole} ${actorName}` : actorName;

  if (log.entityType === "patients") {
    const name = getPatientName();
    if (url.includes("/procedures")) {
      if (log.actionType === "CREATE") return t("logs.descriptions.patients.proceduresAdd", { actor, name, defaultValue: `${actor} добавил(а) процедуру в план лечения пациента ${name}` });
      if (log.actionType === "UPDATE") return t("logs.descriptions.patients.proceduresUpdate", { actor, name, defaultValue: `${actor} обновил(а) процедуру пациента ${name}` });
      if (log.actionType === "DELETE") return t("logs.descriptions.patients.proceduresDelete", { actor, name, defaultValue: `${actor} удалил(а) процедуру пациента ${name}` });
    }
    if (url.includes("/teeth")) {
      return t("logs.descriptions.patients.teethUpdate", { actor, name, defaultValue: `${actor} изменил(а) состояние зубов у пациента ${name}` });
    }
    if (url.includes("/treatment-plans") || url.includes("/active-treatment-plan")) {
      return t("logs.descriptions.patients.planUpdate", { actor, name, defaultValue: `${actor} обновил(а) план лечения пациента ${name}` });
    }
    if (url.includes("/contracts") || url.includes("/document-packages")) {
      return t("logs.descriptions.patients.contractCreate", { actor, name, defaultValue: `${actor} сформировал(а) пакет документов для пациента ${name}` });
    }

    if (log.actionType === "CREATE") return t("logs.descriptions.patients.create", { actor, name, defaultValue: `${actor} создал(а) карточку пациента ${name}` });
    if (log.actionType === "UPDATE") return t("logs.descriptions.patients.update", { actor, name, defaultValue: `${actor} обновил(а) данные пациента ${name}` });
    if (log.actionType === "DELETE") return t("logs.descriptions.patients.delete", { actor, name, defaultValue: `${actor} удалил(а) карточку пациента ${name}` });
  }

  if (log.entityType === "procedures") {
    if (log.actionType === "CREATE") return t("logs.descriptions.procedures.create", { actor, id: shortId, defaultValue: `${actor} добавил(а) новую процедуру (ID: ${shortId})` });
    if (log.actionType === "UPDATE") return t("logs.descriptions.procedures.update", { actor, id: shortId, defaultValue: `${actor} обновил(а) статус процедуры (ID: ${shortId})` });
    if (log.actionType === "DELETE") return t("logs.descriptions.procedures.delete", { actor, id: shortId, defaultValue: `${actor} удалил(а) процедуру (ID: ${shortId})` });
  }

  if (log.entityType === "inventory") {
    const name = getItemName();
    if (log.actionType === "CREATE") return t("logs.descriptions.inventory.create", { actor, name, defaultValue: `${actor} добавил(а) товар ${name} на склад` });
    if (log.actionType === "UPDATE") return t("logs.descriptions.inventory.update", { actor, name, defaultValue: `${actor} обновил(а) данные товара ${name} на складе` });
    if (log.actionType === "DELETE") return t("logs.descriptions.inventory.delete", { actor, name, defaultValue: `${actor} удалил(а) товар ${name} со склада` });
  }

  if (log.entityType === "users") {
    const name = getStaffName();
    if (log.actionType === "CREATE") return t("logs.descriptions.users.create", { actor, name, defaultValue: `${actor} пригласил(а) сотрудника ${name} в систему` });
    if (log.actionType === "UPDATE") return t("logs.descriptions.users.update", { actor, name, defaultValue: `${actor} обновил(а) профиль/права сотрудника ${name}` });
    if (log.actionType === "DELETE") return t("logs.descriptions.users.delete", { actor, name, defaultValue: `${actor} удалил(а) сотрудника ${name} из системы` });
  }

  if (log.entityType === "followups") {
    if (log.actionType === "CREATE") return t("logs.descriptions.followups.create", { actor, id: shortId, defaultValue: `${actor} запланировал(а) послеоперационный осмотр (ID: ${shortId})` });
    if (log.actionType === "UPDATE") return t("logs.descriptions.followups.update", { actor, id: shortId, defaultValue: `${actor} обновил(а) статус осмотра (ID: ${shortId})` });
    if (log.actionType === "DELETE") return t("logs.descriptions.followups.delete", { actor, id: shortId, defaultValue: `${actor} удалил(а) осмотр (ID: ${shortId})` });
  }

  return t("logs.descriptions.unknown", {
    actor,
    action: log.actionType,
    entity: log.entityType,
    defaultValue: `${actor} совершил(а) действие ${log.actionType} над объектом ${log.entityType}`
  });
}

export default function LogsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
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
  const { data: patientsData } = useListPatients();
  const { data: inventoryData } = useListInventory();

  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const users = usersData?.data?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const patients = patientsData?.data?.patients ?? [];
  const patientMap = new Map(patients.map((p) => [p.id, p.name]));

  const inventoryItems = inventoryData?.data?.items ?? [];
  const inventoryMap = new Map(inventoryItems.map((i) => [i.id, i.name]));

  const actionBadgeColor: Record<string, string> = {
    CREATE: "bg-green-50 text-green-700 border-green-200",
    UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
  };

  const actionBorderColor: Record<string, string> = {
    CREATE: "border-l-4 border-l-green-500",
    UPDATE: "border-l-4 border-l-blue-500",
    DELETE: "border-l-4 border-l-red-500",
  };

  function formatDate(d: string) {
    try { return format(new Date(d), "dd.MM.yyyy HH:mm:ss"); } catch { return d; }
  }

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button
          onClick={() => navigate("/menu")}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary shrink-0 animate-pulse" strokeWidth={1.8} />
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900 leading-tight">{t("logs.title")}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t("logs.subtitle", "Аудит всех изменений в системе")}</p>
          </div>
        </div>
      </div>

      <div className="p-4 pb-24 space-y-4 max-w-7xl mx-auto">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-border/50 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Filter className="w-4 h-4 text-primary" />
              {t("logs.filters")}
            </div>
            {(userId || actionType || entityType || dateFrom || dateTo) && (
              <button
                onClick={() => { setUserId(""); setActionType(""); setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1); }}
                className="text-xs font-semibold text-destructive hover:text-destructive/80 transition-colors"
              >
                {t("logs.clearFilters")}
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* User Filter */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {t("logs.filterUserLabel", "Сотрудник")}
              </label>
              <select
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setPage(1); }}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-700"
              >
                <option value="">{t("logs.allUsers")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Action Filter */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {t("logs.filterActionLabel", "Действие")}
              </label>
              <select
                value={actionType}
                onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-700"
              >
                <option value="">{t("logs.allActions")}</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {t(`logs.actions.${a}`, a === "CREATE" ? "Создано" : a === "UPDATE" ? "Изменено" : a === "DELETE" ? "Удалено" : a)}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Filter */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {t("logs.filterEntityLabel", "Объект")}
              </label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-700"
              >
                <option value="">{t("logs.allEntities")}</option>
                {ENTITY_TYPES.map((e) => (
                  <option key={e} value={e}>
                    {t(`logs.entities.${e}`, e === "patients" ? "Пациенты" : e === "procedures" ? "Процедуры" : e === "inventory" ? "Товары/Склад" : e === "users" ? "Сотрудники" : e === "followups" ? "Осмотры" : e)}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {t("logs.dateFrom")}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-700"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500">
                {t("logs.dateTo")}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-gray-700"
              />
            </div>
          </div>
        </div>

        {/* Audit List */}
        <div className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm font-semibold text-gray-700">
              {t("logs.total")}: <span className="text-primary font-bold">{total}</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs font-semibold text-gray-500 bg-white border border-slate-100 px-2.5 py-1 rounded-md shadow-sm">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span>{t("common.loading")}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              {t("logs.empty")}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`px-5 py-4 hover:bg-slate-50/60 transition-colors flex items-start gap-4 pl-6 ${
                    actionBorderColor[log.actionType] ?? "border-l-4 border-l-slate-300"
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-sm ${actionBadgeColor[log.actionType] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                        {t(`logs.actions.${log.actionType}`, log.actionType === "CREATE" ? "Создано" : log.actionType === "UPDATE" ? "Изменено" : log.actionType === "DELETE" ? "Удалено" : log.actionType)}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">{formatDate(log.createdAt)}</span>
                    </div>
                    
                    <p className="text-sm text-gray-800 font-medium leading-relaxed">
                      {getLogDescription(log, t, userMap, patientMap, inventoryMap, users)}
                    </p>
                    
                    {log.ipAddress && (
                      <div className="flex items-center text-xs text-gray-400">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          IP: {log.ipAddress}
                        </span>
                      </div>
                    )}
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
