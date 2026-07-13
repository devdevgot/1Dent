import { useState, useMemo, useCallback, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListPatients,
  useListUsers,
  useListProcedures,
  useDeletePatient,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import type { Patient, PatientStatus, PatientSource } from "@workspace/api-client-react";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, KanbanSquare,
  RefreshCw, Search, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderAddButton, PageHeaderIconButton } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { PatientDetailPanelGate } from "@/components/kanban/patient-detail-panel-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { CreatePatientDialog } from "@/components/kanban/create-patient-dialog";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  KANBAN_COLUMNS,
  COLUMN_HEADER_COLOR,
  SOURCE_LABELS,
  SOURCE_COLORS,
} from "@/lib/patient-utils";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { usePatientTreatmentProgress } from "@/hooks/use-patient-treatment-progress";
import { PatientTreatmentProgressBar } from "@/components/kanban/patient-treatment-progress-bar";
import { PatientsTableSkeleton, KanbanSkeleton } from "@/components/skeletons";
import { usePageBack } from "@/hooks/use-page-back";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

type PatientView = "list" | "kanban";
type SortKey = "name" | "phone" | "dateOfBirth" | "status" | "source" | "createdAt" | "doctor";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<PatientStatus, number> = {
  new_request: 0,
  initial_consultation: 1,
  diagnostics: 2,
  treatment_assigned: 3,
  treatment_in_progress: 4,
  payment_processing: 5,
  post_op_monitoring: 6,
  completed: 7,
  repeat_sale: 8,
  rejected: 9,
};

const ALL_SOURCES: PatientSource[] = [
  "instagram", "referral", "walk_in", "website", "whatsapp", "other",
];

