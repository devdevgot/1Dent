import type { TreatmentPlanItem } from "@workspace/api-client-react";

export interface TreatmentStageConfig {
  id: string;
  label: string;
  conditions: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  badgeBg: string;
  indexNumber?: number;
}

export const TREATMENT_STAGE_CONFIGS: TreatmentStageConfig[] = [
  {
    id: "prevention_treatment",
    label: "Этап 1. Профилактика и лечение зубов",
    conditions: ["cavity", "treated", "root_canal"],
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#10b981",
    textColor: "#047857",
    badgeBg: "#d1fae5",
    indexNumber: 1,
  },
  {
    id: "surgery",
    label: "Этап 2. Хирургия",
    conditions: ["extraction_needed", "implant", "missing"],
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#2563eb",
    textColor: "#1d4ed8",
    badgeBg: "#dbeafe",
    indexNumber: 2,
  },
  {
    id: "orthopedics",
    label: "Этап 3. Ортопедическое лечение",
    conditions: ["crown"],
    color: "#7c3aed",
    bgColor: "#faf5ff",
    borderColor: "#7c3aed",
    textColor: "#6d28d9",
    badgeBg: "#ede9fe",
    indexNumber: 3,
  },
  {
    id: "other",
    label: "Прочее",
    conditions: [],
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#9ca3af",
    textColor: "#374151",
    badgeBg: "#f3f4f6",
  },
];

export const DEFAULT_STAGE_ORDER = TREATMENT_STAGE_CONFIGS.map((s) => s.id);

const STAGE_TITLE_KEYWORDS: Record<string, string[]> = {
  prevention_treatment: [
    "гигиен", "чистк", "профилактик", "отбелива",
    "кариес", "пломб", "реставрац", "препарир", "герметик", "шлифовк", "полировк",
    "канал", "пульп", "эндодонт", "штифт", "культ", "депульп", "апекс", "корнев", "периодонт",
  ],
  surgery: [
    "удален", "экстракц", "альвеол", "лунк", "кюретаж",
    "имплант", "абатмент", "синус", "остеотом",
  ],
  orthopedics: [
    "коронк", "ортопед", "слепок", "примерк", "цементир", "вкладк", "протез", "люминир",
  ],
};

function normalizeStageKey(stage: string): string {
  return stage.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getTreatmentStageConfig(stageId: string): TreatmentStageConfig | undefined {
  return TREATMENT_STAGE_CONFIGS.find((s) => s.id === stageId);
}

export function conditionToStageId(condition: string | null | undefined): string | null {
  if (!condition) return null;
  for (const stage of TREATMENT_STAGE_CONFIGS) {
    if (stage.conditions.includes(condition)) return stage.id;
  }
  return null;
}

export function titleToStageId(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [stageId, keywords] of Object.entries(STAGE_TITLE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return stageId;
  }
  return null;
}

export function resolveTreatmentItemStageId(item: {
  stage?: string | null;
  condition?: string | null;
  title: string;
}): string {
  const rawStage = item.stage?.trim();
  if (rawStage) {
    const normalized = normalizeStageKey(rawStage);
    if (TREATMENT_STAGE_CONFIGS.some((s) => s.id === normalized)) return normalized;
  }
  return conditionToStageId(item.condition) ?? titleToStageId(item.title) ?? "other";
}

export function discountedItemPrice(price: number, discount = 0): number {
  return price * (1 - discount / 100);
}

export function groupTreatmentPlanItemsByStage(
  items: TreatmentPlanItem[],
): Map<string, TreatmentPlanItem[]> {
  const groups = new Map<string, TreatmentPlanItem[]>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (item.status === "cancelled") continue;
    const stageId = resolveTreatmentItemStageId(item);
    const list = groups.get(stageId) ?? [];
    list.push(item);
    groups.set(stageId, list);
  }
  return groups;
}
