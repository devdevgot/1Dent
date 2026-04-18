import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProcedureTemplates,
  useCreateProcedure,
  getListProcedureTemplatesQueryKey,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckSquare, Square, Loader2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";

const DIAGNOSIS_CATEGORIES: ReadonlyArray<{ key: string; label: string; icon: string }> = [
  { key: "therapy",        label: "Терапия",        icon: "🦷" },
  { key: "surgery",        label: "Хирургия",       icon: "🔪" },
  { key: "orthopedics",    label: "Ортопедия",      icon: "👑" },
  { key: "implantation",   label: "Имплантация",    icon: "🔩" },
  { key: "pediatric",      label: "Детский прайс",  icon: "👶" },
  { key: "hygiene",        label: "Гигиена",        icon: "✨" },
  { key: "periodontology", label: "Пародонтология", icon: "🩺" },
  { key: "radiology",      label: "Рентген",        icon: "📷" },
  { key: "restoration",    label: "Реставрация",    icon: "💎" },
];

interface DiagnosisServicePickerProps {
  patientId: string;
  toothFdi: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DiagnosisServicePicker({
  patientId,
  toothFdi,
  onClose,
  onSuccess,
}: DiagnosisServicePickerProps) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchError, setBatchError] = useState<string | null>(null);

  const { data: servicesData, isLoading: servicesLoading } = useListProcedureTemplates(
    selectedCategory ? { category: selectedCategory } : undefined,
    {
      query: {
        queryKey: getListProcedureTemplatesQueryKey(
          selectedCategory ? { category: selectedCategory } : undefined,
        ),
        enabled: selectedCategory !== null,
        staleTime: 60_000,
      },
    },
  );

  const services: ProcedureTemplate[] = servicesData?.data?.templates ?? [];

  const selectedServices = useMemo(
    () => services.filter((s) => selectedIds.has(s.id)),
    [services, selectedIds],
  );

  const total = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (s.defaultPrice ?? 0), 0),
    [selectedServices],
  );

  const createMutation = useCreateProcedure();

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToPlan = async () => {
    if (selectedServices.length === 0) return;
    setBatchError(null);

    let successCount = 0;
    const failures: string[] = [];

    for (const svc of selectedServices) {
      try {
        await createMutation.mutateAsync({
          data: {
            patientId,
            doctorId: user?.id,
            templateId: svc.id,
            name: `[Зуб ${toothFdi}] ${svc.name}`,
            price: svc.defaultPrice,
          },
        });
        successCount++;
      } catch {
        failures.push(svc.name);
      }
    }

    if (successCount > 0) {
      void qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
    }

    if (failures.length > 0) {
      setBatchError(
        `Не удалось добавить: ${failures.join(", ")}. Успешно добавлено: ${successCount}.`,
      );
      return;
    }

    onSuccess?.();
    onClose();
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setSelectedIds(new Set());
  };

  const categoryLabel = DIAGNOSIS_CATEGORIES.find((c) => c.key === selectedCategory)?.label;

  return (
    <div className="flex flex-col h-full">
      {/* Picker header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-slate-50 shrink-0">
        {selectedCategory ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Назад</span>
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Отмена</span>
          </button>
        )}
        <span className="text-xs font-semibold text-foreground">
          {selectedCategory ? categoryLabel : "Выберите категорию"}
        </span>
      </div>

      {/* Level 1 — category tiles */}
      {!selectedCategory && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            {DIAGNOSIS_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={cn(
                  "flex flex-col items-start gap-1 px-3 py-3 rounded-lg border border-border",
                  "text-left text-xs transition-all hover:border-primary/60 hover:bg-primary/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                )}
              >
                <span className="text-lg leading-none">{cat.icon}</span>
                <span className="font-medium text-foreground leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level 2 — service tiles */}
      {selectedCategory && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {servicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : services.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Услуги не найдены
              </p>
            ) : (
              <div className="space-y-1.5">
                {services.map((svc) => {
                  const checked = selectedIds.has(svc.id);
                  return (
                    <button
                      key={svc.id}
                      onClick={() => handleToggle(svc.id)}
                      className={cn(
                        "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-left text-xs transition-all",
                        checked
                          ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/50 hover:bg-slate-50",
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-foreground leading-snug">
                          {svc.code ? (
                            <span className="text-muted-foreground mr-1">{svc.code}.</span>
                          ) : null}
                          {svc.name}
                        </span>
                        <span className="block mt-0.5 text-primary font-semibold">
                          {svc.defaultPrice > 0
                            ? `${svc.defaultPrice.toLocaleString("ru-KZ")} ₸`
                            : "Бесплатно"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Total + submit */}
          <div className="shrink-0 border-t border-border/50 bg-white px-4 py-3 space-y-2">
            {batchError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive leading-snug">{batchError}</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Выбрано: {selectedIds.size} услуг
              </span>
              <span className="text-sm font-bold text-foreground">
                Итого: {total > 0 ? `${total.toLocaleString("ru-KZ")} ₸` : "0 ₸"}
              </span>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={selectedIds.size === 0 || createMutation.isPending}
              onClick={() => void handleAddToPlan()}
            >
              {createMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Добавляем...
                </span>
              ) : (
                "Добавить в план лечения"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
