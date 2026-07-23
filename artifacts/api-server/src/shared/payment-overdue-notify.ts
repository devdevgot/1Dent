import { db, proceduresTable, patientsTable } from "@workspace/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifyClinicStaff, NOTIFY_KINDS } from "./clinic-notify";

const OVERDUE_HOURS = 48;
const POLL_MS = 15 * 60 * 1000;

/**
 * Notify staff about procedures stuck in pending_payment longer than OVERDUE_HOURS.
 * Dedup key prevents re-notifying the same procedure within 24h.
 */
export async function scanPaymentOverdue(): Promise<number> {
  const cutoff = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: proceduresTable.id,
      clinicId: proceduresTable.clinicId,
      patientId: proceduresTable.patientId,
      name: proceduresTable.name,
      doctorId: proceduresTable.doctorId,
      patientName: patientsTable.name,
    })
    .from(proceduresTable)
    .leftJoin(patientsTable, eq(patientsTable.id, proceduresTable.patientId))
    .where(
      and(
        eq(proceduresTable.status, "pending_payment"),
        or(
          lt(proceduresTable.completedAt, cutoff),
          and(isNull(proceduresTable.completedAt), lt(proceduresTable.createdAt, cutoff)),
        ),
      ),
    )
    .limit(100);

  let sent = 0;
  for (const row of rows) {
    if (!row.patientId) continue;
    const patientName = row.patientName ?? "Пациент";
    const n = await notifyClinicStaff({
      clinicId: row.clinicId,
      kind: NOTIFY_KINDS.payment_overdue,
      message: `⏰ Просрочена оплата (${OVERDUE_HOURS}ч+): ${row.name} — ${patientName}`,
      patientId: row.patientId,
      payload: {
        procedureId: row.id,
        doctorId: row.doctorId,
      },
      extraUserIds: row.doctorId ? [row.doctorId] : undefined,
      dedupKey: `${row.clinicId}:payment_overdue:${row.id}`,
      dedupTtlMs: 24 * 60 * 60 * 1000,
    });
    sent += n;
  }
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPaymentOverduePoller(): void {
  if (timer) return;
  const tick = () => {
    scanPaymentOverdue().catch((err) =>
      logger.warn({ err }, "[payment-overdue] scan failed"),
    );
  };
  // Delay first run so migrations finish
  setTimeout(tick, 60_000);
  timer = setInterval(tick, POLL_MS);
  logger.info("[payment-overdue] Poller started");
}
