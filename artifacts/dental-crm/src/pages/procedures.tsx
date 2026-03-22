import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListProcedures,
  useCreateProcedure,
  useUpdateProcedureStatus,
  useDeleteProcedure,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
  useCreateProcedureTemplate,
  useListInventory,
} from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  Plus, Search, Filter, MoreVertical, CheckCircle2,
  Clock, XCircle, PlayCircle, Trash2, ClipboardList, X, ChevronDown, Minus,
} from "lucide-react";

const STATUS_COLORS: Record<ProcedureStatus, string> = {
  scheduled:   "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:   "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_ICONS: Record<ProcedureStatus, React.ElementType> = {
  scheduled:   Clock,
  in_progress: PlayCircle,
  completed:   CheckCircle2,
  cancelled:   XCircle,
};

function StatusBadge({ status }: { status: ProcedureStatus }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[status]}`}>
      <Icon className="w-3.5 h-3.5" />
      {t(`procedure.status.${status}`)}
    </span>
  );
}

function NewProcedureModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const { data: patientsData } = useListPatients();
  const { data: usersData } = useListUsers();
  const { data: templatesData } = useListProcedureTemplates();
  const { data: inventoryData } = useListInventory();

  const patients = patientsData?.data?.patients ?? [];
  const doctors  = (usersData?.data?.users ?? []).filter((u) => u.role === "doctor");
  const templates = templatesData?.data?.templates ?? [];
  const inventoryItems = inventoryData?.data?.items ?? [];

  const createMutation = useCreateProcedure();

  const [form, setForm] = useState({
    patientId:   "",
    doctorId:    user?.role === "doctor" ? user.id : "",
    templateId:  "",
    name:        "",
    price:       "",
    notes:       "",
    scheduledAt: "",
  });

  const [materials, setMaterials] = useState<{ itemId: string; quantity: number }[]>([]);

  const handleTemplate = (templateId: string) => {
    setForm((f) => ({ ...f, templateId }));
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setForm((f) => ({
        ...f,
        templateId,
        name:  tpl.name,
        price: String(tpl.defaultPrice ?? ""),
      }));
    }
  };

  const addMaterial = () => {
    if (inventoryItems.length === 0) return;
    setMaterials((m) => [...m, { itemId: inventoryItems[0]!.id, quantity: 1 }]);
  };

  const removeMaterial = (idx: number) => {
    setMaterials((m) => m.filter((_, i) => i !== idx));
  };

  const updateMaterial = (idx: number, field: "itemId" | "quantity", value: string | number) => {
    setMaterials((m) => m.map((mat, i) => i === idx ? { ...mat, [field]: value } : mat));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        data: {
          patientId:   form.patientId,
          doctorId:    form.doctorId || undefined,
          templateId:  form.templateId || undefined,
          name:        form.name,
          price:       Number(form.price) || 0,
          notes:       form.notes || undefined,
          scheduledAt: form.scheduledAt || undefined,
          materials:   materials.length > 0 ? materials : undefined,
        },
      });
      onSuccess();
      onClose();
    } catch {
      /* handled by query client */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xl font-bold font-display">{t("procedure.newProcedure")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
                {t("procedure.fromTemplate")}
              </label>
              <div className="relative">
                <select
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none appearance-none pr-10 bg-white"
                  onChange={(e) => handleTemplate(e.target.value)}
                  defaultValue=""
                >
                  <option value="">{t("procedure.noTemplate")}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} — ₸ {Number(tpl.defaultPrice).toLocaleString("ru-KZ")}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Patient */}
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
              {t("procedure.patient")} *
            </label>
            <div className="relative">
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none appearance-none pr-10 bg-white"
              >
                <option value="">{t("procedure.selectPatient")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Doctor */}
          {user?.role !== "doctor" && (
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
                {t("procedure.doctor")}
              </label>
              <div className="relative">
                <select
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                  className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none appearance-none pr-10 bg-white"
                >
                  <option value="">{t("procedure.noDoctor")}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
              {t("procedure.name")} *
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder={t("procedure.namePlaceholder")}
            />
          </div>

          {/* Price & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
                {t("procedure.price")} (₸)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
                {t("procedure.scheduledAt")}
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
              {t("procedure.notes")}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              placeholder={t("procedure.notesPlaceholder")}
            />
          </div>

          {/* Materials */}
          {inventoryItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-muted-foreground">{t("procedure.materials")}</label>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("procedure.addMaterial")}
                </button>
              </div>
              <div className="space-y-2">
                {materials.map((mat, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={mat.itemId}
                      onChange={(e) => updateMaterial(idx, "itemId", e.target.value)}
                      className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
                    >
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={mat.quantity}
                      onChange={(e) => updateMaterial(idx, "quantity", Number(e.target.value))}
                      className="w-20 border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeMaterial(idx)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-slate-50 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
            >
              {createMutation.isPending ? t("common.saving") : t("procedure.create")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ProcedureRow({
  proc,
  onRefetch,
  canEdit,
  canDelete,
}: {
  proc: Procedure;
  onRefetch: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const statusMutation  = useUpdateProcedureStatus();
  const deleteMutation  = useDeleteProcedure();

  const handleStatus = async (status: ProcedureStatus) => {
    await statusMutation.mutateAsync({ id: proc.id, data: { status } });
    setMenuOpen(false);
    onRefetch();
  };

  const handleDelete = async () => {
    if (!window.confirm(t("procedure.confirmDelete"))) return;
    await deleteMutation.mutateAsync({ id: proc.id });
    onRefetch();
  };

  const nextStatuses: ProcedureStatus[] = (() => {
    if (proc.status === "scheduled")   return ["in_progress", "cancelled"];
    if (proc.status === "in_progress") return ["completed",   "cancelled"];
    return [];
  })();

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="hover:bg-slate-50/70 transition-colors group"
    >
      <td className="px-4 py-3">
        <div className="font-semibold text-sm text-foreground">{proc.name}</div>
        {proc.notes && (
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">{proc.notes}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{proc.doctorName ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge status={proc.status} />
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-foreground">
        {proc.price ? `₸ ${Number(proc.price).toLocaleString("ru-KZ")}` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {proc.scheduledAt
          ? new Date(proc.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "—"}
      </td>
      <td className="px-4 py-3">
        {(canEdit || canDelete) && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-8 z-10 bg-white rounded-xl border border-border shadow-xl min-w-[160px] overflow-hidden"
                  onBlur={() => setMenuOpen(false)}
                >
                  {canEdit && nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatus(s)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                      {React.createElement(STATUS_ICONS[s], { className: "w-4 h-4 text-muted-foreground" })}
                      {t(`procedure.markAs.${s}`)}
                    </button>
                  ))}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t("common.delete")}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </td>
    </motion.tr>
  );
}

export default function ProceduresPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [showNew, setShowNew]       = useState(false);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilter]   = useState<ProcedureStatus | "all">("all");

  const { data, refetch, isLoading } = useListProcedures();
  const procedures = data?.data?.procedures ?? [];

  const canCreate = ["owner", "admin", "doctor"].includes(user?.role ?? "");
  const canEdit   = ["owner", "admin", "doctor"].includes(user?.role ?? "");
  const canDelete = ["owner", "admin"].includes(user?.role ?? "");

  const filtered = procedures.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusCounts = procedures.reduce(
    (acc, p) => ({ ...acc, [p.status]: (acc[p.status as ProcedureStatus] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            {t("procedure.pageTitle")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("procedure.pageDesc")}</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-5 h-5" />
            {t("procedure.new")}
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "scheduled", "in_progress", "completed", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
              filterStatus === s
                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                : "bg-white text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            {s === "all" ? t("procedure.statusAll") : t(`procedure.status.${s}`)}
            <span className="ml-1.5 tabular-nums">
              {s === "all" ? procedures.length : (statusCounts[s] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("procedure.searchPlaceholder")}
          className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground mt-3 text-sm">{t("common.loading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="font-bold font-display text-lg">{t("procedure.emptyTitle")}</h3>
            <p className="text-muted-foreground text-sm mt-1">{t("procedure.emptyDesc")}</p>
            {canCreate && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all text-sm"
              >
                {t("procedure.new")}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("procedure.col.name")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("procedure.col.doctor")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("procedure.col.status")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("procedure.col.price")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("procedure.col.scheduled")}</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((p) => (
                  <ProcedureRow
                    key={p.id}
                    proc={p}
                    onRefetch={refetch}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showNew && (
          <NewProcedureModal
            onClose={() => setShowNew(false)}
            onSuccess={() => refetch()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
