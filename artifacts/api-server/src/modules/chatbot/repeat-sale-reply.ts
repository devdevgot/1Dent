export function isMarketingOptOutReply(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const optOutKeywords = ["стоп", "stop", "отписаться", "отписаться от рассылки", "не пишите", "unsubscribe"];
  return optOutKeywords.some((kw) => lower === kw || lower.startsWith(kw + " "));
}

export function isExplicitNegativeRepeatSaleReply(text: string): boolean {
  const lower = text.toLowerCase();
  if (isMarketingOptOutReply(text)) return true;
  const negativeKeywords = [
    "нет", "не надо", "не хочу", "не интерес", "неактуал", "жоқ", "кет", "отказ", "no", "stop",
  ];
  return negativeKeywords.some((neg) => lower.includes(neg));
}

export function isNeutralRepeatSaleQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.includes("?")) return true;
  const questionWords = [
    "сколько", "когда", "цена", "стоимость", "можно", "как", "где", "во сколько", "есть ли",
    "қашан", "қанша",
  ];
  return questionWords.some((word) => lower.includes(word));
}

export function isPositiveRepeatSaleReplyKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  const positiveKeywords = [
    "да", "давайте", "запис", "хочу", "время", "ок", "хорошо", "иә", "жазы", "кел", "прийти", "приду",
    "yes", "ok", "agree", "продолж", "continue",
  ];
  const negativeKeywords = ["нет", "не надо", "не хочу", "жоқ", "кет", "отказ", "no", "stop"];
  for (const neg of negativeKeywords) {
    if (lower.includes(neg)) return false;
  }
  for (const pos of positiveKeywords) {
    if (lower.includes(pos)) return true;
  }
  return false;
}
