export interface PushDestination {
  path: string;
  label: string;
  group: string;
}

export const PUSH_DESTINATIONS: PushDestination[] = [
  { group: "Основное", path: "/", label: "Главная (дашборд по роли)" },
  { group: "Основное", path: "/patients", label: "Пациенты" },
  { group: "Основное", path: "/patients?view=kanban", label: "Пациенты (канбан)" },
  { group: "Основное", path: "/schedule", label: "Расписание" },
  { group: "Основное", path: "/chat", label: "Чат" },
  { group: "Основное", path: "/menu", label: "Меню" },

  { group: "Дашборды", path: "/dashboard", label: "Дашборд владельца" },
  { group: "Дашборды", path: "/dashboard/admin", label: "Дашборд администратора" },
  { group: "Дашборды", path: "/dashboard/doctor", label: "Дашборд врача" },
  { group: "Дашборды", path: "/dashboard/accountant", label: "Дашборд бухгалтера" },
  { group: "Дашборды", path: "/dashboard/warehouse", label: "Дашборд склада" },

  { group: "Управление", path: "/analytics", label: "Аналитика" },
  { group: "Управление", path: "/financials", label: "Финансы" },
  { group: "Управление", path: "/admin/finance", label: "Финансы (админ)" },
  { group: "Управление", path: "/services", label: "Услуги" },
  { group: "Управление", path: "/users", label: "Сотрудники" },
  { group: "Управление", path: "/users/ratings", label: "Рейтинги врачей" },
  { group: "Управление", path: "/inventory", label: "Инвентарь" },
  { group: "Управление", path: "/warehouse", label: "Склад" },
  { group: "Управление", path: "/payroll/my", label: "Моя зарплата" },
  { group: "Управление", path: "/logs", label: "Журнал действий" },

  { group: "Клиника", path: "/branches", label: "Филиалы и геозоны" },
  { group: "Клиника", path: "/clinic-branches", label: "Филиалы клиники" },
  { group: "Клиника", path: "/channels", label: "Каналы связи" },
  { group: "Клиника", path: "/chatbot", label: "Чат-бот" },
  { group: "Клиника", path: "/contract-templates", label: "Шаблоны договоров" },
  { group: "Клиника", path: "/migration", label: "Миграция данных" },
  { group: "Клиника", path: "/pricing", label: "Тарифы" },
  { group: "Клиника", path: "/ai-credits", label: "AI-кредиты" },

  { group: "Запись", path: "/admin/calendar", label: "Календарь (админ)" },
  { group: "Запись", path: "/admin/appointments/new", label: "Новая запись (админ)" },

  { group: "Прочее", path: "/account-settings", label: "Настройки аккаунта" },
  { group: "Прочее", path: "/tablet/link", label: "Подключение планшета" },
];

export const PUSH_DESTINATION_GROUPS = [
  ...new Set(PUSH_DESTINATIONS.map((d) => d.group)),
];

export const CUSTOM_PUSH_DESTINATION = "__custom__";

export function isKnownPushDestination(path: string): boolean {
  return PUSH_DESTINATIONS.some((d) => d.path === path);
}

export function labelForPushDestination(path: string): string {
  const known = PUSH_DESTINATIONS.find((d) => d.path === path);
  return known ? known.label : path;
}
