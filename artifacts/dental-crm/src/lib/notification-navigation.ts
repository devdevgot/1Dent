import type { Notification } from "@workspace/api-client-react";
import { getRoleDashboardPath } from "@/lib/role-redirect";

export interface TabletPairingTarget {
  sessionId: string;
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
  if (["owner", "doctor", "assistant", "nurse"].includes(role)) {
    if (scheduledAt) {
      const day = scheduledAt.slice(0, 10);
      return `/schedule/${day}`;
    }
    return "/schedule";
  }
  return "/admin/calendar";
}

function kanbanTarget(patientId?: string): NotificationTarget {
  return patientId
    ? { href: "/patients?view=kanban", patientId }
    : { href: "/patients?view=kanban" };
}

export function getNotificationTarget(
  notification: Notification,
  role: string,
): NotificationTarget | null {
  const patientId = resolvePatientId(notification);
  const payload = notification.payload;
  const kind = payloadKind(payload);

  // Prefer structured kind routing for all types
  switch (kind) {
    case "inbound_chat":
    case "broadcast_reply":
    case "human_takeover":
      return patientId
        ? { href: "/chat", chatPatientId: patientId }
        : { href: "/chat" };

    case "appointment_created":
    case "appointment_rescheduled":
    case "appointment_cancelled":
    case "appointment_reassigned":
      return {
        href: scheduleHref(role, payloadStr(payload, "scheduledAt")),
        patientId,
      };

    case "pending_payment":
    case "payment_received":
    case "payment_debt":
    case "payment_overdue":
    case "patient_stage_changed":
    case "review_low":
    case "review_positive":
    case "contract_viewed":
    case "contract_signed":
    case "treatment_plan_created":
    case "treatment_plan_approved":
    case "treatment_plan_sent":
    case "ai_diagnosis_ready":
      return kanbanTarget(patientId);

    case "tablet_pairing":
    case "tablet_pairing_expired": {
      const sessionId = payloadStr(payload, "sessionId");
      if (sessionId) {
        return {
          href: "/tablet/link",
          tabletPairing: {
            sessionId,
            cabinetName: payloadStr(payload, "cabinetName"),
          },
        };
      }
      return { href: "/tablet/link" };
    }

    case "ai_credits_exhausted":
      return role === "owner"
        ? { href: "/ai-credits" }
        : { href: getRoleDashboardPath(role) };

    case "broadcast_finished":
    case "broadcast_failed":
      return { href: "/chatbot" };

    case "low_stock":
      return { href: "/inventory" };

    case "landing_lead":
      return { href: getRoleDashboardPath(role) };

    default:
      break;
  }

  switch (notification.type) {
    case "red_alert":
      return kanbanTarget(patientId);

    case "pending_payment":
      if (patientId) return kanbanTarget(patientId);
      return { href: "/admin/finance" };

    case "appointment_reminder":
    case "appointment": {
      if (payloadStr(payload, "reminderType") === "5m") {
        return { href: scheduleHref(role, payloadStr(payload, "scheduledAt")) };
      }
      if (patientId) return kanbanTarget(patientId);
      return { href: scheduleHref(role, payloadStr(payload, "scheduledAt")) };
    }

    case "new_message":
      return patientId
        ? { href: "/chat", chatPatientId: patientId }
        : { href: "/chat" };

    case "system": {
      if (patientId) return kanbanTarget(patientId);

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
      if (patientId) return kanbanTarget(patientId);
      return null;
  }
}
