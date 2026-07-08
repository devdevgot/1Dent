import { Bell, AlertTriangle, CheckCheck, ChevronRight, Calendar, Wallet } from "lucide-react";
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Notification } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const isRedAlert = notification.type === "red_alert";
  const isAppointmentReminder = notification.type === "appointment_reminder";
  const isPendingPayment = notification.type === "pending_payment";

  return (
    <button
      onClick={() => !notification.read && onRead(notification.id)}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-[var(--ds-border)] flex items-start gap-3 transition-colors font-manrope",
        notification.read ? "opacity-60" : "bg-[var(--ds-surface)] hover:bg-[var(--bg)]",
        isRedAlert && !notification.read && "bg-[var(--danger-light)] hover:bg-[var(--danger-light)]/80",
        isAppointmentReminder && !notification.read && "bg-[var(--primary-light)] hover:bg-[var(--primary-light)]",
        isPendingPayment && !notification.read && "bg-[var(--warning-light)] hover:bg-[var(--warning-light)]/80",
      )}
    >
      <div
        className={cn(
          "mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isRedAlert
            ? "bg-[var(--danger-light)] text-[var(--danger)]"
            : isAppointmentReminder
            ? "bg-[var(--primary-light)] text-[var(--ds-primary)]"
            : isPendingPayment
            ? "bg-[var(--warning-light)] text-[var(--warning)]"
            : "bg-[var(--info-light)] text-[var(--info)]",
        )}
      >
        {isRedAlert ? (
          <AlertTriangle className="w-4 h-4" />
        ) : isAppointmentReminder ? (
          <Calendar className="w-4 h-4" />
        ) : isPendingPayment ? (
          <Wallet className="w-4 h-4" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-caption text-[var(--text)] leading-relaxed">{notification.message}</p>
        <p className="text-micro text-[var(--text-subtle)] mt-1">
          {new Date(notification.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          &bull;{" "}
          {new Date(notification.createdAt).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
          })}
        </p>
      </div>
      {!notification.read && <div className="w-2 h-2 rounded-full bg-[var(--ds-primary)] mt-2 shrink-0" />}
    </button>
  );
}

export function NotificationBell() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: countData } = useUnreadCount();
  const { data: notificationsData } = useNotifications();
  const markReadMutation = useMarkRead();
  const markAllMutation = useMarkAllRead();

  const count = countData?.data?.count ?? 0;
  const notifications = notificationsData?.data?.notifications ?? [];
  const unreadRedAlerts = notifications.filter((n) => n.type === "red_alert" && !n.read).length;
  const unreadPendingPayments = notifications.filter((n) => n.type === "pending_payment" && !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-xl hover:bg-[var(--surface-2)] transition-colors">
          <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
          {count > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-micro font-bold flex items-center justify-center text-white px-1",
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
      <PopoverContent className="w-96 p-0 shadow-xl bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-2xl font-manrope" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ds-border)]">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-body text-[var(--text)]">{t("notifications.title")}</h3>
            {unreadRedAlerts > 0 && (
              <Badge variant="destructive" className="text-micro py-0">
                {t("notifications.redAlerts", { count: unreadRedAlerts })}
              </Badge>
            )}
            {unreadPendingPayments > 0 && (
              <Badge className="text-micro py-0 bg-orange-500 hover:bg-orange-600">
                {unreadPendingPayments} оплата
              </Badge>
            )}
          </div>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-caption text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        {unreadRedAlerts > 0 && (
          <button
            onClick={() => navigate("/kanban")}
            className="w-full bg-[var(--danger-light)] border-b border-[var(--ds-border)] p-3.5 flex items-center gap-3 text-left hover:bg-[var(--danger-light)]/80 transition-colors"
          >
            <div className="w-9 h-9 bg-[var(--danger)] rounded-xl flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-[var(--danger)]">
                {t("dashboard.redAlertTitle", { count: unreadRedAlerts })}
              </p>
              <p className="text-caption text-[var(--danger)]/80">{t("dashboard.redAlertDesc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--danger)]/60 shrink-0" />
          </button>
        )}

        {unreadPendingPayments > 0 && (
          <button
            onClick={() => navigate("/admin/finance")}
            className="w-full bg-[var(--warning-light)] border-b border-[var(--ds-border)] p-3.5 flex items-center gap-3 text-left hover:bg-[var(--warning-light)]/80 transition-colors"
          >
            <div className="w-9 h-9 bg-[var(--warning)] rounded-xl flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-[var(--warning)]">
                {unreadPendingPayments} {unreadPendingPayments === 1 ? "процедура ожидает" : "процедур ожидают"} оплаты
              </p>
              <p className="text-caption text-[var(--warning)]/80">Перейти в раздел финансов</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--warning)]/60 shrink-0" />
          </button>
        )}

        <ScrollArea className="max-h-96">
          {notifications.length === 0 && (
            <div className="py-8 text-center text-caption text-[var(--text-secondary)]">
              {t("notifications.empty")}
            </div>
          )}
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={(id) => markReadMutation.mutate({ id })}
            />
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
