import { canonicalPhoneDigits, normalizePhoneDigits } from "../../shared/phone";

/** Canonical E.164-style key for chatbot sessions and message history. */
export function canonicalChatbotPhone(phone: string): string {
  const digits = canonicalPhoneDigits(normalizePhoneDigits(phone));
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone.trim();
}

/** All phone string variants that may exist in legacy chatbot rows. */
export function chatbotPhoneLookupKeys(phone: string): string[] {
  const raw = phone.trim();
  const canonical = canonicalChatbotPhone(raw);
  const digits = canonicalPhoneDigits(normalizePhoneDigits(raw));
  const keys = new Set<string>();
  if (raw) keys.add(raw);
  if (canonical) keys.add(canonical);
  if (digits) keys.add(digits);
  if (digits.length === 11) keys.add(`+${digits}`);
  return [...keys];
}
