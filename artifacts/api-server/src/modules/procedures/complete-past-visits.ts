import { db, proceduresTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import { cancelAppointmentReminders } from "../followups/appointment-reminders.queue";
import { logger } from "../../lib/logger";

/**
 * Mark today's / past open appointments as completed when the patient moves
 * to Kanban «Диагностика» — the visit already happened and schedule slots lock.
 */
export async function completePastOpenVisitsForPatient(
  patientId: string,
  clinicId: string,
): Promise<string[]> {
  const now = new Date();

  const rows = await db
    .select({ id: proceduresTable.id })
    .from(proceduresTable)
    .where(
      and(
        eq(proceduresTable.clinicId, clinicId),
        eq(proceduresTable.patientId, patientId),
        inArray(proceduresTable.status, ["scheduled", "in_progress"]),
        isNotNull(proceduresTable.scheduledAt),
        or(
          eq(proceduresTable.status, "in_progress"),
          lte(proceduresTable.scheduledAt, now),
        ),
      ),
    );

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  await db
    .update(proceduresTable)
    .set({ status: "completed", completedAt: now })
    .where(
      and(
        eq(proceduresTable.clinicId, clinicId),
        inArray(proceduresTable.id, ids),
      ),
    );

  await Promise.all(
    ids.map((id) =>
      cancelAppointmentReminders(id, clinicId).catch((err) => {
        logger.warn(
          { err, procedureId: id },
          "[Procedures] Failed to cancel reminders after diagnostics lock",
        );
      }),
    ),
  );

  logger.info(
    { patientId, clinicId, procedureIds: ids },
    "[Procedures] Locked past visits after patient entered diagnostics",
  );

  return ids;
}
