export type VoiceServiceTemplate = {
  id: string;
  name: string;
  defaultPrice: number;
  description?: string | null;
  category: string;
};

export type VoiceServiceMatch = {
  id: string;
  name: string;
  defaultPrice: number;
};

const STOP_WORDS = new Set([
  "зуб", "зуба", "зубы", "зубов", "зубу", "зубом",
  "верхний", "верхняя", "верхнее", "нижний", "нижняя", "нижнее",
  "левый", "левая", "левое", "правый", "правая", "правое",
  "первый", "второй", "третий", "четвертый", "четвёртый", "пятый",
  "шестой", "седьмой", "восьмой",
  "этот", "эта", "это", "тот", "та", "там", "тут", "есть", "будет",
  "нужно", "надо", "требует", "стоит", "стоит", "поставить", "делать",
  "сделать", "лечение", "лечить", "пациент", "врач",
]);

/** Stems excluded for a condition unless the stem appears in the spoken search text. */
const CONDITION_IRRELEVANT_STEMS: Record<string, string[]> = {
  cavity: ["штифт", "анкерн", "имплант", "удален", "экстрак", "коронк", "протез", "мост", "бюгел", "синус", "пульп", "эндодонт"],
  treated: ["имплант", "удален", "экстрак", "штифт", "анкерн"],
  root_canal: ["имплант", "удален", "экстрак", "протез", "мост", "бюгел"],
  crown: ["имплант", "удален", "экстрак", "пломб", "штифт", "анкерн", "кариес"],
  implant: ["пломб", "кариес", "штифт", "анкерн", "удален", "экстрак"],
  extraction_needed: ["пломб", "коронк", "имплант", "протез", "мост", "реставрац"],
  missing: ["пломб", "кариес", "штифт", "анкерн", "пульп"],
};

const MIN_SCORE = 3;
const MAX_SUGGESTIONS = 5;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeVoiceText(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function templateTokens(template: VoiceServiceTemplate): string[] {
  const raw = `${template.name} ${template.description ?? ""}`;
  return normalizeText(raw).split(/\s+/).filter((w) => w.length > 2);
}

function stemMatches(text: string, stem: string): boolean {
  return normalizeText(text).includes(stem);
}

function isIrrelevantForCondition(
  template: VoiceServiceTemplate,
  condition: string,
  searchText: string,
): boolean {
  const stems = CONDITION_IRRELEVANT_STEMS[condition];
  if (!stems) return false;
  const haystack = `${template.name} ${template.description ?? ""}`.toLowerCase();
  return stems.some((stem) => haystack.includes(stem) && !stemMatches(searchText, stem));
}

export function scoreVoiceServiceMatch(
  searchText: string,
  template: VoiceServiceTemplate,
  condition: string,
): number {
  if (!searchText.trim()) return 0;
  if (isIrrelevantForCondition(template, condition, searchText)) return 0;

  const queryWords = tokenizeVoiceText(searchText);
  if (queryWords.length === 0) return 0;

  const nameWords = templateTokens(template);
  let score = 0;
  let matchedQueryWords = 0;

  for (const qw of queryWords) {
    let wordMatched = false;
    for (const nw of nameWords) {
      if (nw === qw) {
        score += 5;
        wordMatched = true;
      } else if (nw.startsWith(qw) || qw.startsWith(nw)) {
        score += 3;
        wordMatched = true;
      } else if (nw.includes(qw) || qw.includes(nw)) {
        score += 2;
        wordMatched = true;
      }
    }
    if (wordMatched) matchedQueryWords++;
  }

  if (matchedQueryWords === 0) return 0;
  score += matchedQueryWords;
  return score;
}

export function matchVoiceServices(params: {
  transcript: string;
  condition: string;
  diagnosisText?: string;
  notes?: string;
  spokenProcedure?: string;
  templates: VoiceServiceTemplate[];
  category?: string;
}): { suggestions: VoiceServiceMatch[]; bestMatchId?: string } {
  const searchText = [
    params.transcript,
    params.spokenProcedure,
    params.diagnosisText,
    params.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const pool = params.category
    ? params.templates.filter((t) => t.category === params.category && t.defaultPrice > 0)
    : params.templates.filter((t) => t.defaultPrice > 0);

  const scored = pool
    .map((t) => ({ t, score: scoreVoiceServiceMatch(searchText, t, params.condition) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, MAX_SUGGESTIONS);
  const best = top[0];

  return {
    suggestions: top.map((s) => ({
      id: s.t.id,
      name: s.t.name,
      defaultPrice: s.t.defaultPrice,
    })),
    bestMatchId: best ? best.t.id : undefined,
  };
}
