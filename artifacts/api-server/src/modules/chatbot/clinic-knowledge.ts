/** Whether clinic has parsed knowledge sources (site, links, documents). */
export function hasClinicKnowledge(knowledgeContext: string | undefined | null): boolean {
  return isUsableClinicKnowledge(knowledgeContext);
}

const KNOWLEDGE_PLACEHOLDER_PATTERNS = [
  /sign in to continue/i,
  /log in to continue/i,
  /access denied/i,
  /page not found/i,
  /404 not found/i,
  /enable javascript/i,
  /captcha/i,
  /checking your browser/i,
  /please wait while/i,
  /telegram:\s*join/i,
  /this channel is private/i,
];

/** Filters out stub/empty scraped pages so we don't treat them as clinic facts. */
export function isUsableClinicKnowledge(knowledgeContext: string | undefined | null): boolean {
  const trimmed = knowledgeContext?.trim();
  if (!trimmed || trimmed.length < 80) return false;
  for (const pattern of KNOWLEDGE_PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

export function formatOfficialBranchesForPrompt(branchNames: string[]): string {
  if (branchNames.length === 0) return "";
  const list = branchNames.map((name) => `• ${name}`).join("\n");
  return `\n\nОФИЦИАЛЬНЫЕ ФИЛИАЛЫ КЛИНИКИ (единственный допустимый список — не добавляй другие адреса):\n${list}`;
}

export function buildBranchPromptFallback(
  hasKnowledge: boolean,
  officialBranches: string[] = [],
): string {
  if (officialBranches.length === 1) {
    return `Запишем вас в филиал «${officialBranches[0]}»?`;
  }
  if (officialBranches.length > 1) {
    return buildBranchListMessage(officialBranches);
  }
  if (hasKnowledge) {
    return "Какой адрес или филиал вам удобнее?";
  }
  return "Подскажите, какой адрес вам удобнее?";
}

/** All branch addresses in one numbered message. */
export function buildBranchListMessage(branches: string[]): string {
  if (branches.length === 0) return "Подскажите, какой адрес вам удобнее?";
  if (branches.length === 1) return `Запишем вас в филиал «${branches[0]}»?`;

  const numbered = branches
    .map((b, i) => `${i + 1}️⃣ ${b}`)
    .join("\n");

  return `Наши филиалы:\n\n${numbered}\n\nНапишите номер или название — куда вам удобнее?`;
}

const ORDINAL_BRANCH_PATTERNS: Array<{ re: RegExp; index: number }> = [
  { re: /^1$|^перв(ый|ая|ое|ую)?$|^бирінші$/i, index: 0 },
  { re: /^2$|^втор(ой|ая|ое|ую)?$|^екінші$/i, index: 1 },
  { re: /^3$|^трет(ий|ья|ье|ью)?$|^үшінші$/i, index: 2 },
  { re: /^4$|^четверт(ый|ая|ое|ую)?$|^төртінші$/i, index: 3 },
  { re: /^5$|^пят(ый|ая|ое|ую)?$|^бесінші$/i, index: 4 },
];

export function resolveBranchIndex(text: string, branches: string[]): number | null {
  const trimmed = text.trim();
  if (!trimmed || branches.length === 0) return null;

  const num = parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= branches.length) {
    return num - 1;
  }

  for (const { re, index } of ORDINAL_BRANCH_PATTERNS) {
    if (index < branches.length && re.test(trimmed)) return index;
  }

  return null;
}

export function buildSymptomsPromptFallback(): string {
  return "Есть ли сейчас боль или дискомфорт?";
}

export function buildRefusalFallback(): string {
  return "Спасибо за обращение! Если понадобится помощь — напишите нам 😊";
}

function matchOfficialBranch(text: string, officialBranches: string[]): string | null {
  const lower = text.toLowerCase();
  for (const branch of officialBranches) {
    const branchLower = branch.toLowerCase();
    if (lower.includes(branchLower) || branchLower.includes(lower.trim())) {
      return branch;
    }
  }
  return null;
}

/** Resolve branch only from clinic materials, or free-text when materials are absent. */
export async function resolveBranchFromMessage(
  messageText: string,
  knowledgeContext: string,
  extractBranch: (text: string, ctx: string, official?: string[]) => Promise<string | null>,
  options?: { allowFreeText?: boolean; officialBranches?: string[] },
): Promise<string | null> {
  const trimmed = messageText.trim();
  if (!trimmed) return null;

  const official = options?.officialBranches ?? [];
  const branchIndex = resolveBranchIndex(trimmed, official);
  if (branchIndex !== null && official[branchIndex]) {
    return official[branchIndex]!;
  }

  const fromOfficial = matchOfficialBranch(trimmed, official);
  if (fromOfficial) return fromOfficial;

  if (official.length > 0 || isUsableClinicKnowledge(knowledgeContext)) {
    return extractBranch(trimmed, knowledgeContext, official).catch(() => null);
  }

  if (options?.allowFreeText && trimmed.length > 3) {
    return trimmed.slice(0, 200);
  }

  return null;
}
