/** Whether clinic has parsed knowledge sources (site, links, documents). */
export function hasClinicKnowledge(knowledgeContext: string | undefined | null): boolean {
  return !!knowledgeContext?.trim();
}

export function buildBranchPromptFallback(hasKnowledge: boolean): string {
  if (hasKnowledge) {
    return "Какой филиал или адрес вам удобнее? Перечислю варианты из информации о клинике.";
  }
  return "Подскажите, какой филиал или адрес вам удобнее?";
}

export function buildSymptomsPromptFallback(): string {
  return (
    "Подскажите, пожалуйста:\n" +
    "— что именно беспокоит?\n" +
    "— есть ли боль или дискомфорт?\n" +
    "— визит плановый или срочный?"
  );
}

export function buildRefusalFallback(): string {
  return (
    "Спасибо за обращение! Мы всегда готовы помочь 😊\n\n" +
    "Если понадобится помощь — напишите нам. Следите за акциями клиники."
  );
}

/** Resolve branch only from clinic materials, or free-text when materials are absent. */
export async function resolveBranchFromMessage(
  messageText: string,
  knowledgeContext: string,
  extractBranch: (text: string, ctx: string) => Promise<string | null>,
  options?: { allowFreeText?: boolean },
): Promise<string | null> {
  const trimmed = messageText.trim();
  if (!trimmed) return null;

  if (hasClinicKnowledge(knowledgeContext)) {
    return extractBranch(trimmed, knowledgeContext).catch(() => null);
  }

  if (options?.allowFreeText && trimmed.length > 3) {
    return trimmed.slice(0, 200);
  }

  return null;
}
