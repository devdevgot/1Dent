import type { Notification } from "@workspace/api-client-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";

export interface TabletPairingTarget {
  sessionId: string;
  pairingCode: string;
  cabinetName?: string | null;
}

export interface NotificationTarget {
  href: string;
  patientId?: string;
  chatPatientId?: string;
  tabletPairing?: TabletPairingTarget;
}

function payloadStr(
  payload: Notification["payload"] | undefined | null,
  key: string,
): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function payloadKind(payload: Notification["payload"] | undefined | null): string | undefined {
  return payloadStr(payload, "kind");
}

function resolvePatientId(notification: Notification): string | undefined {
  return notification.patientId ?? payloadStr(notification.payload, "patientId") ?? undefined;
}

function scheduleHref(role: string, scheduledAt?: string): string {
  if (["doctor", "assistant", "nurse"].includes(role)) {
    if (scheduledAt) {
      const day = scheduledAt.slice(0, 10);
      return `/schedule/${day}`;
    }
    return "/schedule";
  }
  if (role === "owner") {
    return "/calendar";
  }
  return "/admin/calendar";
}

export function getNotificationTarget(
  notification: Notification,
  role: string,
): NotificationTarget | null {
  const patientId = resolvePatientId(notification);
  const payload = notification.payload;

  switch (notification.type) {
    case "red_alert":
      return patientId
        ? { href: "/patients?view=kanban", patientId }
        : { href: "/patients?view=kanban" };

    case "pending_payment":
      if (patientId) return { href: "/patients?view=kanban", patientId };
      return { href: "/admin/finance" };

    case "appointment_reminder":
    case "appointment": {
      if (patientId) return { href: "/patients?view=kanban", patientId };
      return { href: scheduleHref(role, payloadStr(payload, "scheduledAt")) };
    }

    case "new_message":
      return patientId
        ? { href: "/chat", chatPatientId: patientId }
        : { href: "/chat" };

    case "system": {
      const kind = payloadKind(payload);

      if (kind === "tablet_pairing") {
        const sessionId = payloadStr(payload, "sessionId");
        const pairingCode = payloadStr(payload, "pairingCode");
        if (sessionId && pairingCode) {
          return {
            href: "/tablet/link",
            tabletPairing: {
              sessionId,
              pairingCode,
              cabinetName: payloadStr(payload, "cabinetName"),
            },
          };
        }
        return { href: "/tablet/link" };
      }

      if (kind === "ai_credits_exhausted") {
        return role === "owner"
          ? { href: "/ai-credits" }
          : { href: getRoleDashboardPath(role) };
      }

      if (patientId) {
        return { href: "/patients?view=kanban", patientId };
      }

      if (
        notification.message.includes("оператор") ||
        notification.message.includes("чат-бот")
      ) {
        return { href: "/chatbot" };
      }

      if (notification.message.includes("📅") || notification.message.includes("запись")) {
        return { href: scheduleHref(role) };
      }

      return { href: getRoleDashboardPath(role) };
    }

    default:
      if (patientId) return { href: "/patients?view=kanban", patientId };
      return null;
  }
}
