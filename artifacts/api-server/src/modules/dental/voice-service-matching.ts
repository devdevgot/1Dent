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
  "нужно", "надо", "требует", "стоит", "поставить", "делать",
  "сделать", "лечение", "лечить", "пациент", "врач",
  "будем", "использовать", "такую", "такой", "такое", "такие",
  "будет", "нужна", "нужен", "нужны",
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

/** Extra stems to expand spoken procedure / diagnosis matching. */
const DENTAL_SYNONYMS: Record<string, string[]> = {
  пломб: ["plomba", "plomb", "filling", "composite", "композит", "restoration", "to'ldirish", "толтыру", "toltyru"],
  композит: ["пломб", "composite", "filling", "restoration", "plomba"],
  кариес: ["karies", "caries", "cavity", "шүкір", "churk"],
  коронк: ["crown", "kappa", "таж", "protez", "протез"],
  имплант: ["implant", "osstem", "straumann", "dentium"],
  удален: ["extraction", "удаление", "olish", "алып", "extract"],
  пульп: ["endodont", "эндодонт", "root", "kanal", "канал"],
  чистк: ["scaling", "hygiene", "гигиен", "tozalash"],
  отбел: ["bleach", "whitening", "aqart"],
};

const CONDITION_HINT_STEMS: Record<string, string[]> = {
  cavity: ["пломб", "композит", "реставрац", "кариес", "karies", "caries", "filling"],
  treated: ["пломб", "композит", "реставрац", "filling"],
  root_canal: ["пульп", "эндодонт", "канал", "root", "endodont"],
  crown: ["коронк", "crown", "керам", "циркон", "protez"],
  implant: ["имплант", "implant", "абатмент", "коронк"],
  extraction_needed: ["удален", "extraction", "хирург"],
  missing: ["имплант", "мост", "протез", "съемн", "bridge"],
};

const MIN_SCORE = 2;
const MAX_SUGGESTIONS = 6;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[''`]/g, "'")
    .replace(/[^а-яa-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeVoiceText(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function expandQueryWords(words: string[]): string[] {
  const expanded = new Set(words);
  for (const word of words) {
    for (const [stem, synonyms] of Object.entries(DENTAL_SYNONYMS)) {
      if (word.includes(stem) || stem.includes(word)) {
        for (const syn of synonyms) expanded.add(syn);
      }
      for (const syn of synonyms) {
        if (word.includes(syn) || syn.includes(word)) expanded.add(stem);
      }
    }
  }
  return [...expanded];
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

function extractTranscriptExcerpt(transcript: string, fdi?: number): string {
  if (!transcript.trim() || !fdi) return "";
  const fdiStr = String(fdi);
  const normalized = transcript;
  const idx = normalized.search(new RegExp(`\\b${fdiStr}\\b`));
  if (idx < 0) return "";
  const start = Math.max(0, idx - 20);
  const end = Math.min(normalized.length, idx + 140);
  return normalized.slice(start, end).trim();
}

function buildSearchText(params: {
  transcript?: string;
  diagnosisText?: string;
  notes?: string;
  spokenProcedure?: string;
  fdi?: number;
}): string {
  const parts = [
    params.spokenProcedure,
    params.diagnosisText,
    params.notes,
    extractTranscriptExcerpt(params.transcript ?? "", params.fdi),
  ].filter((p) => Boolean(p?.trim()));

  return parts.join(" ");
}

export function scoreVoiceServiceMatch(
  searchText: string,
  template: VoiceServiceTemplate,
  condition: string,
): number {
  if (!searchText.trim()) return 0;
  if (isIrrelevantForCondition(template, condition, searchText)) return 0;

  const queryWords = expandQueryWords(tokenizeVoiceText(searchText));
  if (queryWords.length === 0) return 0;

  const nameWords = templateTokens(template);
  const haystack = `${template.name} ${template.description ?? ""}`.toLowerCase();
  let score = 0;
  let matchedQueryWords = 0;

  for (const qw of queryWords) {
    let wordMatched = false;
    for (const nw of nameWords) {
      if (nw === qw) {
        score += 6;
        wordMatched = true;
      } else if (nw.startsWith(qw) || qw.startsWith(nw)) {
        score += 4;
        wordMatched = true;
      } else if (nw.includes(qw) || qw.includes(nw)) {
        score += 3;
        wordMatched = true;
      }
    }
    if (!wordMatched && haystack.includes(qw)) {
      score += 2;
      wordMatched = true;
    }
    if (wordMatched) matchedQueryWords++;
  }

  const hints = CONDITION_HINT_STEMS[condition] ?? [];
  for (const stem of hints) {
    if (haystack.includes(stem) && stemMatches(searchText, stem)) score += 2;
  }

  if (matchedQueryWords === 0) return 0;
  score += matchedQueryWords;
  return score;
}

function scorePool(
  pool: VoiceServiceTemplate[],
  searchText: string,
  condition: string,
): Array<{ t: VoiceServiceTemplate; score: number }> {
  return pool
    .map((t) => ({ t, score: scoreVoiceServiceMatch(searchText, t, condition) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

export function matchVoiceServices(params: {
  transcript?: string;
  condition: string;
  diagnosisText?: string;
  notes?: string;
  spokenProcedure?: string;
  fdi?: number;
  templates: VoiceServiceTemplate[];
  category?: string;
}): { suggestions: VoiceServiceMatch[]; bestMatchId?: string } {
  const searchText = buildSearchText(params);
  const priced = params.templates.filter((t) => t.defaultPrice > 0);

  const categoryPool = params.category
    ? priced.filter((t) => t.category === params.category)
    : priced;

  let scored = scorePool(categoryPool, searchText, params.condition);

  if (scored.length === 0 && params.category) {
    scored = scorePool(priced, searchText, params.condition);
  }

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
