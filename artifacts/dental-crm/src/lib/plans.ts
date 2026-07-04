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
  values: Record<PaidPlanId, string | boolean>;
}

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
  { plan: "starter", label: "START", hint: "До 10 сотрудников, одна клиника" },
  { plan: "professional", label: "PRO", hint: "10–30 сотрудников, аналитика и больше AI" },
  { plan: "enterprise", label: "ENTERPRISE", hint: "Сеть филиалов, персональное сопровождение" },
];

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "START",
    price: 99000,
    subtitle: "Для небольших стоматологий",
    audience: "До 10 сотрудников · 1 филиал",
    icon: Sparkles,
    highlights: [
      "Полный набор инструментов клиники",
      "До 10 сотрудников · 1 филиал",
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
    audience: "10–30 сотрудников · 1 филиал",
    icon: Star,
    badge: "Рекомендуемый",
    recommended: true,
    includesFrom: "START",
    deltaLabel: "+60 000 ₸ к START",
    highlights: [
      "Всё из START · до 30 сотрудников",
      "5× больше AI и чат-бот · аналитика каналов",
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
    audience: "Сеть филиалов · без лимита сотрудников",
    icon: Rocket,
    includesFrom: "PRO",
    deltaLabel: "+40 000 ₸ к PRO",
    highlights: [
      "Всё из PRO · несколько филиалов",
      "Безлимит сотрудников · персональный менеджер",
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
    values: { starter: "до 10", professional: "до 30", enterprise: "безлимит" },
  },
  {
    key: "branches",
    label: "Филиалы",
    values: { starter: "1", professional: "1", enterprise: "несколько" },
  },
  {
    key: "aiCredits",
    label: "AI-кредиты / мес",
    values: { starter: "1 000", professional: "5 000", enterprise: "15 000" },
  },
  {
    key: "chatbotDialogs",
    label: "Диалоги чат-бота / мес",
    values: { starter: "300", professional: "1 500", enterprise: "5 000" },
  },
  {
    key: "documentTemplates",
    label: "Шаблоны документов",
    values: { starter: "до 5", professional: "до 20", enterprise: "безлимит" },
  },
  {
    key: "channelAnalytics",
    label: "Аналитика каналов",
    values: { starter: false, professional: true, enterprise: true },
  },
  {
    key: "prioritySupport",
    label: "Приоритетная поддержка",
    values: { starter: false, professional: true, enterprise: true },
  },
  {
    key: "accountManager",
    label: "Персональный менеджер",
    values: { starter: false, professional: false, enterprise: true },
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
