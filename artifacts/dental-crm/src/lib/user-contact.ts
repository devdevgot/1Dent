import { formatPhoneInput } from "@/lib/whatsapp-auth";

/** Backend stores WhatsApp logins as `{digits}@wa.1dent.internal`. */
const WA_INTERNAL_SUFFIX = "@wa.1dent.internal";

export function isWhatsappSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(WA_INTERNAL_SUFFIX));
}

/** Digits-only phone extracted from a synthetic WhatsApp email, or null. */
export function phoneDigitsFromUserEmail(email: string | null | undefined): string | null {
  if (!email || !isWhatsappSyntheticEmail(email)) return null;
  const local = email.slice(0, email.indexOf("@"));
  const digits = local.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

/** Human-readable phone for Profile (`+7 777 145 35 93`), or null if not WhatsApp. */
export function formatUserPhoneDisplay(email: string | null | undefined): string | null {
  const digits = phoneDigitsFromUserEmail(email);
  if (!digits) return null;
  return formatPhoneInput(digits);
}
