import { getPublicAppBaseUrl } from "./public-url";

/** Domain-bound OTP hint for iOS Safari / QuickType autofill (`@domain #123456`). */
export function otpDomainHint(code: string): string {
  try {
    const host = new URL(getPublicAppBaseUrl()).hostname.replace(/^www\./, "");
    return `@${host} #${code}`;
  } catch {
    return `@1dent.kz #${code}`;
  }
}

export function appendOtpAutofillHint(message: string, code: string): string {
  return `${message}\n\n${otpDomainHint(code)}`;
}
