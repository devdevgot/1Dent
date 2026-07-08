import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
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
  useUpdateTooth,
  useAddToothTreatment,
  useListTeeth,
  getListTeethQueryKey,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import type { Procedure, ProcedureStatus, ToothCondition } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { AppDialog } from "@/components/layout/app-dialog";
import { ToothMiniGrid } from "@/components/dental-chart/tooth-mini-grid";
import {
  Plus, Search, Filter, MoreVertical, CheckCircle2,
  Clock, XCircle, PlayCircle, Trash2, ClipboardList, X, ChevronDown, Minus,
  Activity,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_COLORS: Record<ProcedureStatus, string> = {
  scheduled:       "bg-[#e0f2fe] text-[#0284c7] border-[#0284c7]/20",
  in_progress:     "bg-[#fef3c7] text-[var(--warning)] border-[#d97706]/20",
  pending_payment: "bg-[#fef3c7] text-[var(--warning)] border-[#d97706]/20",
  completed:       "bg-[#f0fdf4] text-[var(--success)] border-[#16a34a]/20",
  cancelled:       "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--ds-border)]",
};

const STATUS_ICONS: Record<ProcedureStatus, React.ElementType> = {
  scheduled:       Clock,
  in_progress:     PlayCircle,
  pending_payment: Clock,
  completed:       CheckCircle2,
  cancelled:       XCircle,
};

function StatusBadge({ status }: { status: ProcedureStatus }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold border ${STATUS_COLORS[status]}`}>
      <Icon className="w-3.5 h-3.5" />
      {t(`procedure.status.${status}`)}
    </span>
  );
}

const MANIPULATION_OPTIONS: { value: ToothCondition; labelKey: string }[] = [
  { value: "cavity",            labelKey: "condition.cavity" },
  { value: "treated",           labelKey: "condition.treated" },
  { value: "crown",             labelKey: "condition.crown" },
  { value: "root_canal",        labelKey: "condition.root_canal" },
  { value: "implant",           labelKey: "condition.implant" },
  { value: "missing",           labelKey: "condition.missing" },
  { value: "extraction_needed", labelKey: "condition.extraction_needed" },
];

function NewProcedureModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: patientsData } = useListPatients();
  const { data: usersData } = useListUsers();
  const { data: templatesData } = useListProcedureTemplates();
  const { data: inventoryData } = useListInventory();

  const patients = patientsData?.data?.patients ?? [];
  const doctors  = (usersData?.data?.users ?? []).filter((u) => u.role === "doctor");
  const templates = templatesData?.data?.templates ?? [];
  const inventoryItems = inventoryData?.data?.items ?? [];

  const createMutation = useCreateProcedure();
  const updateToothMutation = useUpdateTooth();
  const addTreatmentMutation = useAddToothTreatment();

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

  const [selectedFdis, setSelectedFdis] = useState<number[]>([]);
  const [manipulation, setManipulation] = useState<ToothCondition>("treated");
  const [showToothPicker, setShowToothPicker] = useState(false);

  const { data: teethData } = useListTeeth(form.patientId, {
    query: { enabled: !!form.patientId, queryKey: getListTeethQueryKey(form.patientId) },
  });
  const patientTeeth = teethData?.data?.teeth ?? [];

  const toggleTooth = (fdi: number) => {
    setSelectedFdis((prev) =>
      prev.includes(fdi) ? prev.filter((f) => f !== fdi) : [...prev, fdi],
    );
  };

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

      // Auto-fill materials from template by matching names against loaded inventory items
      let rawMaterials: { name: string; quantity: number }[] = [];
      try {
        rawMaterials = JSON.parse(String(tpl.materials)) as { name: string; quantity: number }[];
      } catch {
        rawMaterials = [];
      }
      if (rawMaterials.length > 0 && inventoryItems.length > 0) {
        const nameToId = new Map(inventoryItems.map((item) => [item.name.toLowerCase(), item.id]));
        const prefilled = rawMaterials
          .map((m) => ({ itemId: nameToId.get(m.name.toLowerCase()) ?? "", quantity: m.quantity }))
          .filter((m) => m.itemId !== "");
        if (prefilled.length > 0) setMaterials(prefilled);
      }
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
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
          materials:   materials.length > 0 ? materials : undefined,
        },
      });

      if (selectedFdis.length > 0 && form.patientId) {
        const toothResults = await Promise.allSettled(
          selectedFdis.map(async (fdi) => {
            await updateToothMutation.mutateAsync({
              id: form.patientId,
              toothFdi: fdi,
              data: { condition: manipulation },
            });
            await addTreatmentMutation.mutateAsync({
              id: form.patientId,
              toothFdi: fdi,
              data: {
                description: form.name || t("procedure.toothTreatmentDefault"),
                type: "treatment",
              },
            });
          }),
        );
        const failed = toothResults.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast({
            title: t("common.error"),
            description: t("procedure.toothUpdatePartialError", {
              defaultValue: `Процедура создана, но не удалось обновить ${failed} зуб(ов)`,
            }),
            variant: "destructive",
          });
        }
        qc.invalidateQueries({ queryKey: getListTeethQueryKey(form.patientId) });
      }

      onSuccess();
      onClose();
    } catch {
      /* handled by query client */
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={t("procedure.newProcedure")}
      size="lg"
      bodyClassName="!py-0"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="dash-btn dash-btn-secondary flex-1"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="new-procedure-form"
            disabled={createMutation.isPending}
            className="dash-btn dash-btn-primary flex-1"
          >
            {createMutation.isPending ? t("common.saving") : t("procedure.create")}
          </button>
        </>
      }
    >
      <form id="new-procedure-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
                {t("procedure.fromTemplate")}
              </label>
              <div className="relative">
                <select
                  className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none appearance-none pr-10 bg-[var(--ds-surface)]"
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
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)] pointer-events-none" />
              </div>
            </div>
          )}

          {/* Patient */}
          <div>
            <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
              {t("procedure.patient")} *
            </label>
            <div className="relative">
              <select
                required
                value={form.patientId}
                onChange={(e) => {
                  setForm({ ...form, patientId: e.target.value });
                  setSelectedFdis([]);
                  setShowToothPicker(false);
                }}
                className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none appearance-none pr-10 bg-[var(--ds-surface)]"
              >
                <option value="">{t("procedure.selectPatient")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)] pointer-events-none" />
            </div>
          </div>

          {/* Tooth Picker */}
          {form.patientId && (
            <div className="border border-[var(--ds-border)] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowToothPicker((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-body font-semibold text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--ds-primary)]" />
                  {t("procedure.toothSelection")}
                  {selectedFdis.length > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1f75fe] text-white text-[10px] font-bold">
                      {selectedFdis.length}
                    </span>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--text-subtle)] transition-transform ${showToothPicker ? "rotate-180" : ""}`} />
              </button>

              {showToothPicker && (
                <div className="px-4 pb-4 border-t border-[var(--ds-border)] bg-[var(--bg)]">
                  <p className="text-caption text-[var(--text-secondary)] mt-3 mb-2">
                    {t("procedure.toothSelectionHint")}
                  </p>

                  <div className="overflow-x-auto pb-1">
                    <ToothMiniGrid
                      teeth={patientTeeth}
                      selectedFdis={selectedFdis}
                      onToggle={toggleTooth}
                    />
                  </div>

                  {selectedFdis.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-caption font-semibold text-[var(--text-secondary)]">
                        {t("procedure.manipulationType")}
                      </label>
                      <div className="relative">
                        <select
                          value={manipulation}
                          onChange={(e) => setManipulation(e.target.value as ToothCondition)}
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3 py-2.5 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none appearance-none pr-8 bg-[var(--ds-surface)]"
                        >
                          {MANIPULATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-subtle)] pointer-events-none" />
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedFdis.sort((a, b) => a - b).map((fdi) => (
                          <span
                            key={fdi}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1f75fe]/10 text-[var(--ds-primary)] text-caption font-semibold"
                          >
                            {t("procedure.toothFdi", { fdi })}
                            <button
                              type="button"
                              onClick={() => toggleTooth(fdi)}
                              className="hover:text-[var(--danger)] transition-colors ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Doctor */}
          {user?.role !== "doctor" && (
            <div>
              <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
                {t("procedure.doctor")}
              </label>
              <div className="relative">
                <select
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                  className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none appearance-none pr-10 bg-[var(--ds-surface)]"
                >
                  <option value="">{t("procedure.noDoctor")}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)] pointer-events-none" />
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
              {t("procedure.name")} *
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none"
              placeholder={t("procedure.namePlaceholder")}
            />
          </div>

          {/* Price & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
                {t("procedure.price")} (₸)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
                {t("procedure.scheduledAt")}
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-body font-semibold text-[var(--text-secondary)] mb-1.5">
              {t("procedure.notes")}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-[var(--ds-border)] rounded-xl px-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none resize-none"
              placeholder={t("procedure.notesPlaceholder")}
            />
          </div>

          {/* Materials */}
          {inventoryItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-body font-semibold text-[var(--text-secondary)]">{t("procedure.materials")}</label>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="flex items-center gap-1 text-caption text-[var(--ds-primary)] font-semibold hover:underline"
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
                      className="flex-1 border border-[var(--ds-border)] rounded-xl px-3 py-2 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none bg-[var(--ds-surface)]"
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
                      className="w-20 border border-[var(--ds-border)] rounded-xl px-3 py-2 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeMaterial(idx)}
                      className="p-2 text-[var(--danger)] hover:bg-[#fef2f2] rounded-xl transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

      </form>
    </AppDialog>
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
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ProcedureStatus | null>(null);
  const [modalNotes, setModalNotes] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const statusMutation  = useUpdateProcedureStatus();
  const deleteMutation  = useDeleteProcedure();

  const handleStatusClick = (status: ProcedureStatus) => {
    setSelectedStatus(status);
    setModalNotes("");
    setStatusModalOpen(true);
    setMenuOpen(false);
  };

  const handleStatusSubmit = async () => {
    if (!selectedStatus) return;
    await statusMutation.mutateAsync({ 
      id: proc.id, 
      data: { status: selectedStatus, notes: modalNotes || undefined } 
    });
    setStatusModalOpen(false);
    onRefetch();
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ id: proc.id });
    onRefetch();
  };

  const nextStatuses: ProcedureStatus[] = (() => {
    if (proc.status === "scheduled")   return ["in_progress", "cancelled"];
    if (proc.status === "in_progress") return ["completed",   "cancelled"];
    return [];
  })();

  return (
    <>
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="hover:bg-[var(--bg)] transition-colors group"
    >
      <td className="px-4 py-3">
        <div className="font-semibold text-body text-[var(--text)]">{proc.name}</div>
        {proc.notes && (
          <div className="text-caption text-[var(--text-secondary)] truncate max-w-[180px]">{proc.notes}</div>
        )}
      </td>
      <td className="px-4 py-3 text-body text-[var(--text-secondary)]">{proc.doctorName ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge status={proc.status} />
      </td>
      <td className="px-4 py-3 text-body font-semibold text-[var(--text)]">
        {proc.price ? `₸ ${Number(proc.price).toLocaleString("ru-KZ")}` : "—"}
      </td>
      <td className="px-4 py-3 text-caption text-[var(--text-secondary)]">
        {proc.scheduledAt
          ? new Date(proc.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "—"}
      </td>
      <td className="px-4 py-3">
        {(canEdit || canDelete) && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-8 z-10 bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border)] shadow-xl min-w-[160px] overflow-hidden"
                  onBlur={() => setMenuOpen(false)}
                >
                  {canEdit && nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusClick(s)}
                      className="w-full text-left px-4 py-2.5 text-body text-[var(--text)] hover:bg-[var(--bg)] transition-colors flex items-center gap-2"
                    >
                      {React.createElement(STATUS_ICONS[s], { className: "w-4 h-4 text-[var(--text-secondary)]" })}
                      {t(`procedure.markAs.${s}`)}
                    </button>
                  ))}
                  {canDelete && (
                    <button
                      onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true); }}
                      className="w-full text-left px-4 py-2.5 text-body text-[var(--danger)] hover:bg-[#fef2f2] transition-colors flex items-center gap-2"
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
    <ConfirmDeleteDialog
      open={showDeleteConfirm}
      onConfirm={() => { handleDelete(); setShowDeleteConfirm(false); }}
      onCancel={() => setShowDeleteConfirm(false)}
    />
    {statusModalOpen && selectedStatus && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setStatusModalOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-[var(--ds-border)]">
            <h2 className="text-lg font-bold text-[var(--text)]">
              {t(`procedure.markAs.${selectedStatus}`)}
            </h2>
            <p className="text-body text-[var(--text-secondary)] mt-1">{proc.name}</p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-body font-semibold text-[var(--text-secondary)] mb-2">
                {t("procedure.comments")}
              </label>
              <textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                rows={3}
                placeholder={t("procedure.commentsPlaceholder")}
                className="w-full border border-[var(--ds-border)] rounded-xl px-3 py-2 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="flex-1 py-2.5 border border-[var(--ds-border)] rounded-xl text-body font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleStatusSubmit}
                disabled={statusMutation.isPending}
                className="flex-1 py-2.5 bg-[#1f75fe] text-white rounded-full text-body font-semibold hover:bg-[var(--primary-hover)] hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {statusMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </>
  );
}

