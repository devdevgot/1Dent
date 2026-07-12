import { useEffect, useState } from "react";
import {
  Bell,
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  Calendar,
  Wallet,
  MessageSquare,
  Bot,
  Tablet,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Notification } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useChatNavigationStore } from "@/hooks/use-chat-navigation";
import { useTabletPairingUiStore } from "@/hooks/use-tablet-pairing-ui";
import { getNotificationTarget } from "@/lib/notification-navigation";
import { IosGroup, IosGroupRow } from "@/components/layout/ios-group";

type NotificationVisual = {
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  tint?: string;
};

function getNotificationVisual(notification: Notification): NotificationVisual {
  const payloadKind =
    notification.payload &&
    typeof notification.payload === "object" &&
    typeof (notification.payload as Record<string, unknown>).kind === "string"
      ? ((notification.payload as Record<string, unknown>).kind as string)
      : undefined;

  switch (notification.type) {
    case "red_alert":
      return {
        Icon: AlertTriangle,
        iconBg: "bg-[var(--danger-light)]",
        iconColor: "text-[#dc2626]",
        tint: "bg-[var(--danger-light)]/40",
      };
    case "pending_payment":
      return {
        Icon: Wallet,
        iconBg: "bg-[var(--warning-light)]",
        iconColor: "text-[#d97706]",
        tint: "bg-[var(--warning-light)]/50",
      };
    case "appointment_reminder":
    case "appointment":
      return {
        Icon: Calendar,
        iconBg: "bg-[var(--primary-light)]",
        iconColor: "text-[#1f75fe]",
        tint: "bg-[var(--primary-light)]/60",
      };
    case "new_message":
      return {
        Icon: MessageSquare,
        iconBg: "bg-[var(--success-light)]",
        iconColor: "text-[#16a34a]",
      };
    case "system":
      if (payloadKind === "tablet_pairing") {
        return {
          Icon: Tablet,
          iconBg: "bg-[var(--primary-light)]",
          iconColor: "text-[#1f75fe]",
        };
      }
      if (payloadKind === "ai_credits_exhausted") {
        return {
          Icon: Sparkles,
          iconBg: "bg-[#f3e8ff]",
          iconColor: "text-[#7c3aed]",
        };
      }
      if (notification.message.includes("оператор") || notification.message.includes("чат-бот")) {
        return {
          Icon: Bot,
          iconBg: "bg-[var(--primary-light)]",
          iconColor: "text-[#1f75fe]",
        };
      }
      if (notification.message.includes("📅") || notification.message.includes("запись")) {
        return {
          Icon: Calendar,
          iconBg: "bg-[var(--primary-light)]",
          iconColor: "text-[#1f75fe]",
        };
      }
      return {
        Icon: Bell,
        iconBg: "bg-[var(--info-light)]",
        iconColor: "text-[var(--info)]",
      };
    default:
      return {
        Icon: Stethoscope,
        iconBg: "bg-[var(--info-light)]",
        iconColor: "text-[var(--info)]",
      };
  }
}

function formatNotificationTime(createdAt: Date | string): string {
  const date = new Date(createdAt);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  return `${time} · ${day}`;
}

function NotificationItem({
  notification,
  role,
  onNavigate,
}: {
  notification: Notification;
  role: string;
  onNavigate: (notification: Notification) => void;
}) {
  const visual = getNotificationVisual(notification);
  const target = getNotificationTarget(notification, role);
  const isClickable = target !== null;

  return (
    <IosGroupRow
      as={isClickable ? "button" : "div"}
      onClick={isClickable ? () => onNavigate(notification) : undefined}
      className={cn(
        "items-start gap-3 py-3.5",
        !notification.read && visual.tint,
        !notification.read && "font-medium",
        notification.read && "opacity-70",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          visual.iconBg,
        )}
      >
        <visual.Icon className={cn("w-4 h-4", visual.iconColor)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0f172a] leading-snug line-clamp-3">
          {notification.message}
        </p>
        <p className="text-[12px] text-[#94a3b8] mt-1">
          {formatNotificationTime(notification.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-center">
        {!notification.read && (
          <span className="w-2 h-2 rounded-full bg-[var(--ds-primary)]" />
        )}
        {isClickable && <ChevronRight className="w-4 h-4 text-[#94a3b8]" />}
      </div>
    </IosGroupRow>
  );
}

export function NotificationBell() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user } = useAuthStore();
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const selectChatPatient = useChatNavigationStore((s) => s.selectPatient);
  const openTabletPairing = useTabletPairingUiStore((s) => s.open);
  const [open, setOpen] = useState(false);

  const { data: countData } = useUnreadCount();
  const { data: notificationsData } = useNotifications();
  const markReadMutation = useMarkRead();
  const markAllMutation = useMarkAllRead();

  const count = countData?.data?.count ?? 0;
  const notifications = notificationsData?.data?.notifications ?? [];
  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);
  const unreadRedAlerts = unread.filter((n) => n.type === "red_alert").length;
  const unreadPendingPayments = unread.filter((n) => n.type === "pending_payment").length;
  const role = user?.role ?? "";

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleNavigate = (notification: Notification) => {
    const target = getNotificationTarget(notification, role);
    if (!target) return;

    if (!notification.read) {
      markReadMutation.mutate({ id: notification.id });
    }

    setOpen(false);

    if (target.tabletPairing) {
      openTabletPairing(
        target.tabletPairing.sessionId,
        target.tabletPairing.pairingCode,
        target.tabletPairing.cabinetName,
      );
      return;
    }

    if (target.chatPatientId) {
      selectChatPatient(target.chatPatientId);
    }

    if (target.patientId) {
      setSelectedPatientId(target.patientId);
    }

    navigate(target.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("notifications.title")}
          className="relative p-2 rounded-xl hover:bg-[#f1ede4] transition-colors"
        >
          <Bell className="w-5 h-5 text-[#64748b]" />
          {count > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1",
                unreadRedAlerts > 0
                  ? "bg-[var(--danger)] animate-pulse"
                  : unreadPendingPayments > 0
                  ? "bg-[var(--warning)] animate-pulse"
                  : "bg-[var(--ds-primary)]",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[min(24rem,calc(100vw-2rem))] p-0 shadow-xl bg-[#faf8f4] border border-[#e8e3d9] rounded-2xl font-manrope overflow-hidden flex flex-col max-h-[min(32rem,85vh)]"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white border-b border-[#e8e3d9] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary-light)] flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-[#1f75fe]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-[#0f172a]">
                {t("notifications.title")}
              </h3>
              {count > 0 && (
                <p className="text-[12px] text-[#94a3b8] truncate">
                  {t("notifications.unreadCount", { count })}
                </p>
              )}
            </div>
          </div>

          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-xs text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1ede4] rounded-xl"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
          <div className="p-3 space-y-3">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#e8e3d9] flex items-center justify-center">
                  <Bell className="w-5 h-5 text-[#94a3b8]" />
                </div>
                <p className="text-sm text-[#64748b]">{t("notifications.empty")}</p>
              </div>
            )}

            {unread.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-2 px-1">
                  {t("notifications.new")}
                </p>
                <IosGroup>
                  {unread.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      role={role}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </IosGroup>
              </div>
            )}

            {read.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-2 px-1">
                  {t("notifications.read")}
                </p>
                <IosGroup>
                  {read.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      role={role}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </IosGroup>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
