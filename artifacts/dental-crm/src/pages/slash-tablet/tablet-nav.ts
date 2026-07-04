import {
  Users, Calendar, MessageCircle, BarChart3, Wallet,
  ClipboardList, LayoutGrid, Monitor, FileText, Plus,
} from "lucide-react";
import type { TabletRole } from "./tablet-session";

export type TabletNavId =
  | "patients"
  | "schedule"
  | "chat"
  | "analytics"
  | "payroll"
  | "services"
  | "contracts"
  | "menu";

export interface TabletNavItem {
  id: TabletNavId;
  label: string;
  icon: React.ElementType;
  path: string;
  roles: TabletRole[];
  /** Только врач (не владелец) */
  doctorOnly?: boolean;
}

export const TABLET_NAV: TabletNavItem[] = [
  { id: "patients",  label: "Пациенты",    icon: Users,         path: "/tablet/workspace/patients",  roles: ["doctor", "owner", "admin"] },
  { id: "schedule",  label: "Расписание",  icon: Calendar,    path: "/tablet/workspace/schedule",  roles: ["doctor", "owner"] },
  { id: "chat",      label: "Чат",         icon: MessageCircle, path: "/tablet/workspace/chat",    roles: ["doctor", "owner", "admin"] },
  { id: "analytics", label: "Аналитика",   icon: BarChart3,     path: "/tablet/workspace/analytics", roles: ["doctor", "owner"] },
  { id: "payroll",   label: "Зарплата",    icon: Wallet,        path: "/tablet/workspace/payroll", roles: ["doctor", "owner"] },
  { id: "services",  label: "Услуги",      icon: ClipboardList, path: "/tablet/workspace/services", roles: ["doctor", "owner", "admin"] },
  { id: "contracts", label: "Договоры",      icon: FileText,      path: "/tablet/workspace/contracts", roles: ["doctor", "owner", "admin"] },
  { id: "menu",      label: "Ещё",         icon: LayoutGrid,    path: "/tablet/workspace/menu",    roles: ["doctor", "owner", "admin"] },
];

export function getTabletNav(role: TabletRole): TabletNavItem[] {
  return TABLET_NAV.filter((item) => item.roles.includes(role));
}

export const TABLET_QUICK_ACTIONS = [
  { label: "Новый пациент", icon: Plus, path: "/tablet/workspace/patients?create=1" },
  { label: "Режим кабинета", icon: Monitor, path: "/tablet" },
] as const;
