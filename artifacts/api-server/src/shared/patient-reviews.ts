import { randomUUID } from "crypto";
import { db, patientReviewsTable, doctorKpisTable, patientsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { notifyClinicStaff, NOTIFY_KINDS } from "./clinic-notify";

/** Convert 1–5 star score to NPS-like 0–100 for KPI blending. */
export function starScoreToNpsPercent(score: number): number {
  return Math.round(((score - 1) / 4) * 100);
}

export async function savePatientReview(opts: {
  clinicId: string;
  patientId: string;
  doctorId?: string | null;
  procedureId?: string | null;
  score: number;
  comment?: string;
}): Promise<void> {
  const score = Math.min(5, Math.max(1, Math.round(opts.score)));
  await db.insert(patientReviewsTable).values({
    id: randomUUID(),
    clinicId: opts.clinicId,
    patientId: opts.patientId,
    doctorId: opts.doctorId ?? null,
    procedureId: opts.procedureId ?? null,
    score,
    comment: opts.comment?.trim() || null,
  });

  if (opts.doctorId) {
    await upsertDoctorNpsFromReviews(opts.clinicId, opts.doctorId);
  }

  try {
    const [patient] = await db
      .select({ name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.id, opts.patientId))
      .limit(1);
    const patientName = patient?.name ?? "Пациент";
    const stars = "★".repeat(score) + "☆".repeat(5 - score);
    if (score <= 3) {
      await notifyClinicStaff({
        clinicId: opts.clinicId,
        kind: NOTIFY_KINDS.review_low,
        message: `⚠️ Низкая оценка ${stars}: ${patientName}${opts.comment ? ` — «${opts.comment.slice(0, 60)}»` : ""}`,
        patientId: opts.patientId,
        payload: { score, doctorId: opts.doctorId ?? null, procedureId: opts.procedureId ?? null },
        extraUserIds: opts.doctorId ? [opts.doctorId] : [],
        dedupKey: `${opts.clinicId}:review_low:${opts.patientId}:${score}`,
        dedupTtlMs: 60 * 60_000,
      });
    } else if (score >= 5) {
      await notifyClinicStaff({
        clinicId: opts.clinicId,
        kind: NOTIFY_KINDS.review_positive,
        message: `🌟 Новый отзыв ${stars}: ${patientName}`,
        patientId: opts.patientId,
        payload: { score, doctorId: opts.doctorId ?? null },
        extraUserIds: opts.doctorId ? [opts.doctorId] : [],
        dedupKey: `${opts.clinicId}:review_positive:${opts.patientId}`,
        dedupTtlMs: 60 * 60_000,
      });
    }
  } catch {
    // Review notify must never fail the save path.
  }
}

async function upsertDoctorNpsFromReviews(clinicId: string, doctorId: string): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [agg] = await db
    .select({
      avgScore: sql<number>`coalesce(avg(${patientReviewsTable.score}), 0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(patientReviewsTable)
    .where(
      and(
        eq(patientReviewsTable.clinicId, clinicId),
        eq(patientReviewsTable.doctorId, doctorId),
        gte(patientReviewsTable.createdAt, since),
      ),
    );

  if (!agg || agg.count === 0) return;

  const nps = starScoreToNpsPercent(agg.avgScore);
  const month = new Date().toISOString().slice(0, 7);

  const [existing] = await db
    .select({ id: doctorKpisTable.id })
    .from(doctorKpisTable)
    .where(
      and(
        eq(doctorKpisTable.clinicId, clinicId),
        eq(doctorKpisTable.doctorId, doctorId),
        eq(doctorKpisTable.month, month),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(doctorKpisTable)
      .set({ nps, computedAt: new Date() })
      .where(eq(doctorKpisTable.id, existing.id));
  } else {
    await db.insert(doctorKpisTable).values({
      id: randomUUID(),
      clinicId,
      doctorId,
      month,
      nps,
    });
  }
}

export async function getDoctorNpsMap(clinicId: string, windowDays = 90): Promise<Map<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const rows = await db
    .select({
      doctorId: patientReviewsTable.doctorId,
      avgScore: sql<number>`avg(${patientReviewsTable.score})::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(patientReviewsTable)
    .where(
      and(
        eq(patientReviewsTable.clinicId, clinicId),
        gte(patientReviewsTable.createdAt, since),
        sql`${patientReviewsTable.doctorId} IS NOT NULL`,
      ),
    )
    .groupBy(patientReviewsTable.doctorId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.doctorId && row.count >= 1) {
      map.set(row.doctorId, starScoreToNpsPercent(row.avgScore));
    }
  }
  return map;
}

export function parseReviewScoreFromText(text: string): number | null {
  const t = text.trim();
  const digit = t.match(/^([1-5])$/);
  if (digit) return Number(digit[1]);
  const star = t.match(/([1-5])\s*(?:\/\s*5|звезд|⭐|★)/i);
  if (star) return Number(star[1]);
  return null;
}
