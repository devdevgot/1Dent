import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeeth,
  useUpdateTooth,
  useListToothTreatments,
  useAddToothTreatment,
  useListInventory,
  getListTeethQueryKey,
  getListToothTreatmentsQueryKey,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import type { ToothCondition, ToothRecord } from "@workspace/api-client-react";
import { CONDITION_CONFIG } from "./fdi-chart";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { X, Clock, Beaker } from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ToothDetailPanelProps {
  patientId: string;
  toothFdi: number;
  onClose: () => void;
  readOnly?: boolean;
}

export function ToothDetailPanel({
  patientId,
  toothFdi,
  onClose,
  readOnly = false,
}: ToothDetailPanelProps) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<ToothCondition | null>(null);
  const [treatmentDesc, setTreatmentDesc] = useState("");
  const [treatmentItemId, setTreatmentItemId] = useState<string | undefined>(undefined);
  const [treatmentQty, setTreatmentQty] = useState<string>("1");
  const [showAddTreatment, setShowAddTreatment] = useState(false);

  const { data: teethData } = useListTeeth(patientId, {
    query: { queryKey: getListTeethQueryKey(patientId) },
  });

  const teeth: ToothRecord[] = teethData?.data?.teeth ?? [];
  const record = teeth.find((t) => t.toothFdi === toothFdi);

  const currentCondition = selectedCondition ?? record?.condition ?? "healthy";

  const { data: treatmentsData, isLoading: treatmentsLoading } = useListToothTreatments(
    patientId,
    toothFdi,
    {
      query: {
        queryKey: getListToothTreatmentsQueryKey(patientId, toothFdi),
      },
    },
  );
  const treatments = treatmentsData?.data?.treatments ?? [];

  const { data: inventoryData } = useListInventory({
    query: { queryKey: getListInventoryQueryKey(), enabled: showAddTreatment },
  });
  const inventoryItems = inventoryData?.data?.items ?? [];

  const updateMutation = useUpdateTooth({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListTeethQueryKey(patientId) });
        setSelectedCondition(null);
        setNotes("");
      },
    },
  });

  const addTreatmentMutation = useAddToothTreatment({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({
          queryKey: getListToothTreatmentsQueryKey(patientId, toothFdi),
        });
        setTreatmentDesc("");
        setTreatmentItemId(undefined);
        setTreatmentQty("1");
        setShowAddTreatment(false);
      },
    },
  });

  const handleSaveCondition = () => {
    updateMutation.mutate({
      id: patientId,
      toothFdi,
      data: {
        condition: currentCondition,
        notes: notes || record?.notes || undefined,
      },
    });
  };

  const handleAddTreatment = () => {
    if (!treatmentDesc.trim()) return;
    addTreatmentMutation.mutate({
      id: patientId,
      toothFdi,
      data: {
        description: treatmentDesc.trim(),
        itemId: treatmentItemId,
        quantityUsed: parseFloat(treatmentQty) || 1,
      },
    });
  };

  const isDirty =
    selectedCondition !== null ||
    (notes.length > 0 && notes !== (record?.notes ?? ""));

  const conditionCfg = CONDITION_CONFIG[currentCondition];

  const canWrite = !readOnly && ["owner", "admin", "doctor"].includes(user?.role ?? "");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-white shrink-0">
        <div
          className="w-8 h-8 rounded-lg border-2 shrink-0 flex items-center justify-center"
          style={{ background: conditionCfg.fill, borderColor: conditionCfg.stroke }}
        >
          <span className="text-xs font-bold" style={{ color: conditionCfg.textColor }}>
            {toothFdi}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">Зуб {toothFdi}</p>
          <p className="text-xs text-muted-foreground">{conditionCfg.label}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-slate-100 text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Condition selector */}
          {canWrite && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Состояние
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(CONDITION_CONFIG) as [ToothCondition, typeof CONDITION_CONFIG[ToothCondition]][]).map(
                  ([cond, cfg]) => (
                    <button
                      key={cond}
                      onClick={() => setSelectedCondition(cond)}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-all",
                        currentCondition === cond
                          ? "ring-2 ring-primary ring-offset-1 border-transparent"
                          : "border-border hover:border-primary/50",
                      )}
                      style={{
                        background: currentCondition === cond ? cfg.fill : undefined,
                        borderColor: currentCondition === cond ? cfg.stroke : undefined,
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 border"
                        style={{ background: cfg.fill, borderColor: cfg.stroke }}
                      />
                      <span className="truncate font-medium" style={{ color: currentCondition === cond ? cfg.textColor : undefined }}>
                        {cfg.label}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {!canWrite && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Состояние
              </p>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                style={{ background: conditionCfg.fill, borderColor: conditionCfg.stroke }}
              >
                <span className="text-sm font-semibold" style={{ color: conditionCfg.textColor }}>
                  {conditionCfg.label}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          {canWrite && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Заметки врача
              </p>
              <Textarea
                placeholder={record?.notes || "Добавить заметку..."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm resize-none"
                rows={3}
              />
            </div>
          )}

          {!canWrite && record?.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Заметки
              </p>
              <p className="text-sm text-foreground">{record.notes}</p>
            </div>
          )}

          {/* Save button */}
          {canWrite && isDirty && (
            <Button
              onClick={handleSaveCondition}
              disabled={updateMutation.isPending}
              size="sm"
              className="w-full"
            >
              {updateMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          )}

          {/* Treatments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                История лечения
              </p>
              {canWrite && (
                <button
                  onClick={() => setShowAddTreatment((v) => !v)}
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  {showAddTreatment ? "Отмена" : "+ Добавить"}
                </button>
              )}
            </div>

            {/* Add treatment form */}
            {showAddTreatment && (
              <div className="bg-slate-50 rounded-xl p-3 space-y-3 mb-3 border border-border/50">
                <Textarea
                  placeholder="Описание процедуры..."
                  value={treatmentDesc}
                  onChange={(e) => setTreatmentDesc(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
                {inventoryItems.length > 0 && (
                  <div className="flex gap-2">
                    <Select
                      value={treatmentItemId ?? "none"}
                      onValueChange={(v) => setTreatmentItemId(v === "none" ? undefined : v)}
                    >
                      <SelectTrigger className="text-xs flex-1">
                        <SelectValue placeholder="Материал из склада" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без материала</SelectItem>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {treatmentItemId && (
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={treatmentQty}
                        onChange={(e) => setTreatmentQty(e.target.value)}
                        className="w-16 text-xs px-2 py-1.5 rounded-md border border-input bg-white"
                        placeholder="Кол-во"
                      />
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={handleAddTreatment}
                  disabled={!treatmentDesc.trim() || addTreatmentMutation.isPending}
                  className="w-full"
                >
                  {addTreatmentMutation.isPending ? "Сохранение..." : "Записать процедуру"}
                </Button>
              </div>
            )}

            {treatmentsLoading ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Загрузка...</div>
            ) : treatments.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Процедур не записано
              </div>
            ) : (
              <div className="space-y-2">
                {[...treatments]
                  .sort(
                    (a, b) =>
                      new Date(b.performedAt).getTime() -
                      new Date(a.performedAt).getTime(),
                  )
                  .map((t) => (
                    <div
                      key={t.id}
                      className="bg-white rounded-lg p-3 border border-border/50 text-sm"
                    >
                      <p className="font-medium text-foreground">{t.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(t.performedAt)}
                        </span>
                        {t.quantityUsed && (
                          <span className="flex items-center gap-1">
                            <Beaker className="w-3 h-3" />
                            {t.quantityUsed} ед.
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
