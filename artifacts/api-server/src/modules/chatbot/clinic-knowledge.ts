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

/** Patient asks which branches exist / where clinics are located (not a branch pick). */
export function isBranchListInquiry(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /какие\s+(у\s+вас\s+)?(есть\s+)?филиал|список\s+филиал|сколько\s+филиал|где\s+(вы\s+)?находит|какие\s+адрес|какие\s+отделени|адрес(а|ы)?\s+филиал|перечисл(и|ите)\s+филиал|расскаж(и|ите)\s+про\s+филиал/i.test(
      t,
    )
  );
}

const PRICE_INQUIRY_RE =
  /\b(цен|стоим|сколько\s+стоит|прайс|price|cost|теңge|баға|қымбат)\b/i;

/** Patient asks a question instead of advancing the booking step. */
export function isPatientInquiry(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBranchListInquiry(t)) return true;
  if (PRICE_INQUIRY_RE.test(t)) return true;
  if (/\?\s*$/.test(t)) return true;
  return /^(какие|сколько|где|когда|почему|зачем|можно\s+ли|расскаж|объясн|что\s+такое|как\s+(долго|работает|находится|записаться))/i.test(
    t,
  );
}

export function isPriceInquiry(text: string): boolean {
  return PRICE_INQUIRY_RE.test(text.trim());
}

/** Mind-map / FSM node where the patient must pick a branch before advancing. */
export function isBranchSelectionNode(nodeId: string, fsmState?: string): boolean {
  return nodeId === "step2-branch" || fsmState === "collect_branch";
}

/** Server-side reply when the patient is on branch step but did not pick a branch yet. */
export function resolveBranchStepClarificationReply(opts: {
  messageText: string;
  selectedBranch?: string;
  clinicBranchNames: string[];
  knowledgeContext?: string;
}): string {
  const { messageText, selectedBranch, clinicBranchNames, knowledgeContext } = opts;
  const hasKnowledge = hasClinicKnowledge(knowledgeContext);

  if (isBranchListInquiry(messageText) && clinicBranchNames.length > 1) {
    return buildBranchListMessage(clinicBranchNames);
  }

  if (!selectedBranch && clinicBranchNames.length > 1) {
    return buildBranchPromptFallback(hasKnowledge, clinicBranchNames);
  }

  return buildBranchPromptFallback(hasKnowledge, clinicBranchNames);
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

/** Resolve a branch from the official list using number, ordinal, or name match. */
export function resolveOfficialBranchFromMessage(
  messageText: string,
  officialBranches: string[],
): string | null {
  const trimmed = messageText.trim();
  if (!trimmed || officialBranches.length === 0) return null;

  const branchIndex = resolveBranchIndex(trimmed, officialBranches);
  if (branchIndex !== null && officialBranches[branchIndex]) {
    return officialBranches[branchIndex]!;
  }

  return matchOfficialBranch(trimmed, officialBranches);
}

/** Whether the patient message picks a branch (already saved or in this turn's text). */
export function branchChoiceResolved(
  messageText: string,
  selectedBranch: string | undefined,
  officialBranches: string[],
): boolean {
  if (selectedBranch) return true;
  return resolveOfficialBranchFromMessage(messageText, officialBranches) !== null;
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

  if (isBranchListInquiry(trimmed)) return null;

  const official = options?.officialBranches ?? [];
  const fromOfficial = resolveOfficialBranchFromMessage(trimmed, official);
  if (fromOfficial) return fromOfficial;

  if (official.length > 0 || isUsableClinicKnowledge(knowledgeContext)) {
    return extractBranch(trimmed, knowledgeContext, official).catch(() => null);
  }

  if (options?.allowFreeText && trimmed.length > 3) {
    return trimmed.slice(0, 200);
  }

  return null;
}
