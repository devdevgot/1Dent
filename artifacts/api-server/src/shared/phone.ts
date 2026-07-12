/** Strip all non-digit characters from a phone string. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Canonical form for KZ/RU numbers: 11-digit 8XXXXXXXXXX → 7XXXXXXXXXX. */
export function canonicalPhoneDigits(digits: string): string {
  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  return digits;
}

/** Compare two phone strings after digit normalization (handles 7 vs 8 prefix). */
export function phonesMatch(a: string, b: string): boolean {
  const digitsA = canonicalPhoneDigits(normalizePhoneDigits(a));
  const digitsB = canonicalPhoneDigits(normalizePhoneDigits(b));
  return digitsA.length > 0 && digitsA === digitsB;
}
