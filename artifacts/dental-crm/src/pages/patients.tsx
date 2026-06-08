import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListPatients,
  useListUsers,
  useListProcedures,
  useDeletePatient,
  useUpdatePatientStatus,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import type { Patient, PatientStatus, PatientSource } from "@workspace/api-client-react";
import { calculateAge, formatDateOfBirth, maskIIN } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  Users, KanbanSquare,
  Plus, RefreshCw, Search, Trash2,
  ChevronLeft, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { PatientCard } from "@/components/kanban/patient-card";
import { PatientDetailPanel } from "@/components/kanban/patient-detail-panel";
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
import { usePatientFinancials } from "@/hooks/use-patient-financials";
import { PatientFinancialBar } from "@/components/kanban/patient-financial-bar";

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


/* ─── List view ───────────────────────────────────────────────────────────── */
function PatientsListView({
  search,
  statusFilter,
  sourceFilter,
}: {
  search: string;
  statusFilter: PatientStatus | "all";
  sourceFilter: PatientSource | "all";
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
  const { data: financials } = usePatientFinancials();

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
  }, [allPatients, search, statusFilter, sourceFilter, sortKey, sortDir, doctorMap]);

  const canDelete = user?.role === "owner" || user?.role === "admin";

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevronDown className="w-3 h-3 text-primary" />;
  };

  const Th = ({ col: _col, label, className = "" }: { col: SortKey; label: string; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${className}`}
    >
      {label}
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-destructive text-sm">
            {t("kanban.loadError")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Search className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">{t("patients.noResults")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                <Th col="name"        label={t("patients.colName")} />
                <Th col="phone"       label={t("patients.colPhone")} className="hidden sm:table-cell" />
                <Th col="doctor"      label="Врач" className="hidden md:table-cell" />
                <Th col="status"      label={t("patients.colStatus")} />
                <Th col="dateOfBirth" label={t("patients.colAge")} className="hidden lg:table-cell" />
                <Th col="source"      label={t("patients.colSource")} className="hidden xl:table-cell" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell whitespace-nowrap">Лечение</th>
                <Th col="createdAt"   label={t("patients.colCreated")} className="hidden xl:table-cell" />
                {canDelete && <th className="px-4 py-3 w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
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
                    className="bg-white hover:bg-primary/5 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 text-gray-300 text-xs font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 group-hover:text-primary transition-colors">
                            {patient.name}
                          </p>
                          {patient.notes && (
                            <p className="text-xs text-gray-400 truncate max-w-[200px]">{patient.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-gray-600 text-xs">{patient.phone}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {patient.doctorId && doctorMap[patient.doctorId] ? (
                        <span className="text-xs font-medium text-gray-700">{doctorMap[patient.doctorId]}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusCol ? COLUMN_HEADER_COLOR[patient.status] : "bg-gray-100 text-gray-600"}`}>
                        {statusCol?.label ?? patient.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600 text-xs whitespace-nowrap">
                      {patient.dateOfBirth ? (
                        <span>
                          {calculateAge(patient.dateOfBirth)} лет
                          <span className="text-gray-400 ml-1">· {formatDateOfBirth(patient.dateOfBirth)}</span>
                          {patient.iin && <span className="text-gray-400 ml-1 font-mono">· {maskIIN(patient.iin)}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${SOURCE_COLORS[patient.source] ?? "bg-gray-100 text-gray-600"}`}>
                        {SOURCE_LABELS[patient.source] ?? patient.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell min-w-[160px]">
                      {financials?.[patient.id] && (financials[patient.id].paid > 0 || financials[patient.id].debt > 0 || financials[patient.id].remaining > 0) ? (
                        <PatientFinancialBar data={financials[patient.id]} />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-gray-400 text-xs whitespace-nowrap">
                      {new Date(patient.createdAt).toLocaleDateString("ru", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteConfirm(patient.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
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
        <div className="bg-white border-t border-gray-100 px-6 py-2 text-xs text-gray-400 shrink-0">
          {t("patients.showing", { count: filtered.length, total: allPatients.length })}
        </div>
      )}

      <ErrorBoundary>
        <PatientDetailPanel />
      </ErrorBoundary>
      <ConfirmDeleteDialog
        open={!!deleteConfirm}
        onConfirm={() => { deleteMutation.mutate({ id: deleteConfirm! }); setDeleteConfirm(null); }}
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
}: {
  search: string;
  statusFilter: PatientStatus | "all";
  sourceFilter: PatientSource | "all";
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeDragPatient, setActiveDragPatient] = useState<Patient | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, isLoading, error } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients: Patient[] = data?.data?.patients ?? [];

  const visiblePatients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return patients.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (sourceFilter !== "all" && p.source !== sourceFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.phone.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [patients, search, statusFilter, sourceFilter]);

  const statusMutation = useUpdatePatientStatus({
    mutation: {
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      },
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const patient = patients.find((p) => p.id === event.active.id);
    setActiveDragPatient(patient ?? null);
  };

  const resolveOverColumn = (overId: string | number): PatientStatus | null => {
    const overIdStr = String(overId);
    const col = KANBAN_COLUMNS.find((c) => c.id === overIdStr);
    if (col) return col.id;
    const overPatient = patients.find((p) => p.id === overIdStr);
    if (overPatient) return overPatient.status;
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragPatient(null);
    if (!over) return;
    const draggedPatient = patients.find((p) => p.id === active.id);
    if (!draggedPatient) return;
    const overColumnId = resolveOverColumn(over.id);
    if (overColumnId && draggedPatient.status !== overColumnId) {
      queryClient.setQueryData(getListPatientsQueryKey(), (old: typeof data) => {
        if (!old?.data?.patients) return old;
        return {
          ...old,
          data: {
            ...old.data,
            patients: old.data.patients.map((p) =>
              p.id === draggedPatient.id
                ? { ...p, status: overColumnId as PatientStatus }
                : p,
            ),
          },
        };
      });
      statusMutation.mutate({
        id: draggedPatient.id,
        data: { status: overColumnId as PatientStatus },
      });
    }
  };

  const patientsByColumn = (columnId: PatientStatus) =>
    visiblePatients.filter((p) => p.status === columnId);

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7]">
      <div className="flex flex-col flex-1 overflow-hidden gap-4 p-4">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-destructive text-sm">
            {t("kanban.loadError")}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-4 flex-1 items-stretch snap-x snap-mandatory sm:snap-none custom-scrollbar">
              {KANBAN_COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  colorClass={col.color}
                  patients={patientsByColumn(col.id)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDragPatient ? (
                <div className="rotate-2 opacity-90 pointer-events-none">
                  <PatientCard patient={activeDragPatient} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <ErrorBoundary>
          <PatientDetailPanel />
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
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { isCreateOpen, setIsCreateOpen } = useKanbanStore();

  const [filterSearch, setFilterSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PatientStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<PatientSource | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data } = useListPatients({ query: { queryKey: getListPatientsQueryKey() } });
  const allPatients: Patient[] = data?.data?.patients ?? [];

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<PatientStatus, number>> = {};
    allPatients.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return counts;
  }, [allPatients]);

  const hasActiveFilter = filterSearch.length > 0 || statusFilter !== "all" || sourceFilter !== "all";

  const canCreate = user?.role === "owner" || user?.role === "admin" || user?.role === "doctor";

  const viewParam = new URLSearchParams(urlSearch).get("view") as PatientView | null;
  const view: PatientView = viewParam === "kanban" ? "kanban" : "list";

  const setView = (v: PatientView) => navigate(`/patients?view=${v}`, { replace: true });

  const tabs: { key: PatientView; icon: React.ElementType; label: string }[] = [
    { key: "list",   icon: Users,        label: t("patients.tabList") },
    { key: "kanban", icon: KanbanSquare, label: t("patients.tabKanban") },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-2.5 shrink-0">

        {/* Row 1: title + icon actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{t("nav.patients")}</h1>
          <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
            {allPatients.length}
          </span>

          {/* View switcher — desktop only in this row */}
          <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5 ml-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setView(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 whitespace-nowrap",
                    view === tab.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-700",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="flex-1" />

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })}
            className="text-gray-400 hover:text-primary transition-colors p-1.5"
            title={t("kanban.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "relative transition-colors p-1.5",
              showFilters || hasActiveFilter ? "text-primary" : "text-gray-400 hover:text-primary",
            )}
            title="Фильтры"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {hasActiveFilter && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary rounded-full" />
            )}
          </button>
          {canCreate && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 h-8 text-xs px-2.5 sm:px-3">
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("kanban.newPatient")}</span>
            </Button>
          )}
        </div>

        {/* View switcher — mobile only, second row */}
        <div className="flex sm:hidden items-center bg-gray-100 rounded-lg p-0.5 mt-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-150",
                  view === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-2.5 space-y-2 border-t border-gray-100 pt-2.5">
            <div className="flex flex-wrap gap-2">
              <div className="relative w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder={t("patients.searchPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as PatientStatus | "all")}
                  className="flex-1 sm:flex-none text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-700"
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
                  className="flex-1 sm:flex-none text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-700"
                >
                  <option value="all">{t("patients.allSources")}</option>
                  {ALL_SOURCES.map((s) => (
                    <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
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
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "list"   && <PatientsListView search={filterSearch} statusFilter={statusFilter} sourceFilter={sourceFilter} />}
        {view === "kanban" && <PatientsKanbanView search={filterSearch} statusFilter={statusFilter} sourceFilter={sourceFilter} />}
      </div>

      {isCreateOpen && <CreatePatientDialog onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}