export function ProceduresContent({ onAdd }: { onAdd?: () => void } = {}) {
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

  const handleShowNew = () => {
    if (onAdd) onAdd();
    else setShowNew(true);
  };

  return (
    <>
      <div className="p-4 pb-8 space-y-4">

      {/* Inline action row (used when embedded in tabs) */}
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={handleShowNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1f75fe] text-white text-body font-semibold rounded-full hover:bg-[var(--primary-hover)] hover:scale-105 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t("procedure.new")}
          </button>
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "scheduled", "in_progress", "pending_payment", "completed", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-body font-semibold border transition-all ${
              filterStatus === s
                ? "bg-[#1f75fe] text-white border-[#1f75fe] shadow-md"
                : "bg-[var(--ds-surface)] text-[var(--text-secondary)] border-[var(--ds-border)] hover:border-[#1f75fe]/30 hover:bg-[var(--bg)]"
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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("procedure.searchPlaceholder")}
          className="w-full bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl pl-10 pr-4 py-3 text-body text-[var(--text)] focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20 outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-[#1f75fe]/20 border-t-[#1f75fe] rounded-full animate-spin" />
            <p className="text-[var(--text-secondary)] mt-3 text-sm">{t("common.loading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <ClipboardList className="w-12 h-12 text-[var(--text-subtle)]/30 mx-auto mb-3" />
            <h3 className="font-bold text-lg text-[var(--text)]">{t("procedure.emptyTitle")}</h3>
            <p className="text-[var(--text-secondary)] text-body mt-1">{t("procedure.emptyDesc")}</p>
            {canCreate && (
              <button
                onClick={handleShowNew}
                className="mt-4 px-5 py-2.5 bg-[#1f75fe] text-white font-semibold rounded-full hover:bg-[var(--primary-hover)] hover:scale-105 transition-all text-sm"
              >
                {t("procedure.new")}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg)] border-b border-[var(--ds-border)]">
                <tr>
                  <th className="px-4 py-3 text-left text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t("procedure.col.name")}</th>
                  <th className="px-4 py-3 text-left text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t("procedure.col.doctor")}</th>
                  <th className="px-4 py-3 text-left text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t("procedure.col.status")}</th>
                  <th className="px-4 py-3 text-left text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t("procedure.col.price")}</th>
                  <th className="px-4 py-3 text-left text-caption font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{t("procedure.col.scheduled")}</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e3d9]">
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

      {!onAdd && (
        <NewProcedureModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onSuccess={() => refetch()}
        />
      )}
      </div>
    </>
  );
}

export default function ProceduresPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const canCreate = ["owner", "admin", "doctor"].includes(user?.role ?? "");
  const [showNew, setShowNew] = useState(false);

  return (
    <PageShell animate={false}>
      <PageHeader
        title={t("procedure.pageTitle")}
        onBack={() => window.history.back()}
        icon={<ClipboardList className="w-5 h-5" strokeWidth={1.8} />}
        right={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--ds-primary)] text-white hover:opacity-90 transition-opacity shrink-0"
              title={t("procedure.new")}
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : undefined
        }
      />
      <ProceduresContent onAdd={() => setShowNew(true)} />
      <NewProcedureModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onSuccess={() => {
          setShowNew(false);
          qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
        }}
      />
    </PageShell>
  );
}
