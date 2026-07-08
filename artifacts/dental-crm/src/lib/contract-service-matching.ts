/**
 * Mirrors backend matchServiceToSubcategory (contracts.repository.ts).
 * Keep in sync when backend matching rules change.
 */
export function matchServiceToSubcategory(title: string): string[] {
  const lower = title.toLowerCase();
  const matched: string[] = [];

  if (
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет.")) &&
    (lower.includes("терап") || lower.includes("лечен") || lower.includes("кариес") || lower.includes("пульп") || lower.includes("пломб") || lower.includes("десн") || lower.includes("парод"))
  ) {
    matched.push("Детская терапия");
  }

  if (
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет.")) &&
    (lower.includes("хирур") || lower.includes("удален") || lower.includes("экстрак"))
  ) {
    matched.push("Детская хирургия");
  }

  if (lower.includes("синус") || lower.includes("sinus")) {
    matched.push("Синуслифтинг");
  }

  if (lower.includes("имплант") || lower.includes("implant")) {
    matched.push("Имплантация");
  }

  if (
    (lower.includes("ортодонт") || lower.includes("брекет") || lower.includes("элайнер") || lower.includes("пластинк") || lower.includes("капп")) &&
    (lower.includes("детск") || lower.includes("ребен") || lower.includes("молочн") || lower.includes("дет."))
  ) {
    matched.push("Ортодонтия для детей");
  }

  if (
    (lower.includes("ортодонт") || lower.includes("брекет") || lower.includes("элайнер") || lower.includes("капп")) &&
    !matched.includes("Ортодонтия для детей")
  ) {
    matched.push("Ортодонтия для взрослых");
  }

  if (lower.includes("видир") || lower.includes("винир") || lower.includes("veneer")) {
    matched.push("Виниры");
  }

  if (lower.includes("съемн") || lower.includes("бюгел") || (lower.includes("протез") && lower.includes("съем"))) {
    matched.push("Съемные констукций");
  }

  if (
    (lower.includes("коронка") || lower.includes("металлокерам") || lower.includes("циркон") || lower.includes("несъемн") || lower.includes("мостовид") || lower.includes("протез")) &&
    !matched.includes("Съемные констукций")
  ) {
    matched.push("Несъемные контрукций");
  }

  if (lower.includes("глубок") && lower.includes("кариес")) {
    matched.push("Глубокий карис");
  }

  if (
    (lower.includes("средн") && lower.includes("кариес")) ||
    (lower.includes("поверхн") && lower.includes("кариес")) ||
    lower.includes("пломб") ||
    ((lower.includes("кариес") || lower.includes("реставрац")) && !lower.includes("глубок"))
  ) {
    matched.push("Средний карис");
  }

  if (lower.includes("депульп")) {
    matched.push("Депульпирование зуба");
  }

  if (lower.includes("клиновид")) {
    matched.push("Клиновидный дефект");
  }

  if (
    lower.includes("десен") ||
    lower.includes("пародонт") ||
    lower.includes("вектор") ||
    lower.includes("гигиен") ||
    lower.includes("чистк") ||
    (lower.includes("лечение") && lower.includes("дес"))
  ) {
    matched.push("Лечение десен");
  }

  if (lower.includes("периодонтит") || lower.includes("периодонт")) {
    matched.push("Периодонтит");
  }

  if (lower.includes("пульпит")) {
    matched.push("Пулпит");
  }

  if (
    !matched.includes("Пулпит") &&
    !matched.includes("Депульпирование зуба") &&
    !matched.includes("Периодонтит") &&
    (lower.includes("канал") || lower.includes("корнев") || lower.includes("эндодонт") || lower.includes("штифт"))
  ) {
    matched.push("Пулпит");
  }

  if (
    lower.includes("лечение зуба") ||
    lower.includes("терапевт") ||
    (lower.includes("терапи") && !lower.includes("ортодонт"))
  ) {
    if (!matched.some((m) => m.includes("карис") || m === "Пулпит" || m === "Периодонтит" || m === "Депульпирование зуба")) {
      matched.push("Средний карис");
    }
  }

  if (lower.includes("резекц")) {
    matched.push("Резекция верхушки корня");
  }

  if ((lower.includes("удален") || lower.includes("экстрак")) && !matched.includes("Детская хирургия") && !lower.includes("молочн")) {
    matched.push("Удаление зуба");
  }

  if (
    (lower.includes("операц") || lower.includes("хирург") || lower.includes("пластика") || lower.includes("иссечен")) &&
    !matched.includes("Удаление зуба") &&
    !matched.includes("Резекция верхушки корня") &&
    !matched.includes("Детская хирургия")
  ) {
    matched.push("Операций");
  }

  return matched;
}

/** Collect unique subcategories matched from a list of service/plan item titles. */
export function matchSubcategoriesFromTitles(titles: string[]): string[] {
  const set = new Set<string>();
  for (const title of titles) {
    matchServiceToSubcategory(title).forEach((sc) => set.add(sc));
  }
  return [...set];
}
