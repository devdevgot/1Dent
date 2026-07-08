import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  Inbox,
  Info,
  LayoutDashboard,
  Mail,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Pill,
  Radio,
  ScrollText,
  Search,
  Send,
  Settings,
  Smartphone,
  Users,
  Video,
  Wallet,
  type LucideProps,
} from "lucide-react";

export type SectionIconName =
  | "info"
  | "users"
  | "patients"
  | "chatbot"
  | "sessions"
  | "messages"
  | "channels"
  | "procedures"
  | "analytics"
  | "broadcasts"
  | "knowledge"
  | "contracts"
  | "inventory"
  | "finances"
  | "logs"
  | "notifications"
  | "files"
  | "dashboard"
  | "clinics"
  | "content"
  | "plan-requests"
  | "more"
  | "activity"
  | "settings"
  | "errors"
  | "tablet"
  | "whatsapp"
  | "plans"
  | "search"
  | "empty"
  | "phone"
  | "telegram"
  | "calendar"
  | "credit-card";

const ICON_MAP: Record<SectionIconName, LucideIcon> = {
  info: Info,
  users: Users,
  patients: Users,
  chatbot: Bot,
  sessions: MessageCircle,
  messages: Mail,
  channels: Radio,
  procedures: Pill,
  analytics: BarChart3,
  broadcasts: Megaphone,
  knowledge: BookOpen,
  contracts: FileText,
  inventory: Package,
  finances: Wallet,
  logs: ScrollText,
  notifications: Bell,
  files: FolderOpen,
  dashboard: LayoutDashboard,
  clinics: Building2,
  content: Package,
  "plan-requests": ClipboardList,
  more: Menu,
  activity: Activity,
  settings: Settings,
  errors: AlertTriangle,
  tablet: Video,
  whatsapp: Smartphone,
  plans: CreditCard,
  search: Search,
  empty: Inbox,
  phone: Phone,
  telegram: Send,
  calendar: Calendar,
  "credit-card": CreditCard,
};

type SectionIconProps = LucideProps & {
  name: SectionIconName;
};

export function SectionIcon({ name, className, ...props }: SectionIconProps) {
  const Icon = ICON_MAP[name] ?? Inbox;
  return <Icon className={className} {...props} />;
}

export function SectionIconBox({
  name,
  className,
}: {
  name: SectionIconName;
  className?: string;
}) {
  return (
    <div
      className={`w-9 h-9 rounded-xl bg-[var(--primary-light)] flex items-center justify-center shrink-0 ${className ?? ""}`}
    >
      <SectionIcon name={name} className="w-[18px] h-[18px] text-[#1f75fe]" />
    </div>
  );
}
