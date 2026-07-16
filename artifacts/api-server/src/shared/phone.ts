/** Strip all non-digit characters from a phone string. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Canonical form for KZ/RU numbers (11-digit 7XXXXXXXXXX). */
export function canonicalPhoneDigits(digits: string): string {
  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

/** Normalize a phone for auth/WhatsApp flows (matches OTP service rules). */
export function normalizeAuthPhone(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) {
    throw new Error("INVALID_PHONE");
  }
  return canonicalPhoneDigits(digits);
}

export function syntheticWhatsappEmail(phone: string): string {
  return `${normalizeAuthPhone(phone)}@wa.1dent.internal`;
}

/** Compare two phone strings after digit normalization (handles 7 vs 8 prefix). */
export function phonesMatch(a: string, b: string): boolean {
  const digitsA = canonicalPhoneDigits(normalizePhoneDigits(a));
  const digitsB = canonicalPhoneDigits(normalizePhoneDigits(b));
  return digitsA.length >= 10 && digitsA === digitsB;
}
