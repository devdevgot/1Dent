import { Rocket, Sparkles, Star, type LucideIcon } from "lucide-react";

export type PaidPlanId = "starter" | "professional" | "enterprise";
export type PlanId = "free" | PaidPlanId;

export type ComparisonRowKey =
  | "staff"
  | "branches"
  | "aiCredits"
  | "chatbotDialogs"
  | "documentTemplates"
  | "channelAnalytics"
  | "prioritySupport"
  | "accountManager";

export interface ComparisonRow {
  key: ComparisonRowKey;
  label: string;
  hint?: string;
  values: Record<PaidPlanId, string | boolean>;
}

export interface ComparisonSection {
  title: string;
  rows: ComparisonRow[];
}

export const PLAN_SHORT_NAMES: Record<PaidPlanId, string> = {
  starter: "START",
  professional: "PRO",
  enterprise: "ENT",
};

export interface PlanConfig {
  id: PaidPlanId;
  name: string;
  price: number;
  subtitle: string;
  audience: string;
  icon: LucideIcon;
  badge?: string;
  recommended?: boolean;
  includesFrom?: string;
  deltaLabel?: string;
  highlights: string[];
  ctaLabel: string;
  iconBg: string;
  accentColor: string;
  gradient: string;
}

export const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: "Без тарифа",
  starter: "START",
  professional: "PRO",
  enterprise: "ENTERPRISE",
};

export const PLAN_GUIDE: { plan: PaidPlanId; label: string; hint: string }[] = [
  { plan: "starter", label: "START", hint: "До 5 сотрудников, 1 филиал" },
  { plan: "professional", label: "PRO", hint: "До 15 сотрудников, 3 филиала" },
  { plan: "enterprise", label: "ENTERPRISE", hint: "До 30 сотрудников, 10 филиалов" },
];

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "START",
    price: 99000,
    subtitle: "Для небольших стоматологий",
    audience: "До 5 сотрудников · 1 филиал",
    icon: Sparkles,
    highlights: [
      "Полный набор инструментов клиники",
      "До 5 сотрудников · 1 филиал",
    ],
    ctaLabel: "Выбрать START",
    iconBg: "bg-[#1f75fe]/15 text-[#1f75fe]",
    accentColor: "#1f75fe",
    gradient: "from-[#e0f2fe]/40 to-white",
  },
  {
    id: "professional",
    name: "PRO",
    price: 159000,
    subtitle: "Оптимален для большинства клиник",
    audience: "До 15 сотрудников · до 3 филиалов",
    icon: Star,
    badge: "Рекомендуемый",
    recommended: true,
    includesFrom: "START",
    deltaLabel: "+60 000 ₸ к START",
    highlights: [
      "Всё из START · до 15 сотрудников",
      "3 филиала · 6× больше AI и чат-бот",
    ],
    ctaLabel: "Подключить PRO",
    iconBg: "bg-[#1f75fe]/15 text-[#1f75fe]",
    accentColor: "#1f75fe",
    gradient: "from-[#1f75fe]/8 via-[#e0f2fe]/30 to-white",
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    price: 199000,
    subtitle: "Для крупных клиник и сетей",
    audience: "До 30 сотрудников · до 10 филиалов",
    icon: Rocket,
    includesFrom: "PRO",
    deltaLabel: "+40 000 ₸ к PRO",
    highlights: [
      "Всё из PRO · до 10 филиалов",
      "До 30 сотрудников · персональный менеджер",
    ],
    ctaLabel: "Обсудить ENTERPRISE",
    iconBg: "bg-[#fef3c7] text-[#d97706]",
    accentColor: "#d97706",
    gradient: "from-[#fef3c7]/40 to-white",
  },
];

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    key: "staff",
    label: "Сотрудники",
    values: { starter: "до 5", professional: "до 15", enterprise: "до 30" },
  },
  {
    key: "branches",
    label: "Филиалы",
    values: { starter: "1", professional: "3", enterprise: "10" },
  },
  {
    key: "aiCredits",
    label: "AI-кредиты",
    hint: "в месяц",
    values: { starter: "500", professional: "3 000", enterprise: "7 000" },
  },
  {
    key: "chatbotDialogs",
    label: "Чат-бот",
    hint: "диалогов / мес",
    values: { starter: "100", professional: "1 000", enterprise: "5 000" },
  },
  {
    key: "documentTemplates",
    label: "Шаблоны",
    values: { starter: "5", professional: "30", enterprise: "∞" },
  },
  {
    key: "channelAnalytics",
    label: "Аналитика каналов",
    values: { starter: false, professional: true, enterprise: true },
  },
  {
    key: "prioritySupport",
    label: "Приор. поддержка",
    values: { starter: false, professional: true, enterprise: true },
  },
  {
    key: "accountManager",
    label: "Менеджер",
    values: { starter: false, professional: false, enterprise: true },
  },
];

export const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: "Лимиты",
    rows: COMPARISON_ROWS.filter((row) =>
      ["staff", "branches", "aiCredits", "chatbotDialogs", "documentTemplates"].includes(row.key),
    ),
  },
  {
    title: "Возможности",
    rows: COMPARISON_ROWS.filter((row) =>
      ["channelAnalytics", "prioritySupport", "accountManager"].includes(row.key),
    ),
  },
];

export const COMMON_FEATURES_SUMMARY =
  "Пациенты, расписание, WhatsApp, финансы, ИИ, договоры и облачное хранение";

export const COMMON_FEATURES = [
  "Полноценная система управления стоматологией",
  "База пациентов и история лечения",
  "Запись пациентов и расписание врачей",
  "WhatsApp для общения с пациентами",
  "Финансовый учёт и базовая аналитика",
  "Контроль эффективности сотрудников",
  "Электронные договоры",
  "Автоматические рассылки пациентам",
  "Искусственный интеллект для ежедневной работы",
  "Облачное хранение данных",
  "Регулярные обновления системы",
  "Защита и резервное копирование данных",
];

export function formatPlanPrice(price: number): string {
  return price.toLocaleString("ru-KZ");
}

/** Разовый платёж за внедрение (не входит в ежемесячную подписку) */
export const IMPLEMENTATION_FEE = 1_000_000;

export const IMPLEMENTATION_INCLUDES = [
  "Настройка системы под вашу клинику",
  "Перенос данных и обучение команды",
  "Подключение WhatsApp и базовых интеграций",
] as const;
