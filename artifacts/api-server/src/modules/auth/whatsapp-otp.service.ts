import { randomBytes } from "crypto";
import { normalizePhoneDigits, phonesMatch, normalizeAuthPhone } from "../../shared/phone";
import { sendPlatformWhatsApp } from "../../shared/platform-whatsapp";
import { ValidationError, UnauthorizedError, NotFoundError, TooManyRequestsError } from "../../shared/errors";
import { logger } from "../../lib/logger";
import { appendOtpAutofillHint } from "../../shared/otp-message";

export type WhatsappOtpPurpose = "login" | "register" | "staff_invite" | "reset_password";

interface OtpEntry {
  code: string;
  phone: string;
  purpose: WhatsappOtpPurpose;
  expiresAt: number;
  verified: boolean;
  verificationToken?: string;
  verificationExpiresAt?: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFICATION_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const otpStore = new Map<string, OtpEntry>();
const resendCooldown = new Map<string, number>();

function otpKey(purpose: WhatsappOtpPurpose, phone: string): string {
  return `${purpose}:${normalizePhoneDigits(phone)}`;
}

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(phone: string): string {
  try {
    return normalizeAuthPhone(phone);
  } catch {
    throw new ValidationError("Введите корректный номер телефона");
  }
}

function otpMessage(code: string, purpose: WhatsappOtpPurpose): string {
  const suffix = "Код действителен 5 минут. Не передавайте его третьим лицам.";
  const label =
    purpose === "login"
      ? "Ваш код для входа в 1Dent"
      : purpose === "register"
        ? "Ваш код для подтверждения регистрации"
        : purpose === "reset_password"
          ? "Ваш код для сброса пароля"
          : "Ваш код подтверждения 1Dent";

  return appendOtpAutofillHint(`${code} - ${label}. ${suffix}`, code);
}

export function formatPhoneForDisplay(phone: string): string {
  const d = normalizePhoneDigits(phone);
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }
  return phone;
}

export class WhatsappOtpService {
  normalizePhone = normalizePhone;

  async requestOtp(phone: string, purpose: WhatsappOtpPurpose): Promise<{ phone: string; devCode?: string }> {
    const normalized = normalizePhone(phone);
    const key = otpKey(purpose, normalized);

    const lastSent = resendCooldown.get(key);
    if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      throw new TooManyRequestsError(`Код уже отправлен. Повторите через ${remaining} сек.`);
    }

    const code = generateOtpCode();
    otpStore.set(key, {
      code,
      phone: normalized,
      purpose,
      expiresAt: Date.now() + OTP_TTL_MS,
      verified: false,
    });
    resendCooldown.set(key, Date.now());
    setTimeout(() => resendCooldown.delete(key), RESEND_COOLDOWN_MS);

    const message = otpMessage(code, purpose);
    sendPlatformWhatsApp(normalized, message).catch((err) => {
      logger.error({ err, phone: normalized.slice(0, 5) + "***", purpose }, "Failed to send WhatsApp OTP");
    });

    const result: { phone: string; devCode?: string } = { phone: normalized };
    if (process.env["NODE_ENV"] !== "production") {
      result.devCode = code;
    }
    return result;
  }

  verifyOtp(
    phone: string,
    code: string,
    purpose: WhatsappOtpPurpose,
  ): { phone: string; verificationToken: string } {
    const normalized = normalizePhone(phone);
    const key = otpKey(purpose, normalized);
    const entry = otpStore.get(key);

    if (!entry || entry.purpose !== purpose || !phonesMatch(entry.phone, normalized)) {
      throw new UnauthorizedError("Неверный код. Запросите новый.");
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      throw new ValidationError("Код истёк. Запросите новый.");
    }

    if (entry.code !== code.trim()) {
      throw new UnauthorizedError("Неверный код. Попробуйте снова.");
    }

    const verificationToken = randomBytes(24).toString("hex");
    entry.verified = true;
    entry.verificationToken = verificationToken;
    entry.verificationExpiresAt = Date.now() + VERIFICATION_TTL_MS;

    return { phone: normalized, verificationToken };
  }

  assertVerificationToken(
    phone: string,
    verificationToken: string,
    purpose: WhatsappOtpPurpose,
  ): string {
    const normalized = normalizePhone(phone);
    const key = otpKey(purpose, normalized);
    const entry = otpStore.get(key);

    if (
      !entry
      || !entry.verified
      || entry.purpose !== purpose
      || entry.verificationToken !== verificationToken
      || !entry.verificationExpiresAt
      || Date.now() > entry.verificationExpiresAt
    ) {
      throw new UnauthorizedError("Подтверждение телефона истекло. Запросите код снова.");
    }

    otpStore.delete(key);
    return normalized;
  }

  consumeVerificationForLogin(phone: string, code: string): string {
    const { phone: normalized } = this.verifyOtp(phone, code, "login");
    otpStore.delete(otpKey("login", normalized));
    return normalized;
  }
}

export const whatsappOtpService = new WhatsappOtpService();

export function buildStaffInviteWhatsAppMessage(
  name: string,
  clinicName: string,
  tempPassword: string,
  loginUrl: string,
): string {
  return (
    `👋 Здравствуйте, ${name}!\n\n` +
    `Вас добавили в клинику «${clinicName}» в системе 1Dent.\n\n` +
    `🔑 Временный пароль: *${tempPassword}*\n` +
    `🔗 Войти: ${loginUrl}\n\n` +
    `Используйте номер WhatsApp для входа. После первого входа смените пароль в настройках.`
  );
}
