import { useCallback, useEffect, useState } from "react";
import { Lock, ScanFace } from "lucide-react";
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
  const [shaking, setShaking] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const config = loadAppLockConfig();
  const failedAttempts = useAppLockStore((s) => s.failedAttempts);
  const unlockWithPin = useAppLockStore((s) => s.unlockWithPin);
  const unlockWithBiometric = useAppLockStore((s) => s.unlockWithBiometric);

  const lockedOut = failedAttempts >= MAX_ATTEMPTS;

  const flashError = useCallback((message: string) => {
    setError(message);
    setShaking(true);
    window.setTimeout(() => setShaking(false), 450);
  }, []);

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
          flashError(t("appLock.tooManyAttempts"));
        } else {
          flashError(t("appLock.wrongPin"));
        }
      }
      setSubmitting(false);
    },
    [unlockWithPin, failedAttempts, flashError, t],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (submitting || lockedOut) return;
      setError("");
      setPin((prev) => {
        const next = (prev + digit).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          window.setTimeout(() => void submitPin(next), 120);
        }
        return next;
      });
    },
    [submitting, lockedOut, submitPin],
  );

  const handleDelete = useCallback(() => {
    if (submitting) return;
    setPin((p) => p.slice(0, -1));
    setError("");
  }, [submitting]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDigit, handleDelete]);

  const showBiometric = Boolean(config?.biometricEnabled && biometricAvailable);

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-[#faf8f4] safe-area-top safe-area-bottom">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(circle, rgba(31,117,254,0.14) 0%, rgba(31,117,254,0.04) 45%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 -right-32 h-[520px] w-[520px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(241,237,228,0.9) 0%, rgba(250,248,244,0.4) 45%, transparent 70%)",
        }}
      />

      <div className="relative flex h-full flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center animate-in-fade">
          {/* Brand */}
          <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-[#e8e4dc] bg-white shadow-[0_8px_32px_rgba(31,117,254,0.12)]">
            <img src="/logo.png" alt="1Dent" className="h-11 w-11 rounded-xl" />
          </div>

          <h1 className="mb-1.5 text-[22px] font-semibold tracking-tight text-[#0f172a]">
            {t("appLock.title")}
          </h1>
          <p className="mb-9 flex items-center gap-1.5 text-[13px] text-[#64748b]">
            <Lock className="h-3.5 w-3.5" />
            {t("appLock.subtitle")}
          </p>

          {/* PIN dots */}
          <div
            className={cn("mb-4 flex gap-5", shaking && "animate-shake")}
            aria-hidden
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < pin.length;
              return (
                <div
                  key={i}
                  className={cn(
                    "h-[13px] w-[13px] rounded-full border-2 transition-all duration-200",
                    error
                      ? "border-[#dc2626]"
                      : filled
                        ? "border-[#1f75fe] bg-[#1f75fe] scale-110 shadow-[0_0_10px_rgba(31,117,254,0.35)]"
                        : "border-[#d4cfc6] bg-transparent",
                    error && filled && "bg-[#dc2626] border-[#dc2626]",
                  )}
                />
              );
            })}
          </div>

          <div className="mb-6 flex h-5 items-center">
            {error ? (
              <p className="text-[13px] font-medium text-[#dc2626]" role="alert">
                {error}
              </p>
            ) : failedAttempts > 0 && !lockedOut ? (
              <p className="text-[13px] text-[#94a3b8]">
                {failedAttempts}/{MAX_ATTEMPTS}
              </p>
            ) : null}
          </div>

          <PinKeypad
            onDigit={handleDigit}
            onDelete={handleDelete}
            disabled={submitting || lockedOut}
            deleteVisible={pin.length > 0}
            cornerSlot={
              showBiometric ? (
                <button
                  type="button"
                  onClick={() => void tryBiometric()}
                  disabled={submitting}
                  aria-label={t("appLock.useBiometric")}
                  className="flex h-[68px] w-[68px] items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-90 active:bg-[#f1ede4] disabled:opacity-35"
                >
                  <ScanFace className="h-8 w-8 text-[#1f75fe]" strokeWidth={1.5} />
                </button>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
