import { Bell, AlertTriangle, CheckCheck, ChevronRight, Calendar } from "lucide-react";
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

  return (
    <button
      onClick={() => !notification.read && onRead(notification.id)}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/30 flex items-start gap-3 transition-colors",
        notification.read ? "opacity-60" : "bg-white hover:bg-slate-50",
        isRedAlert && !notification.read && "bg-red-50 hover:bg-red-100",
        isAppointmentReminder && !notification.read && "bg-blue-50 hover:bg-blue-100",
      )}
    >
      <div
        className={cn(
          "mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isRedAlert ? "bg-red-100 text-red-600" : isAppointmentReminder ? "bg-primary/10 text-primary" : "bg-blue-100 text-blue-600",
        )}
      >
        {isRedAlert ? <AlertTriangle className="w-4 h-4" /> : isAppointmentReminder ? <Calendar className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-relaxed">{notification.message}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
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
      {!notification.read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {count > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1",
                unreadRedAlerts > 0 ? "bg-red-500 animate-pulse" : "bg-primary",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 shadow-xl bg-white border-t-[#ffffff] border-r-[#ffffff] border-b-[#ffffff] border-l-[#ffffff]" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t("notifications.title")}</h3>
            {unreadRedAlerts > 0 && (
              <Badge variant="destructive" className="text-[10px] py-0">
                {t("notifications.redAlerts", { count: unreadRedAlerts })}
              </Badge>
            )}
          </div>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
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
            className="w-full bg-red-50 border-b border-red-100 p-3.5 flex items-center gap-3 text-left hover:bg-red-100 transition-colors"
          >
            <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-700">
                {t("dashboard.redAlertTitle", { count: unreadRedAlerts })}
              </p>
              <p className="text-xs text-red-500">{t("dashboard.redAlertDesc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
          </button>
        )}

        <ScrollArea className="max-h-96">
          {notifications.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
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
