export type ServiceType =
  | "therapy"
  | "hygiene"
  | "surgery"
  | "orthodontics"
  | "orthopedics"
  | "consultation";

/** Cyrillic-friendly keyword patterns (no \\b — JS word boundaries ignore Cyrillic). */
const SERVICE_KEYWORD_PATTERNS: Array<{ type: ServiceType; pattern: RegExp }> = [
  {
    type: "therapy",
    pattern:
      /(болит\s+зуб|болит\s+зубы|зуб\s+болит|тиск\s+ауыра|тіс\s+ауыра|тис\s+аура|кариес|пломб|пульпит|чувствительн)/i,
  },
  {
    type: "hygiene",
    pattern: /(чистк|гигиен|профилактик|налёт|налет|камн|тазалау|тазалоу|отбелив)/i,
  },
  {
    type: "surgery",
    pattern: /(удалени|удалить|снять\s+зуб|жулу|жұлу|суыру|имплант|синус)/i,
  },
  {
    type: "orthodontics",
    pattern: /(брекет|элайнер|прикус|выравнив|тіс\s+түзету|тис\s+тузет)/i,
  },
  {
    type: "orthopedics",
    pattern: /(коронк|мост|протез|винир|реставрац)/i,
  },
  {
    type: "consultation",
    pattern: /(консультац|консульт|осмотр|приём|прием|кеңес|кенес|тексеру|қаралу|каралу)/i,
  },
];

export function detectServiceTypeFromKeywords(text: string): ServiceType | null {
  const normalized = text.trim();
  if (!normalized) return null;
  for (const { type, pattern } of SERVICE_KEYWORD_PATTERNS) {
    if (pattern.test(normalized)) return type;
  }
  return null;
}
