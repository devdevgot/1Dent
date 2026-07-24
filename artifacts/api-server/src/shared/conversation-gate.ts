/**
 * Conversation ownership gate — prevents booking bot + proactive outbound
 * (nurture / inactivity / reminders / postop / broadcast / care) from
 * messaging the same patient at the same time.
 *
 * Redis keys (best-effort; falls open to DB session checks if Redis down):
 *   conv:inbound:{clinicId}:{phone}  — last inbound activity timestamp
 *   conv:outbound:{clinicId}:{phone} — short lease while a send is in flight
 */

import { and, eq, ne } from "drizzle-orm";
import { db, chatbotSessionsTable } from "@workspace/db";
import { getRedisClient } from "./redis";
import { logger } from "../lib/logger";
import { canonicalChatbotPhone } from "../modules/chatbot/chatbot-phone";

export type OutboundSource =
  | "booking"
  | "nurture"
  | "inactivity"
  | "reminder"
  | "postop"
  | "broadcast"
  | "care"
  | "staff"
  | "reactivation";

/** After inbound, suppress proactive bots for this long. */
const INBOUND_QUIET_MS = 30 * 60 * 1000;
/** Active booking dialog (non-done session updated recently) quiet window for broadcast/care. */
const ACTIVE_SESSION_QUIET_MS = 2 * 60 * 60 * 1000;
/** Outbound in-flight lease so two senders cannot race. */
const OUTBOUND_LEASE_MS = 45_000;

function inboundKey(clinicId: string, phone: string): string {
  return `conv:inbound:${clinicId}:${phone}`;
}

function outboundKey(clinicId: string, phone: string): string {
  return `conv:outbound:${clinicId}:${phone}`;
}

export function normalizeGatePhone(phone: string): string {
  return canonicalChatbotPhone(phone);
}

/** Call on every patient inbound (webhook) so proactive jobs back off. */
export async function markConversationInbound(clinicId: string, phone: string): Promise<void> {
  const normalized = normalizeGatePhone(phone);
  const redis = getRedisClient();
  if (!redis) return;
  await redis
    .set(inboundKey(clinicId, normalized), String(Date.now()), "PX", INBOUND_QUIET_MS)
    .catch((err) => logger.warn({ err }, "[ConversationGate] markInbound failed"));
}

/** Booking / staff replies claim a short outbound lease. */
export async function markConversationOutbound(
  clinicId: string,
  phone: string,
  source: OutboundSource,
): Promise<void> {
  const normalized = normalizeGatePhone(phone);
  const redis = getRedisClient();
  if (!redis) return;
  await redis
    .set(outboundKey(clinicId, normalized), source, "PX", OUTBOUND_LEASE_MS)
    .catch((err) => logger.warn({ err, source }, "[ConversationGate] markOutbound failed"));
}

export interface GateDecision {
  allow: boolean;
  reason?: string;
}

/**
 * Should a proactive (non-booking) message be sent right now?
 * Booking replies always go through — they are reactions to the patient.
 *
 * - reminder / postop: only blocked by in-flight booking outbound lease
 *   (visit reminders must still arrive; dual-number Meta vs Green is fixed separately)
 * - nurture / inactivity / broadcast / care: blocked by recent inbound + active dialog
 */
