import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PinKeypad } from "./pin-keypad";
import { useAppLockStore } from "@/lib/app-lock/store";
import { canUseBiometricUnlock } from "@/lib/app-lock/webauthn";
import { loadAppLockConfig } from "@/lib/app-lock/storage";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;

export function AppLockScreen() {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const config = loadAppLockConfig();
  const failedAttempts = useAppLockStore((s) => s.failedAttempts);
  const unlockWithPin = useAppLockStore((s) => s.unlockWithPin);
  const unlockWithBiometric = useAppLockStore((s) => s.unlockWithBiometric);

  const tryBiometric = useCallback(async () => {
    if (!config?.biometricEnabled) return;
    setSubmitting(true);
    setError("");
    const ok = await unlockWithBiometric();
    if (!ok) {
      setError(t("appLock.biometricFailed"));
    }
    setSubmitting(false);
  }, [config?.biometricEnabled, unlockWithBiometric, t]);

  useEffect(() => {
    void canUseBiometricUnlock().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    if (config?.biometricEnabled && biometricAvailable) {
      void tryBiometric();
    }
  }, [config?.biometricEnabled, biometricAvailable, tryBiometric]);

  const submitPin = useCallback(
    async (value: string) => {
      if (value.length !== PIN_LENGTH) return;
      setSubmitting(true);
      setError("");
      const ok = await unlockWithPin(value);
      if (!ok) {
        setPin("");
        if (failedAttempts + 1 >= MAX_ATTEMPTS) {
          setError(t("appLock.tooManyAttempts"));
        } else {
          setError(t("appLock.wrongPin"));
        }
      }
      setSubmitting(false);
    },
    [unlockWithPin, failedAttempts, t],
  );

  const handleDigit = (digit: string) => {
    if (submitting || failedAttempts >= MAX_ATTEMPTS) return;
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    setError("");
    if (next.length === PIN_LENGTH) {
      void submitPin(next);
    }
  };

  const handleDelete = () => {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#faf8f4] px-6 safe-area-top safe-area-bottom">
      <div className="flex flex-col items-center w-full max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-[#1f75fe]/10 flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-[#1f75fe]" />
        </div>

        <h1 className="text-xl font-semibold text-[#0f172a] mb-2">
          {t("appLock.title")}
        </h1>
        <p className="text-sm text-[#64748b] text-center mb-8">
          {t("appLock.subtitle")}
        </p>

        <div className="flex gap-3 mb-8" aria-hidden>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-3 h-3 rounded-full transition-all",
                i < pin.length ? "bg-[#1f75fe] scale-110" : "bg-[#d4cfc6]",
              )}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-[#dc2626] mb-4 text-center" role="alert">
            {error}
          </p>
        )}

        <PinKeypad
          onDigit={handleDigit}
          onDelete={handleDelete}
          disabled={submitting || failedAttempts >= MAX_ATTEMPTS}
        />

        {config?.biometricEnabled && biometricAvailable && (
          <button
            type="button"
            onClick={() => void tryBiometric()}
            disabled={submitting}
            className="mt-8 flex items-center gap-2 text-[#1f75fe] font-medium disabled:opacity-50"
          >
            <Fingerprint className="w-5 h-5" />
            {t("appLock.useBiometric")}
          </button>
        )}
      </div>
    </div>
  );
}
