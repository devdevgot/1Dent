/**
 * Channel attribution helpers for WhatsApp referral links.
 *
 * Flow:
 * 1. /ref/:code embeds `(ref:<code> cid:<uuid>)` into the wa.me prefilled text
 * 2. Chatbot parses those tokens from the first inbound message
 * 3. Patient.source becomes `ref:<code>` and channel_clicks.patient_id is linked
 */

const REF_CODE_RE = /ref:([a-f0-9]{4,8})/i;
const CLICK_ID_RE =
  /cid:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Sources that may be overwritten by a first-touch channel attribution. */
export const GENERIC_PATIENT_SOURCES = new Set(["whatsapp", "chatbot", ""]);

export function extractRefCode(text: string): string | null {
  const match = text.match(REF_CODE_RE);
  return match?.[1] ? match[1].toLowerCase() : null;
}

export function extractClickId(text: string): string | null {
  const match = text.match(CLICK_ID_RE);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** Canonical patient.source value for a channel ref code. */
export function patientSourceFromRefCode(refCode: string): string {
  return `ref:${refCode.toLowerCase()}`;
}

/** Prefill text for wa.me — greeting on line 1, compact tokens on line 2. */
export function buildWhatsAppPrefillText(refCode: string, clickId: string): string {
  return `Здравствуйте, хочу записаться на приём 👋\n(ref:${refCode} cid:${clickId})`;
}

export function isGenericPatientSource(source: string | null | undefined): boolean {
  if (source == null) return true;
  return GENERIC_PATIENT_SOURCES.has(source.trim().toLowerCase());
}

/** Match helpers used by analytics readers (CRM + TMA). */
export function patientMatchesChannelSource(
  patientSource: string | null | undefined,
  refCode: string,
  channelId?: string,
): boolean {
  if (!patientSource) return false;
  const tag = patientSourceFromRefCode(refCode);
  return (
    patientSource === tag ||
    patientSource === refCode ||
    (channelId != null && patientSource === channelId)
  );
}
