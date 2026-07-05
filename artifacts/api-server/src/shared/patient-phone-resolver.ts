import { randomUUID } from "crypto";
import { db, patientsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { normalizePhoneDigits, phonesMatch } from "./phone";
import { logger } from "../lib/logger";

export type ResolvedPatient = {
  id: string;
  name: string;
  phone: string;
  status: string | null;
  doctorId: string | null;
  marketingOptOut: boolean;
};


/** Prefer indexed lookup by phone_normalized, fall back to phonesMatch scan. */
export async function resolvePatientByPhone(
  clinicId: string,
  rawPhone: string,
): Promise<(ResolvedPatient & { updatedAt?: Date }) | null> {
  const digits = normalizePhoneDigits(rawPhone);
  if (digits.length < 7) return null;

  const indexed = await db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      status: patientsTable.status,
      doctorId: patientsTable.doctorId,
      marketingOptOut: patientsTable.marketingOptOut,
      updatedAt: patientsTable.updatedAt,
    })
    .from(patientsTable)
    .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phoneNormalized, digits)))
    .limit(5);

  if (indexed.length === 1) return indexed[0]!;
  if (indexed.length > 1) {
    logger.warn({ clinicId, matchCount: indexed.length }, "Multiple patients on phone_normalized");
    const repeatSale = indexed.find((p) => p.status === "repeat_sale");
    if (repeatSale) return repeatSale;
    return indexed.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  }

  // Legacy rows without phone_normalized — scan clinic (TODO: backfill removes this path)
  const all = await db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      status: patientsTable.status,
      doctorId: patientsTable.doctorId,
      marketingOptOut: patientsTable.marketingOptOut,
      updatedAt: patientsTable.updatedAt,
    })
    .from(patientsTable)
    .where(eq(patientsTable.clinicId, clinicId));

  const matches = all.filter((p) => phonesMatch(p.phone, rawPhone));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    logger.warn({ clinicId, matchCount: matches.length }, "Multiple patients share phone — using best match");
    const repeatSale = matches.find((p) => p.status === "repeat_sale");
    if (repeatSale) return repeatSale;
    return matches.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  }
  return matches[0]!;
}

export function normalizedPhoneForStorage(phone: string): string {
  return normalizePhoneDigits(phone);
}

/** Persist normalized phone when creating/updating patients. */
export async function backfillPatientPhoneNormalized(clinicId?: string): Promise<number> {
  const condition = clinicId
    ? and(eq(patientsTable.clinicId, clinicId), isNull(patientsTable.phoneNormalized))
    : isNull(patientsTable.phoneNormalized);

  const rows = await db
    .select({ id: patientsTable.id, phone: patientsTable.phone })
    .from(patientsTable)
    .where(condition);

  let updated = 0;
  for (const row of rows) {
    const norm = normalizedPhoneForStorage(row.phone);
    if (!norm) continue;
    await db.update(patientsTable).set({ phoneNormalized: norm }).where(eq(patientsTable.id, row.id));
    updated++;
  }
  return updated;
}

export async function setMarketingOptOut(patientId: string, clinicId: string, optOut: boolean): Promise<void> {
  await db
    .update(patientsTable)
    .set({ marketingOptOut: optOut, updatedAt: new Date() })
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.clinicId, clinicId)));
}
