import { useState, useEffect } from "react";
import { Calendar, Clock, User, Stethoscope } from "lucide-react";
import { useNotifications, useMarkRead } from "@/hooks/use-notifications";
import type { Notification } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { AppDialog } from "@/components/layout/app-dialog";

interface AppointmentReminderPayload {
  patientName?: string;
  doctorName?: string;
  scheduledAt?: string;
  procedureName?: string;
  reminderType?: string;
}

function formatScheduledAt(scheduledAt: string): { date: string; time: string } {
  const d = new Date(scheduledAt);
  const date = d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

export function AppointmentReminderModal() {
  const { t } = useTranslation();
  const { data: notificationsData } = useNotifications();
  const markReadMutation = useMarkRead();
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Notification | null>(null);

  const notifications = notificationsData?.data?.notifications ?? [];

  useEffect(() => {
    const unread = notifications.filter(
      (n) => n.type === "appointment_reminder" && !n.read && !shownIds.has(n.id),
    );
    if (unread.length > 0 && !current) {
      const next = unread[0]!;
      setCurrent(next);
    }
  }, [notifications, shownIds, current]);

  const handleDismiss = () => {
    if (!current) return;
    setShownIds((prev) => new Set(prev).add(current.id));
    markReadMutation.mutate({ id: current.id });
    setCurrent(null);
  };

  if (!current) return null;

  const payload = (current.payload ?? {}) as AppointmentReminderPayload;
  const formatted = payload.scheduledAt ? formatScheduledAt(payload.scheduledAt) : null;
  const isOneHour = payload.reminderType === "1h";

  return (
    <AppDialog
      open
      onOpenChange={(isOpen) => { if (!isOpen) handleDismiss(); }}
      title={
        isOneHour
          ? t("appointmentReminder.titleOneHour", "Приём через 1 час")
          : t("appointmentReminder.title24h", "Приём завтра")
      }
      description={t("appointmentReminder.subtitle", "Напоминание о записи")}
      size="sm"
      bodyClassName="!p-0"
      footer={
        <button
          type="button"
          onClick={handleDismiss}
          disabled={markReadMutation.isPending}
          className="dash-btn dash-btn-primary w-full"
        >
          {t("appointmentReminder.dismiss", "Понял")}
        </button>
      }
    >
      <div className="bg-primary px-5 py-3 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-white" />
        </div>
        <p className="text-white/90 text-xs font-medium">
          {t("appointmentReminder.subtitle", "Напоминание о записи")}
        </p>
      </div>

      <div className="px-5 py-4 space-y-3">
        {payload.patientName && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("appointmentReminder.patient", "Пациент")}
              </p>
              <p className="text-sm font-medium text-foreground">{payload.patientName}</p>
            </div>
          </div>
        )}

        {payload.procedureName && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
              <Stethoscope className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("appointmentReminder.procedure", "Процедура")}
              </p>
              <p className="text-sm font-medium text-foreground">{payload.procedureName}</p>
            </div>
          </div>
        )}

        {formatted && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("appointmentReminder.scheduledAt", "Время приёма")}
              </p>
              <p className="text-sm font-medium text-foreground">
                {formatted.date}, {formatted.time}
              </p>
            </div>
          </div>
        )}

        {payload.doctorName && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("appointmentReminder.doctor", "Врач")}
              </p>
              <p className="text-sm font-medium text-foreground">{payload.doctorName}</p>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  );
}
