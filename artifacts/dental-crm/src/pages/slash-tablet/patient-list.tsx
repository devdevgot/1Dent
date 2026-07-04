import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Clock, ChevronRight, CalendarDays, Users, Plus,
  RefreshCw, SlidersHorizontal,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPatients,
  useListProcedures,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import type { Patient, PatientStatus, PatientSource, Procedure } from "@workspace/api-client-react";
import { calculateAge } from "@workspace/api-zod";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { usePatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { PatientTreatmentProgressBar } from "@/components/kanban/patient-treatment-progress-bar";
import { KANBAN_COLUMNS, COLUMN_HEADER_COLOR } from "@/lib/patient-utils";
import { initials } from "./mock-data";

const ALL_SOURCES: PatientSource[] = [
  "instagram", "referral", "walk_in", "website", "whatsapp", "other",
];

type DateFilter = "today" | "week" | "month" | "all";

function formatTime(d: Date) {
  return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function PatientList({ onSelect }: { onSelect: (patientId: string) => void }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<PatientSource | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });
  const { data: proceduresData } = useListProcedures();
  const { data: progressMap } = usePatientTreatmentProgress();

  const allPatients: Patient[] = data?.data?.patients ?? [];
  const procedures = proceduresData?.data?.procedures ?? [];

  const todayProcedures = useMemo(() => {
    const now = new Date();
    const map = new Map<string, Procedure[]>();
    for (const proc of procedures) {
      if (!proc.patientId || !proc.scheduledAt) continue;
      const at = new Date(proc.scheduledAt);
      if (!isSameDay(at, now)) continue;
      const list = map.get(proc.patientId) ?? [];
      list.push(proc);
      map.set(proc.patientId, list);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
      map.set(id, list);
    }
    return map;
  }, [procedures]);

  const dateFilterFn = useMemo(() => {
    if (dateFilter === "all") return () => true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (dateFilter === "today") return (p: Patient) => p.createdAt.slice(0, 10) === todayStr;
    if (dateFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return (p: Patient) => new Date(p.createdAt) >= weekAgo;
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return (p: Patient) => new Date(p.createdAt) >= monthStart;
  }, [dateFilter]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<PatientStatus, number>> = {};
    allPatients.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return counts;
  }, [allPatients]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allPatients
      .filter((p) => {
        if (!dateFilterFn(p)) return false;
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
        if (q && !p.name.toLowerCase().includes(q) && !p.phone.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aProc = todayProcedures.get(a.id)?.[0];
        const bProc = todayProcedures.get(b.id)?.[0];
        if (aProc?.scheduledAt && bProc?.scheduledAt) {
          return new Date(aProc.scheduledAt).getTime() - new Date(bProc.scheduledAt).getTime();
        }
        if (aProc?.scheduledAt) return -1;
        if (bProc?.scheduledAt) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [allPatients, query, statusFilter, sourceFilter, dateFilterFn, todayProcedures]);

  const now = new Date();
  const todayLabel = now.toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" });
  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";
  const hasActiveFilter = statusFilter !== "all" || sourceFilter !== "all" || dateFilter !== "all";

  const DATE_OPTIONS: { key: DateFilter; label: string }[] = [
    { key: "today", label: "Сегодня" },
    { key: "week", label: "Неделя" },
    { key: "month", label: "Месяц" },
    { key: "all", label: "Все" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[#0f172a]">
            <Users className="h-6 w-6 text-[#1f75fe]" /> Пациенты
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm capitalize text-[#64748b]">
            <CalendarDays className="h-4 w-4" /> {todayLabel} · {filtered.length} из {allPatients.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e8e3d9] bg-white text-[#64748b] transition-colors hover:bg-[#faf8f4] disabled:opacity-50"
            title={t("kanban.refresh")}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl border bg-white transition-colors",
              showFilters || hasActiveFilter
                ? "border-[#1f75fe] text-[#1f75fe] bg-[#1f75fe]/5"
                : "border-[#e8e3d9] text-[#64748b] hover:bg-[#faf8f4]",
            )}
            title="Фильтры"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-[#1f75fe] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#1a65e8]"
            >
              <Plus className="h-4 w-4" /> Новый
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94a3b8]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("patients.searchPlaceholder")}
          className="w-full rounded-2xl border border-[#e8e3d9] bg-white py-4 pl-12 pr-4 text-base text-[#0f172a] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#1f75fe]"
        />
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="space-y-3 rounded-2xl border border-[#e8e3d9] bg-white p-4">
              <div className="flex flex-wrap gap-2">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDateFilter(opt.key)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                      dateFilter === opt.key
                        ? "bg-[#1f75fe] text-white"
                        : "border border-[#e8e3d9] bg-[#faf8f4] text-[#64748b]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PatientStatus | "all")}
                  className="rounded-xl border border-[#e8e3d9] px-3 py-2.5 text-sm outline-none focus:border-[#1f75fe]"
                >
                  <option value="all">{t("patients.allStatuses")}</option>
                  {KANBAN_COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.label} {statusCounts[col.id] ? `(${statusCounts[col.id]})` : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as PatientSource | "all")}
                  className="rounded-xl border border-[#e8e3d9] px-3 py-2.5 text-sm outline-none focus:border-[#1f75fe]"
                >
                  <option value="all">{t("patients.allSources")}</option>
                  {ALL_SOURCES.map((s) => (
                    <option key={s} value={s}>{t(`source.${s}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-[#dc2626]">
          <p className="text-sm">{t("kanban.loadError")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[#94a3b8]">
          <Search className="mb-3 h-12 w-12 opacity-40" />
          <p className="text-sm">{t("patients.noResults")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => {
            const statusCol = KANBAN_COLUMNS.find((c) => c.id === p.status);
            const todayList = todayProcedures.get(p.id) ?? [];
            const nextProc = todayList[0];
            const procTime = nextProc?.scheduledAt ? new Date(nextProc.scheduledAt) : null;
            const isNow = procTime
              ? Math.abs(procTime.getTime() - now.getTime()) < 30 * 60_000
              : false;
            const age = p.dateOfBirth ? calculateAge(p.dateOfBirth) : null;
            const progress = progressMap?.[p.id];

            return (
              <motion.button
                key={p.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelect(p.id)}
                className={cn(
                  "group flex flex-col rounded-3xl border bg-white p-5 text-left transition-all hover:shadow-md active:scale-[0.99]",
                  isNow ? "border-[#1f75fe] ring-2 ring-[#1f75fe]/20" : "border-[#e8e3d9]",
                )}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                    isNow ? "bg-[#1f75fe] text-white" : "bg-[#faf8f4] text-[#0f172a]",
                  )}>
                    <Clock className="h-3.5 w-3.5" />
                    {isNow ? "Сейчас" : procTime ? formatTime(procTime) : "—"}
                  </span>
                  {statusCol && (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", COLUMN_HEADER_COLOR[p.status])}>
                      {statusCol.label}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 text-base font-bold text-[#1f75fe]">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-[#0f172a] group-hover:text-[#1f75fe]">{p.name}</p>
                    <p className="text-xs text-[#94a3b8]">
                      {age != null ? `${age} лет` : "—"}
                      {p.gender ? ` · ${p.gender === "female" ? "жен." : p.gender === "male" ? "муж." : ""}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#cbd5e1] group-hover:text-[#1f75fe]" />
                </div>

                <p className="mt-4 rounded-xl bg-[#faf8f4] px-3 py-2 text-sm font-medium text-[#64748b]">
                  {nextProc?.title ?? statusCol?.label ?? t(`status.${p.status}`)}
                </p>

                <div className="mt-3 border-t border-[#f1ede4] pt-3">
                  {progress ? (
                    <PatientTreatmentProgressBar data={progress} compact />
                  ) : (
                    <span className="text-xs text-[#94a3b8]">Прогресс лечения</span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <CreatePatientDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setDateFilter("all");
          void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        }}
        onExistingPatient={(id) => {
          setCreateOpen(false);
          onSelect(id);
        }}
      />
    </div>
  );
}
