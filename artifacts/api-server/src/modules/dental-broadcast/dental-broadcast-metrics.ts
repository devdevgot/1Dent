import {
  db,
  dentalBroadcastDeliveriesTable,
  dentalBroadcastRunsTable,
} from "@workspace/db";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

async function incrementRunCounter(
  runId: string,
  field: "repliesCount" | "bookingsCount",
): Promise<void> {
  try {
    if (field === "repliesCount") {
      await db
        .update(dentalBroadcastRunsTable)
        .set({ repliesCount: sql`${dentalBroadcastRunsTable.repliesCount} + 1` })
        .where(eq(dentalBroadcastRunsTable.id, runId));
    } else {
      await db
        .update(dentalBroadcastRunsTable)
        .set({ bookingsCount: sql`${dentalBroadcastRunsTable.bookingsCount} + 1` })
        .where(eq(dentalBroadcastRunsTable.id, runId));
    }
  } catch (err) {
    logger.error({ err, runId, field }, "[DentalBroadcastMetrics] Failed to increment run counter");
  }
}

/** Mark the latest unreplied broadcast delivery for this patient as replied. */
export async function markBroadcastReply(
  clinicId: string,
  patientId: string,
): Promise<void> {
  const [delivery] = await db
    .select({
      id: dentalBroadcastDeliveriesTable.id,
      runId: dentalBroadcastDeliveriesTable.runId,
    })
    .from(dentalBroadcastDeliveriesTable)
    .where(
      and(
        eq(dentalBroadcastDeliveriesTable.clinicId, clinicId),
        eq(dentalBroadcastDeliveriesTable.patientId, patientId),
        isNull(dentalBroadcastDeliveriesTable.repliedAt),
      ),
    )
    .orderBy(desc(dentalBroadcastDeliveriesTable.sentAt))
    .limit(1);

  if (!delivery) return;

  const now = new Date();
  const [updated] = await db
    .update(dentalBroadcastDeliveriesTable)
    .set({ repliedAt: now })
    .where(
      and(
        eq(dentalBroadcastDeliveriesTable.id, delivery.id),
        isNull(dentalBroadcastDeliveriesTable.repliedAt),
      ),
    )
    .returning({ id: dentalBroadcastDeliveriesTable.id });

  if (updated) {
    await incrementRunCounter(delivery.runId, "repliesCount");
  }
}

/** Mark the latest broadcast delivery without booking as converted. */
export async function markBroadcastBooking(
  clinicId: string,
  patientId: string,
): Promise<void> {
  const [delivery] = await db
    .select({
      id: dentalBroadcastDeliveriesTable.id,
      runId: dentalBroadcastDeliveriesTable.runId,
    })
    .from(dentalBroadcastDeliveriesTable)
    .where(
      and(
        eq(dentalBroadcastDeliveriesTable.clinicId, clinicId),
        eq(dentalBroadcastDeliveriesTable.patientId, patientId),
        isNull(dentalBroadcastDeliveriesTable.bookedAt),
      ),
    )
    .orderBy(desc(dentalBroadcastDeliveriesTable.sentAt))
    .limit(1);

  if (!delivery) return;

  const now = new Date();
  const [updated] = await db
    .update(dentalBroadcastDeliveriesTable)
    .set({ bookedAt: now })
    .where(
      and(
        eq(dentalBroadcastDeliveriesTable.id, delivery.id),
        isNull(dentalBroadcastDeliveriesTable.bookedAt),
      ),
    )
    .returning({ id: dentalBroadcastDeliveriesTable.id });

  if (updated) {
    await incrementRunCounter(delivery.runId, "bookingsCount");
  }
}

export async function listPatientBroadcastHistory(
  clinicId: string,
  patientId: string,
  limit = 20,
) {
  return db
    .select({
      id: dentalBroadcastDeliveriesTable.id,
      runId: dentalBroadcastDeliveriesTable.runId,
      runDate: dentalBroadcastRunsTable.runDate,
      content: dentalBroadcastDeliveriesTable.content,
      usedAi: dentalBroadcastDeliveriesTable.usedAi,
      sentAt: dentalBroadcastDeliveriesTable.sentAt,
      repliedAt: dentalBroadcastDeliveriesTable.repliedAt,
      bookedAt: dentalBroadcastDeliveriesTable.bookedAt,
    })
    .from(dentalBroadcastDeliveriesTable)
    .innerJoin(
      dentalBroadcastRunsTable,
      eq(dentalBroadcastDeliveriesTable.runId, dentalBroadcastRunsTable.id),
    )
    .where(
      and(
        eq(dentalBroadcastDeliveriesTable.clinicId, clinicId),
        eq(dentalBroadcastDeliveriesTable.patientId, patientId),
      ),
    )
    .orderBy(desc(dentalBroadcastDeliveriesTable.sentAt))
    .limit(limit);
}

export function computeRates(messagesSent: number, repliesCount: number, bookingsCount: number) {
  const replyRate = messagesSent > 0 ? Math.round((repliesCount / messagesSent) * 1000) / 10 : 0;
  const bookingRate = messagesSent > 0 ? Math.round((bookingsCount / messagesSent) * 1000) / 10 : 0;
  return { replyRate, bookingRate };
}
