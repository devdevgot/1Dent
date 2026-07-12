import { useEffect, useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  AuthField,
  AuthGhostButton,
  AuthPrimaryButton,
  WhatsappBadge,
} from "@/components/auth/auth-ui";
import {
  formatPhoneInput,
  phoneToApi,
  requestWhatsappOtp,
  verifyWhatsappOtpLogin,
  verifyWhatsappOtpRegister,
  verifyWhatsappOtpReset,
  type WhatsappOtpPurpose,
} from "@/lib/whatsapp-auth";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { Loader2 } from "lucide-react";

type Step = "phone" | "otp";

interface WhatsappOtpFlowProps {
  purpose: WhatsappOtpPurpose;
  title: string;
  subtitle: string;
  onLoginSuccess?: (data: {
    user: NonNullable<Awaited<ReturnType<typeof verifyWhatsappOtpLogin>>["data"]>["user"];
    clinic: NonNullable<Awaited<ReturnType<typeof verifyWhatsappOtpLogin>>["data"]>["clinic"];
    token: string;
  }) => void;
  onRegisterVerified?: (data: { phone: string; verificationToken: string }) => void;
  onResetVerified?: (data: { phone: string; verificationToken: string }) => void;
}

export function WhatsappOtpFlow({
  purpose,
  title,
  subtitle,
  onLoginSuccess,
  onRegisterVerified,
  onResetVerified,
}: WhatsappOtpFlowProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleRequestOtp() {
    setError("");
    const apiPhone = phoneToApi(phone);
    if (apiPhone.length < 11) {
      setError("Введите номер WhatsApp полностью");
      return;
    }

    setLoading(true);
    try {
      const res = await requestWhatsappOtp(apiPhone, purpose);
      setNormalizedPhone(res.data?.phone ?? apiPhone);
      setStep("otp");
      setCooldown(60);
      if (res.devCode) {
        setCode(res.devCode);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Не удалось отправить код"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(otpCode: string) {
    if (otpCode.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      if (purpose === "login") {
        const res = await verifyWhatsappOtpLogin(normalizedPhone, otpCode);
        if (!res.data?.user || !res.data?.clinic || !res.data?.token) {
          throw new Error("Invalid response");
        }
        onLoginSuccess?.({
          user: res.data.user,
          clinic: res.data.clinic,
          token: res.data.token,
        });
        return;
      }

      if (purpose === "reset_password") {
        const res = await verifyWhatsappOtpReset(normalizedPhone, otpCode);
        if (!res.data?.verificationToken) {
          throw new Error("Invalid response");
        }
        onResetVerified?.({
          phone: res.data.phone,
          verificationToken: res.data.verificationToken,
        });
        return;
      }

      const res = await verifyWhatsappOtpRegister(normalizedPhone, otpCode);
      if (!res.data?.verificationToken) {
        throw new Error("Invalid response");
      }
      onRegisterVerified?.({
        phone: res.data.phone,
        verificationToken: res.data.verificationToken,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Неверный или просроченный код"));
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  if (step === "phone") {
    return (
      <div>
        <WhatsappBadge />
        <h2 className="text-xl font-bold text-[#0f172a] text-center mb-1">{title}</h2>
        <p className="text-sm text-[#64748b] text-center mb-5 leading-relaxed">{subtitle}</p>

        <div className="space-y-3">
          <AuthField label="Номер WhatsApp" error={error}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhoneInput(e.target.value));
                if (error) setError("");
              }}
              placeholder="+7 700 000 00 00"
              autoComplete="tel"
              className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none"
            />
          </AuthField>

          <AuthPrimaryButton disabled={loading} onClick={handleRequestOtp}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Отправляем...
              </span>
            ) : (
              "Получить код в WhatsApp"
            )}
          </AuthPrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <WhatsappBadge />
      <h2 className="text-xl font-bold text-[#0f172a] text-center mb-1">Введите код</h2>
      <p className="text-sm text-[#64748b] text-center mb-5">
        Код отправлен в WhatsApp на номер<br />
        <span className="font-semibold text-[#0f172a]">{formatPhoneInput(normalizedPhone)}</span>
      </p>

      <div className="flex flex-col items-center gap-4">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError("");
            if (v.length === 6) void handleVerifyOtp(v);
          }}
          disabled={loading}
        >
          <InputOTPGroup className="gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-11 w-10 rounded-xl border-[#e8e3d9] text-base font-bold first:rounded-xl last:rounded-xl hover:border-[#cfc9bd] transition-colors"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error && <p className="text-xs text-[#dc2626] font-medium text-center">{error}</p>}
        {loading && (
          <p className="text-xs text-[#94a3b8] inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Проверяем...
          </p>
        )}

        <AuthGhostButton
          disabled={loading || cooldown > 0}
          onClick={() => void handleRequestOtp()}
        >
          {cooldown > 0 ? `Отправить снова через ${cooldown}с` : "Отправить код повторно"}
        </AuthGhostButton>

        <AuthGhostButton
          onClick={() => {
            setStep("phone");
            setCode("");
            setError("");
          }}
        >
          Изменить номер
        </AuthGhostButton>
      </div>
    </div>
  );
}