export async function canSendProactive(
  clinicId: string,
  phone: string,
  source: Exclude<OutboundSource, "booking" | "staff">,
): Promise<GateDecision> {
  const normalized = normalizeGatePhone(phone);
  const redis = getRedisClient();
  const isVisitLifecycle = source === "reminder" || source === "postop";

  if (redis) {
    const outboundOwner = await redis.get(outboundKey(clinicId, normalized)).catch(() => null);
    if (outboundOwner && outboundOwner !== source) {
      // Always respect in-flight booking/staff send — avoids double bubble in the same second.
      if (outboundOwner === "booking" || outboundOwner === "staff" || isVisitLifecycle) {
        return { allow: false, reason: `outbound_lease_held_by_${outboundOwner}` };
      }
    }

    if (!isVisitLifecycle) {
      const inboundAt = await redis.get(inboundKey(clinicId, normalized)).catch(() => null);
      if (inboundAt) {
        const age = Date.now() - Number(inboundAt);
        if (Number.isFinite(age) && age < INBOUND_QUIET_MS) {
          return {
            allow: false,
            reason: `recent_inbound_${Math.round(age / 1000)}s_source_${source}`,
          };
        }
      }
    }
  }

  if (isVisitLifecycle) {
    return { allow: true };
  }

  const [session] = await db
    .select({
      state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
    .from(chatbotSessionsTable)
    .where(
      and(
        eq(chatbotSessionsTable.clinicId, clinicId),
        eq(chatbotSessionsTable.phone, normalized),
      ),
    )
    .limit(1);

  if (session?.humanTakeover || session?.state === "human_takeover") {
    return { allow: false, reason: "human_takeover" };
  }

  // Suppress nurture/inactivity/broadcast/care while booking dialog is still active.
  if (session && session.state !== "done") {
    const age = Date.now() - new Date(session.updatedAt).getTime();
    if (age < ACTIVE_SESSION_QUIET_MS) {
      // Nurture/inactivity target idle mid-funnel — require session stale ≥ 20 min.
      if (source === "nurture" || source === "inactivity") {
        if (age < 20 * 60 * 1000) {
          return { allow: false, reason: `active_booking_dialog_${Math.round(age / 1000)}s` };
        }
      } else {
        return { allow: false, reason: `active_booking_dialog_${Math.round(age / 1000)}s` };
      }
    }
  }

  return { allow: true };
}

/**
 * Claim outbound lease, run send, release.
 * If another sender holds the lease → skip (fail closed for proactive).
 */
export async function withProactiveSendClaim<T>(
  clinicId: string,
  phone: string,
  source: Exclude<OutboundSource, "booking" | "staff">,
  fn: () => Promise<T>,
): Promise<T | null> {
  const decision = await canSendProactive(clinicId, phone, source);
  if (!decision.allow) {
    logger.info(
      { clinicId, phone: normalizeGatePhone(phone), source, reason: decision.reason },
      "[ConversationGate] Suppressed proactive WhatsApp send",
    );
    return null;
  }

  const normalized = normalizeGatePhone(phone);
  const redis = getRedisClient();
  const key = outboundKey(clinicId, normalized);
  let token: string | null = null;

  if (redis) {
    token = `${source}:${Date.now()}`;
    const acquired = await redis.set(key, token, "PX", OUTBOUND_LEASE_MS, "NX").catch(() => null);
    if (acquired === null && redis.status === "ready") {
      logger.info(
        { clinicId, phone: normalized, source },
        "[ConversationGate] Outbound lease busy — skip proactive send",
      );
      return null;
    }
  }

  try {
    // Re-check after claim (TOCTOU vs booking inbound).
    const again = await canSendProactive(clinicId, phone, source);
    if (!again.allow) {
      logger.info(
        { clinicId, phone: normalized, source, reason: again.reason },
        "[ConversationGate] Suppressed after claim re-check",
      );
      return null;
    }
    return await fn();
  } finally {
    if (redis && token && redis.status === "ready") {
      const current = await redis.get(key).catch(() => null);
      if (current === token) {
        await redis.del(key).catch(() => {});
      }
    }
  }
}

/** True if session is mid-booking (used by broadcast filter). */
export async function hasActiveBookingDialog(clinicId: string, phone: string): Promise<boolean> {
  const normalized = normalizeGatePhone(phone);
  const [session] = await db
    .select({
      state: chatbotSessionsTable.state,
      humanTakeover: chatbotSessionsTable.humanTakeover,
      updatedAt: chatbotSessionsTable.updatedAt,
    })
    .from(chatbotSessionsTable)
    .where(
      and(
        eq(chatbotSessionsTable.clinicId, clinicId),
        eq(chatbotSessionsTable.phone, normalized),
        ne(chatbotSessionsTable.state, "done"),
      ),
    )
    .limit(1);

  if (!session) return false;
  if (session.humanTakeover || session.state === "human_takeover") return true;
  const age = Date.now() - new Date(session.updatedAt).getTime();
  return age < ACTIVE_SESSION_QUIET_MS;
}
