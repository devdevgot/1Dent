import { randomUUID } from "crypto";
import { db, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function buildGreenApiWebhookUrl(baseUrl: string, clinicId: string, secret: string | null): string {
  const base = `${baseUrl}/api/webhook/greenapi/${clinicId}`;
  return secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;
}

export async function ensureGreenApiWebhookSecret(clinicId: string): Promise<string> {
  const [clinic] = await db
    .select({ secret: clinicsTable.greenApiWebhookSecret })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId))
    .limit(1);

  if (clinic?.secret) return clinic.secret;

  const secret = randomUUID().replace(/-/g, "");
  await db
    .update(clinicsTable)
    .set({ greenApiWebhookSecret: secret })
    .where(eq(clinicsTable.id, clinicId));

  return secret;
}

export function isValidWebhookSecret(
  expected: string | null | undefined,
  provided: string | undefined,
): boolean {
  if (!expected) return true;
  return !!provided && provided === expected;
}
