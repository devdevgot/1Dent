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
    return `Какой филиал удобнее: ${officialBranches.join(" или ")}?`;
  }
  if (hasKnowledge) {
    return "Какой адрес или филиал вам удобнее?";
  }
  return "Подскажите, какой адрес вам удобнее?";
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
