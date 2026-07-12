import { randomUUID } from "crypto";
import { db, patientsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { canonicalPhoneDigits, normalizePhoneDigits, phonesMatch } from "./phone";
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
  const digits = canonicalPhoneDigits(normalizePhoneDigits(rawPhone));
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
  return canonicalPhoneDigits(normalizePhoneDigits(phone));
}

function formatWhatsAppPhoneDisplay(phone: string): string {
  const digits = normalizedPhoneForStorage(phone);
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone.trim() || digits;
}

/** Create or return a CRM patient row for an inbound WhatsApp number so staff chat can show the thread. */
export async function ensureWhatsAppContactPatient(
  clinicId: string,
  rawPhone: string,
): Promise<ResolvedPatient> {
  const existing = await resolvePatientByPhone(clinicId, rawPhone);
  if (existing) return existing;

  const id = randomUUID();
  const displayPhone = formatWhatsAppPhoneDisplay(rawPhone);
  const [patient] = await db
    .insert(patientsTable)
    .values({
      id,
      clinicId,
      name: displayPhone,
      phone: displayPhone,
      phoneNormalized: normalizedPhoneForStorage(rawPhone),
      source: "whatsapp",
      status: "new_request",
    })
    .returning({
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      status: patientsTable.status,
      doctorId: patientsTable.doctorId,
      marketingOptOut: patientsTable.marketingOptOut,
    });

  logger.info({ clinicId, patientId: id, phone: displayPhone }, "Created WhatsApp contact patient for chat sync");
  return patient!;
}

/** Update lead patient name once the chatbot collects it. */
export async function updatePatientNameByPhone(
  clinicId: string,
  rawPhone: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return;

  const patient = await resolvePatientByPhone(clinicId, rawPhone);
  if (!patient) return;

  const currentName = patient.name.trim();
  const looksLikePhoneOnly =
    /^\+?\d[\d\s()-]{6,}$/.test(currentName) || currentName === formatWhatsAppPhoneDisplay(rawPhone);

  if (!looksLikePhoneOnly && currentName.length > 2 && currentName !== trimmed) return;

  await db
    .update(patientsTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(patientsTable.id, patient.id), eq(patientsTable.clinicId, clinicId)));
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
