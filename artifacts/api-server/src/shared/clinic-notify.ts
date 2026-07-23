import { randomUUID } from "crypto";
import {
  db,
  notificationsTable,
  notificationPreferencesTable,
  usersTable,
  type NotificationPrefGroup,
  type UserRole,
} from "@workspace/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { insertNotifications } from "./notifications-dispatch";
import { logger } from "../lib/logger";
import {
  KIND_ROLE_DEFAULTS,
  KIND_TO_GROUP,
  KIND_TO_TYPE,
  isDuplicateNotify,
  type NotifyKind,
} from "./clinic-notify-kinds";

export {
  NOTIFY_KINDS,
  NOTIFY_STAGE_STATUSES,
  stageLabel,
  isDuplicateNotify,
  groupForKind,
  rolesForKind,
  type NotifyKind,
} from "./clinic-notify-kinds";

export interface ClinicNotifyInput {
  clinicId: string;
  kind: NotifyKind;
  message: string;
  patientId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
  /** Extra user IDs always included (e.g. assigned doctor), still subject to mute prefs. */
  extraUserIds?: string[];
  /** Override role defaults for this call. */
  roles?: UserRole[];
  /** Skip notifying this user (usually the actor who triggered the event). */
  skipUserId?: string | null;
  /** Only notify these user IDs (ignores role defaults; still applies mute + skip). */
  onlyUserIds?: string[];
  /**
   * Dedup key. If provided with dedupTtlMs, skips insert when key was recently used.
   * Typical: `${clinicId}:${kind}:${entityId}`
   */
  dedupKey?: string;
  dedupTtlMs?: number;
  /**
   * DB-level coalesce: skip if same user already has unread notification of this
   * type+kind+patient within coalesceWindowMs.
   */
  coalescePatientId?: string | null;
  coalesceWindowMs?: number;
}

async function loadMutedGroupsByUser(
  userIds: string[],
): Promise<Map<string, Set<NotificationPrefGroup>>> {
  const map = new Map<string, Set<NotificationPrefGroup>>();
  if (userIds.length === 0) return map;

  const rows = await db
    .select({
      userId: notificationPreferencesTable.userId,
      mutedGroups: notificationPreferencesTable.mutedGroups,
    })
    .from(notificationPreferencesTable)
    .where(inArray(notificationPreferencesTable.userId, userIds));

  for (const row of rows) {
    map.set(row.userId, new Set(row.mutedGroups ?? []));
  }
  return map;
}

/**
 * Create in-app notifications (+ Web Push via insertNotifications bridge)
 * for clinic staff matching role defaults / extras, minus mute prefs and actor.
 */
export async function notifyClinicStaff(input: ClinicNotifyInput): Promise<number> {
  const {
    clinicId,
    kind,
    message,
    patientId = null,
    messageId = null,
    payload = {},
    extraUserIds = [],
    roles,
    skipUserId = null,
    onlyUserIds,
    dedupKey,
    dedupTtlMs = 60_000,
    coalescePatientId,
    coalesceWindowMs = 90_000,
  } = input;

  if (dedupKey && isDuplicateNotify(dedupKey, dedupTtlMs)) {
    return 0;
  }

  const group = KIND_TO_GROUP[kind];
  const type = KIND_TO_TYPE[kind];
  const effectiveRoles = roles ?? KIND_ROLE_DEFAULTS[kind];

  let candidates: Array<{ id: string; role: UserRole }> = [];

  if (onlyUserIds && onlyUserIds.length > 0) {
    const rows = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          eq(usersTable.isActive, true),
          inArray(usersTable.id, onlyUserIds),
        ),
      );
    candidates = rows as Array<{ id: string; role: UserRole }>;
  } else {
    const roleRows = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          eq(usersTable.isActive, true),
          inArray(usersTable.role, effectiveRoles as never[]),
        ),
      );
    candidates = roleRows as Array<{ id: string; role: UserRole }>;

    if (extraUserIds.length > 0) {
      const existing = new Set(candidates.map((c) => c.id));
      const missing = extraUserIds.filter((id) => !existing.has(id));
      if (missing.length > 0) {
        const extras = await db
          .select({ id: usersTable.id, role: usersTable.role })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.clinicId, clinicId),
              eq(usersTable.isActive, true),
              inArray(usersTable.id, missing),
            ),
          );
        candidates = candidates.concat(extras as Array<{ id: string; role: UserRole }>);
      }
    }
  }

  const doctorScopedKinds = new Set<NotifyKind>([
    "inbound_chat",
    "appointment_created",
    "appointment_rescheduled",
    "appointment_cancelled",
    "appointment_reassigned",
    "ai_diagnosis_ready",
    "treatment_plan_created",
    "treatment_plan_approved",
    "treatment_plan_sent",
    "review_low",
    "review_positive",
    "contract_signed",
    "patient_stage_changed",
  ]);

  if (doctorScopedKinds.has(kind) && extraUserIds.length > 0 && !onlyUserIds) {
    const allowedDoctors = new Set(extraUserIds);
    candidates = candidates.filter(
      (c) => c.role !== "doctor" || allowedDoctors.has(c.id),
    );
  }

  if (skipUserId) {
    candidates = candidates.filter((c) => c.id !== skipUserId);
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  candidates = [...byId.values()];

  if (candidates.length === 0) return 0;

  const mutedMap = await loadMutedGroupsByUser(candidates.map((c) => c.id));
  candidates = candidates.filter((c) => {
    const muted = mutedMap.get(c.id);
    if (!muted || muted.size === 0) return true;
    return !muted.has(group);
  });

  if (candidates.length === 0) return 0;

  if (coalescePatientId && coalesceWindowMs > 0) {
    const since = new Date(Date.now() - coalesceWindowMs);
    const recent = await db
      .select({ userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.clinicId, clinicId),
          eq(notificationsTable.type, type),
          eq(notificationsTable.patientId, coalescePatientId),
          eq(notificationsTable.read, false),
          gte(notificationsTable.createdAt, since),
        ),
      );
    const recentUsers = new Set(recent.map((r) => r.userId));
    candidates = candidates.filter((c) => !recentUsers.has(c.id));
  }

  if (candidates.length === 0) return 0;

  const fullPayload: Record<string, unknown> = {
    kind,
    ...(patientId ? { patientId } : {}),
    ...payload,
  };

  try {
    await insertNotifications(
      candidates.map((c) => ({
        id: randomUUID(),
        clinicId,
        userId: c.id,
        type,
        message,
        read: false,
        patientId: patientId ?? null,
        messageId: messageId ?? null,
        payload: fullPayload,
      })),
    );
    return candidates.length;
  } catch (err) {
    logger.error({ err, clinicId, kind }, "[clinic-notify] Failed to insert notifications");
    return 0;
  }
}
