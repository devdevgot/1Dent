import { customFetch } from "@workspace/api-client-react";

export type WhatsappOtpPurpose = "login" | "register";

export async function requestWhatsappOtp(phone: string, purpose: WhatsappOtpPurpose) {
  return customFetch<{ success: boolean; data: { phone: string }; devCode?: string }>(
    "/api/auth/whatsapp/request-otp",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose }),
    },
  );
}

export async function verifyWhatsappOtpLogin(phone: string, code: string) {
  return customFetch<{
    success: boolean;
    data: {
      user: Parameters<typeof import("@/lib/auth-session").persistAuthSession>[0]["user"];
      clinic: Parameters<typeof import("@/lib/auth-session").persistAuthSession>[0]["clinic"];
      token: string;
    };
  }>("/api/auth/whatsapp/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, purpose: "login" as const }),
  });
}

export async function verifyWhatsappOtpRegister(phone: string, code: string) {
  return customFetch<{
    success: boolean;
    data: { phone: string; verificationToken: string };
  }>("/api/auth/whatsapp/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, purpose: "register" as const }),
  });
}

export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 1) return `+7`;
  if (digits.startsWith("7") || digits.startsWith("8")) {
    const rest = digits.startsWith("8") ? digits.slice(1) : digits.slice(1);
    let out = "+7";
    if (rest.length > 0) out += ` ${rest.slice(0, 3)}`;
    if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
    if (rest.length > 6) out += ` ${rest.slice(6, 8)}`;
    if (rest.length > 8) out += ` ${rest.slice(8, 10)}`;
    return out;
  }
  return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`.trim();
}

export function phoneToApi(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}