function patientListsEqual(a: Patient[], b: Patient[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}


/* ─── List view ───────────────────────────────────────────────────────────── */
function PatientsListView({
  search,
  statusFilter,
  sourceFilter,
  dateFilterFn,
}: {
  search: string;
  statusFilter: PatientStatus | "all";
  sourceFilter: PatientSource | "all";
  dateFilterFn: (p: Patient) => boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setSelectedPatientId } = useKanbanStore();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });
  const { data: usersData } = useListUsers();
  const { data: proceduresData } = useListProcedures();
  const { data: progressMap } = usePatientTreatmentProgress();

  const doctorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of usersData?.data?.users ?? []) {
      if (u.role === "doctor") m[u.id] = u.name;
    }
    return m;
  }, [usersData]);

  const patientTotals = useMemo(() => {
    const totals: Record<string, { paid: number; count: number }> = {};
    for (const p of proceduresData?.data?.procedures ?? []) {
      if (!p.patientId) continue;
      if (!totals[p.patientId]) totals[p.patientId] = { paid: 0, count: 0 };
      totals[p.patientId]!.count++;
      if (p.status === "completed") totals[p.patientId]!.paid += p.price ?? 0;
    }
    return totals;
  }, [proceduresData]);

  const deleteMutation = useDeletePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        setDeleteConfirm(null);
        toast({ title: t("patients.deleted") });
      },
      onError: () => toast({ title: t("account.errorTitle"), variant: "destructive" }),
    },
  });

  const allPatients: Patient[] = data?.data?.patients ?? [];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allPatients
      .filter((p) => {
        if (!dateFilterFn(p)) return false;
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
        if (q && !p.name.toLowerCase().includes(q) && !p.phone.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "name":        cmp = a.name.localeCompare(b.name); break;
          case "phone":       cmp = a.phone.localeCompare(b.phone); break;
          case "dateOfBirth": cmp = (a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0) - (b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0); break;
          case "status":      cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break;
          case "source":      cmp = a.source.localeCompare(b.source); break;
          case "createdAt":   cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
          case "doctor":      cmp = (a.doctorId ? (doctorMap[a.doctorId] ?? "") : "").localeCompare(b.doctorId ? (doctorMap[b.doctorId] ?? "") : ""); break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [allPatients, search, statusFilter, sourceFilter, dateFilterFn, sortKey, sortDir, doctorMap]);

  const canDelete = user?.role === "owner" || user?.role === "admin";

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-[#94a3b8]" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-[#1f75fe]" />
      : <ChevronDown className="w-3 h-3 text-[#1f75fe]" />;
  };

  const Th = ({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-[#0f172a] ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon col={col} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-[#faf8f4]">
      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <PatientsTableSkeleton />
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-[#dc2626] text-sm">
            {t("kanban.loadError")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#94a3b8]">
            <Search className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">{t("patients.noResults")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-[#e8e3d9] z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide w-10">#</th>
                <Th col="name"        label={t("patients.colName")} />
                <Th col="phone"       label={t("patients.colPhone")} className="hidden sm:table-cell" />
                <Th col="doctor"      label="Врач" className="hidden md:table-cell" />
                <Th col="status"      label={t("patients.colStatus")} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide whitespace-nowrap min-w-[140px]">Прогресс</th>
                <Th col="dateOfBirth" label={t("patients.colAge")} className="hidden lg:table-cell" />
                <Th col="source"      label={t("patients.colSource")} className="hidden xl:table-cell" />
                <Th col="createdAt"   label={t("patients.colCreated")} className="hidden xl:table-cell" />
                {canDelete && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e3d9]">
              {filtered.map((patient, idx) => {
                const initials = (patient.name || "")
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const statusCol = KANBAN_COLUMNS.find((c) => c.id === patient.status);

                return (
                  <tr
                    key={patient.id}
                    onClick={() => setSelectedPatientId(patient.id)}
                    className="bg-white hover:bg-[#faf8f4] cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 text-[#94a3b8] text-xs font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--ds-primary)]/10 text-[#1f75fe] text-xs font-bold flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-[#0f172a] group-hover:text-[#1f75fe] transition-colors">
                            {patient.name}
                          </p>
                          {patient.notes && (
                            <p className="text-xs text-[#94a3b8] truncate max-w-[200px]">{patient.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-[#64748b] text-xs">{patient.phone}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {patient.doctorId && doctorMap[patient.doctorId] ? (
                        <span className="text-xs font-medium text-[#64748b]">{doctorMap[patient.doctorId]}</span>
                      ) : (
                        <span className="text-[#94a3b8] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusCol ? COLUMN_HEADER_COLOR[patient.status] : "bg-[#f1ede4] text-[#64748b]"}`}>
                        {statusCol?.label ?? patient.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      {progressMap?.[patient.id] && (progressMap[patient.id].paid > 0 || progressMap[patient.id].debt > 0 || progressMap[patient.id].pending > 0) ? (
                        <PatientTreatmentProgressBar data={progressMap[patient.id]} compact />
                      ) : (
                        <span className="text-[#94a3b8] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[#64748b] text-xs whitespace-nowrap">
                      {patient.dateOfBirth ? (
                        <span>
                          {calculateAge(patient.dateOfBirth)} лет
                          <span className="text-[#94a3b8] ml-1">· {formatDateOfBirth(patient.dateOfBirth)}</span>
                          {patient.iin && <span className="text-[#94a3b8] ml-1 font-mono">· {maskIIN(patient.iin)}</span>}
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${SOURCE_COLORS[patient.source] ?? "bg-[#f1ede4] text-[#64748b]"}`}>
                        {SOURCE_LABELS[patient.source] ?? patient.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-[#94a3b8] text-xs whitespace-nowrap">
                      {new Date(patient.createdAt).toLocaleDateString("ru", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteConfirm(patient.id)}
                          className="opacity-0 group-hover:opacity-100 text-[#94a3b8] hover:text-[#dc2626] transition-all"
                          title={t("patients.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && !error && filtered.length > 0 && (
        <div className="bg-white border-t border-[#e8e3d9] px-6 py-2 text-xs text-[#94a3b8] shrink-0">
          {t("patients.showing", { count: filtered.length, total: allPatients.length })}
        </div>
      )}

      <ErrorBoundary>
        <PatientDetailPanelGate />
      </ErrorBoundary>
      <ConfirmDeleteDialog
        open={!!deleteConfirm}
        onConfirm={() => { if (deleteConfirm) deleteMutation.mutate({ id: deleteConfirm }); }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

/* ─── Kanban view ─────────────────────────────────────────────────────────── */
function PatientsKanbanView({
  search,
  statusFilter,
  sourceFilter,
  dateFilterFn,
}: {
  search: string;
  statusFilter: PatientStatus | "all";
  sourceFilter: PatientSource | "all";
  dateFilterFn: (p: Patient) => boolean;
}) {
  const { t } = useTranslation();
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients: Patient[] = data?.data?.patients ?? [];

  const onSelectPatient = useCallback(
    (patientId: string) => setSelectedPatientId(patientId),
    [setSelectedPatientId],
  );

  const visiblePatients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return patients.filter((p) => {
      if (!dateFilterFn(p)) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.phone.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [patients, search, statusFilter, sourceFilter, dateFilterFn]);

  const stableVisiblePatientsRef = useRef<Patient[]>(visiblePatients);
  if (!patientListsEqual(stableVisiblePatientsRef.current, visiblePatients)) {
    stableVisiblePatientsRef.current = visiblePatients;
  }
  const boardPatients = stableVisiblePatientsRef.current;

  return (
    <div className="flex flex-col h-full bg-[#faf8f4]">
      <div className="flex flex-col flex-1 overflow-hidden gap-4 p-4">
        {isLoading ? (
          <KanbanSkeleton className="flex-1 pb-4" />
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[#dc2626] text-sm">
            {t("kanban.loadError")}
          </div>
        ) : (
          <KanbanBoard
            patients={boardPatients}
            onSelectPatient={onSelectPatient}
            className="flex gap-3 overflow-x-auto pb-4 flex-1 items-stretch custom-scrollbar"
          />
        )}

        <ErrorBoundary>
          <PatientDetailPanelGate />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/* ─── Unified patients page ───────────────────────────────────────────────── */
export default function PatientsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const urlSearch = useSearch();
  const [location, navigate] = useLocation();
  const goBack = usePageBack();
  const { isOverlay } = useOverlayNavigation();
  const queryClient = useQueryClient();
  const { isCreateOpen, setIsCreateOpen, setSelectedPatientId } = useKanbanStore();

  const [filterSearch, setFilterSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<PatientSource | "all">("all");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data } = useListPatients({ query: { queryKey: getListPatientsQueryKey() } });
  const allPatients: Patient[] = data?.data?.patients ?? [];

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<PatientStatus, number>> = {};
    allPatients.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return counts;
  }, [allPatients]);

  const hasActiveFilter = statusFilter !== "all" || sourceFilter !== "all" || dateFilter !== "all";

  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";

  const viewParam = new URLSearchParams(urlSearch).get("view") as PatientView | null;
  const view: PatientView = viewParam === "kanban" ? "kanban" : "list";

  const setView = (v: PatientView) => {
    const path = location.split("?")[0];
    const params = new URLSearchParams(urlSearch.startsWith("?") ? urlSearch.slice(1) : urlSearch);
    if (v === "list") {
      params.delete("view");
    } else {
      params.set("view", v);
    }
    const qs = params.toString();
    navigate(qs ? `${path}?${qs}` : path, { replace: true });
  };

  const tabs: { key: PatientView; icon: React.ElementType; label: string }[] = [
    { key: "list",   icon: Users,        label: t("patients.tabList") },
    { key: "kanban", icon: KanbanSquare, label: t("patients.tabKanban") },
  ];

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

  const DATE_OPTIONS: { key: typeof dateFilter; label: string }[] = [
    { key: "today", label: "Сегодня" },
    { key: "week",  label: "Неделя" },
    { key: "month", label: "Месяц" },
    { key: "all",   label: "Все" },
  ];

  return (
    <PageShell className="flex flex-col h-full overflow-hidden" animate={false}>
      <PageHeader
        title={t("nav.patients")}
        onBack={goBack}
        subtitle={
          isOverlay
            ? t("kanban.totalPatients", { count: allPatients.length })
            : undefined
        }
        badge={
          !isOverlay && allPatients.length > 0 ? (
            <span className="bg-[var(--primary-light)] text-[#1f75fe] text-xs font-semibold px-2 py-0.5 rounded-full">
              {allPatients.length}
            </span>
          ) : undefined
        }
        right={
          <>
            <PageHeaderIconButton
              onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
              title={t("kanban.refresh")}
            >
              <RefreshCw className="w-4 h-4" />
            </PageHeaderIconButton>
            <PageHeaderIconButton
              onClick={() => setShowFilters((v) => !v)}
              title="Фильтры"
              active={showFilters || hasActiveFilter}
              className="relative"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasActiveFilter && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--ds-primary)] rounded-full" />
              )}
            </PageHeaderIconButton>
            {canCreate && (
              <PageHeaderAddButton
                onClick={() => setIsCreateOpen(true)}
                title={t("kanban.newPatient")}
              />
            )}
          </>
        }
        bottom={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder={t("patients.searchPlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e3d9] rounded-xl focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 bg-white text-[#0f172a]"
              />
            </div>

            <div className="flex items-center bg-[#f1ede4] rounded-xl p-0.5 mt-2.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setView(tab.key)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150",
                      view === tab.key
                        ? "bg-[var(--primary-light)] text-[#1f75fe]"
                        : "text-[#64748b] hover:text-[#0f172a]",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {showFilters && (
              <div className="mt-2.5 space-y-2.5 border-t border-[#e8e3d9] pt-2.5">
                <div className="flex items-center gap-1.5 bg-[#f1ede4] rounded-xl p-1">
                  {DATE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setDateFilter(opt.key)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        dateFilter === opt.key
                          ? "bg-[var(--primary-light)] text-[#1f75fe]"
                          : "text-[#64748b] hover:text-[#0f172a]",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as PatientStatus | "all")}
                    className="flex-1 text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 text-[#0f172a]"
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
                    className="flex-1 text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 text-[#0f172a]"
                  >
                    <option value="all">{t("patients.allSources")}</option>
                    {ALL_SOURCES.map((s) => (
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {KANBAN_COLUMNS.map((col) => {
                    const count = statusCounts[col.id] ?? 0;
                    if (count === 0) return null;
                    return (
                      <button
                        key={col.id}
                        onClick={() => setStatusFilter(statusFilter === col.id ? "all" : col.id)}
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-all ${COLUMN_HEADER_COLOR[col.id]} ${statusFilter === col.id ? "ring-2 ring-offset-1 ring-current" : "opacity-80 hover:opacity-100"}`}
                      >
                        {col.label}: {count}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "list"   && <PatientsListView search={filterSearch} statusFilter={statusFilter} sourceFilter={sourceFilter} dateFilterFn={dateFilterFn} />}
        {view === "kanban" && <PatientsKanbanView search={filterSearch} statusFilter={statusFilter} sourceFilter={sourceFilter} dateFilterFn={dateFilterFn} />}
      </div>

      <CreatePatientDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onExistingPatient={(patientId) => {
          setIsCreateOpen(false);
          setSelectedPatientId(patientId);
        }}
      />
    </PageShell>
  );
}
