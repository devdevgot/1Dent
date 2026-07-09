import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProcedureTemplates,
  useCreateProcedure,
  getListProceduresQueryKey,
} from "@workspace/api-client-react";
import type { ProcedureTemplate } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ListRowsSkeleton } from "@/components/skeletons";
import {
  Search,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "all",           label: "Все" },
  { key: "therapy",       label: "Терапия" },
  { key: "surgery",       label: "Хирургия" },
  { key: "orthopedics",   label: "Ортопедия" },
  { key: "implantation",  label: "Имплантация" },
  { key: "hygiene",       label: "Гигиена" },
  { key: "pediatric",     label: "Детский" },
  { key: "periodontology",label: "Пародонтология" },
  { key: "radiology",     label: "Рентген" },
  { key: "restoration",   label: "Реставрация" },
  { key: "other",         label: "Прочее" },
];

const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// ── Props ─────────────────────────────────────────────────────────────────────

interface DiagnosisServicePickerProps {
  patientId: string;
  toothFdi: number;
  /** Pre-select a category tab on open (e.g. "implantation" for missing teeth) */
  defaultCategory?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiagnosisServicePicker({
  patientId,
  toothFdi,
  defaultCategory,
  onClose,
  onSuccess,
}: DiagnosisServicePickerProps) {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [activeCategory, setActiveCategory] = useState<string>(defaultCategory ?? "all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchError, setBatchError] = useState<string | null>(null);

  // Load all templates at once — no two-level navigation needed
  const { data: servicesData, isLoading } = useListProcedureTemplates(undefined, {
    query: { queryKey: ["procedure-templates-all"], staleTime: 60_000 },
  });
  const allTemplates: ProcedureTemplate[] = servicesData?.data?.templates ?? [];

  // Count per category (for badge on tabs)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const t of allTemplates) {
      if ((t.defaultPrice ?? 0) <= 0) continue;
      counts.all = (counts.all ?? 0) + 1;
      if (t.category) counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return counts;
  }, [allTemplates]);

  // Visible categories = "Все" + categories that have at least 1 template
  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => c.key === "all" || (categoryCounts[c.key] ?? 0) > 0),
    [categoryCounts],
  );

  // Filtered service list
  const filtered = useMemo(() => {
    let list = allTemplates.filter((t) => (t.defaultPrice ?? 0) > 0);
    if (activeCategory !== "all") {
      list = list.filter((t) => t.category === activeCategory);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.code ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allTemplates, activeCategory, search]);

  const selectedTemplates = useMemo(
    () => allTemplates.filter((t) => selectedIds.has(t.id)),
    [allTemplates, selectedIds],
  );

  const total = useMemo(
    () => selectedTemplates.reduce((sum, s) => sum + (s.defaultPrice ?? 0), 0),
    [selectedTemplates],
  );

  const createMutation = useCreateProcedure();

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedTemplates.length === 0) return;
    setBatchError(null);
    let successCount = 0;
    const failures: string[] = [];

    for (const svc of selectedTemplates) {
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
      setBatchError(`Не удалось добавить: ${failures.join(", ")}.`);
      return;
    }

    onSuccess?.();
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-secondary)] pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск услуги по названию или коду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full text-[13px] pl-9 pr-9 py-2.5 border border-[var(--ds-border)] rounded-xl bg-[var(--ds-surface)] focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-[var(--text-secondary)]/50"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Category tabs ──────────────────────────────────────────────────── */}
      <div
        className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        {visibleCategories.map((cat) => {
          const count = categoryCounts[cat.key] ?? 0;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setSearch(""); }}
              className={cn(
                "flex items-center gap-1 shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-full border transition-all duration-150",
                isActive
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "border-[var(--ds-border)]/60 text-[var(--text-secondary)] bg-[var(--ds-surface)] hover:border-primary/40 hover:text-[var(--text)]",
              )}
            >
              <span>{cat.label}</span>
              {cat.key !== "all" && count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold rounded-full min-w-[16px] text-center",
                    isActive ? "text-white/70" : "text-[var(--text-secondary)]/60",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Service list ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-1">
        {isLoading ? (
          <ListRowsSkeleton rows={6} avatar={false} card={false} className="py-2" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <span className="text-2xl">🔍</span>
            <p className="text-body font-medium text-[var(--text)]">Ничего не найдено</p>
            <p className="text-caption text-[var(--text-secondary)]">
              {search ? `По запросу «${search}» нет совпадений` : "В этой категории нет услуг"}
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-caption text-primary hover:underline mt-1"
              >
                Сбросить поиск
              </button>
            )}
          </div>
        ) : (
          filtered.map((svc) => {
            const checked = selectedIds.has(svc.id);
            return (
              <button
                key={svc.id}
                onClick={() => handleToggle(svc.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-100",
                  checked
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-[var(--ds-border)]/60 bg-[var(--ds-surface)] hover:border-primary/40 hover:bg-[var(--bg)]/80",
                )}
              >
                {/* Checkbox */}
                <span className="shrink-0">
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4 text-[var(--text-secondary)]/50" />
                  )}
                </span>

                {/* Name + category label */}
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    {svc.code && (
                      <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0">
                        {svc.code}
                      </span>
                    )}
                    <span className="text-[13px] font-medium text-[var(--text)] leading-snug">
                      {svc.name}
                    </span>
                  </span>
                  {activeCategory === "all" && svc.category && (
                    <span className="block text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {CATEGORY_LABEL_MAP[svc.category] ?? svc.category}
                    </span>
                  )}
                </span>

                {/* Price */}
                <span
                  className={cn(
                    "shrink-0 text-[13px] font-bold tabular-nums",
                    checked ? "text-primary" : "text-[var(--text)]/80",
                  )}
                >
                  {svc.defaultPrice > 0
                    ? `${svc.defaultPrice.toLocaleString("ru-KZ")} ₸`
                    : "—"}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--ds-border)]/50 bg-[var(--ds-surface)] px-3 py-3 space-y-2.5">
        {batchError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-caption text-destructive leading-snug">{batchError}</p>
          </div>
        )}

        {/* Summary row */}
        <div className="flex items-center justify-between">
          {selectedIds.size > 0 ? (
            <>
              <span className="text-caption text-[var(--text-secondary)]">
                Выбрано: {selectedIds.size} услуг
              </span>
              <span className="text-body font-bold text-primary">
                {total.toLocaleString("ru-KZ")} ₸
              </span>
            </>
          ) : (
            <span className="text-caption text-[var(--text-secondary)]">
              Зуб {toothFdi} — выберите услуги из прейскуранта
            </span>
          )}
        </div>

        <Button
          size="sm"
          className="w-full h-9 text-sm"
          disabled={selectedIds.size === 0 || createMutation.isPending}
          onClick={() => void handleAdd()}
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Добавляем...
            </>
          ) : selectedIds.size > 0 ? (
            `Добавить ${selectedIds.size} ${selectedIds.size === 1 ? "услугу" : "услуги"} в план`
          ) : (
            "Добавить в план лечения"
          )}
        </Button>
      </div>
    </div>
  );
}
