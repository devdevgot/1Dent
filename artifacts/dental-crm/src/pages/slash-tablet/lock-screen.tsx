import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Delete, ShieldCheck, RefreshCw, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { OneDentLogo } from "./onedent-logo";
import type { TabletDoctor } from "./mock-data";
import {
  createTabletSession,
  getTabletSessionStatus,
  unlockTabletByUserPin,
  confirmTabletPairing,
  resolveCabinetByPairingCode,
  resolveCabinetIdFromUrl,
  applyCabinetIdToUrl,
  setTabletPin,
  type TabletCabinetBrief,
} from "@/lib/tablet-api";
import { bootstrapTabletSessionAuth } from "@/lib/tablet-auth";
import { TabletPinSetupModal } from "@/components/tablet/tablet-pin-setup-modal";

type Mode = "qr" | "pin" | "pairing";

export function LockScreen({
  onQrUnlock,
  onPinUnlock,
}: {
  onQrUnlock: (payload: { doctor: TabletDoctor; cabinet: TabletCabinetBrief }) => void;
  onPinUnlock: (payload: { doctor: TabletDoctor; cabinet: TabletCabinetBrief }) => void;
}) {
  const [mode, setMode] = useState<Mode>("qr");
  const [pin, setPin] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [cabinetPairingCode, setCabinetPairingCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [awaitingPairing, setAwaitingPairing] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [cabinetId, setCabinetId] = useState<string | null>(() => resolveCabinetIdFromUrl());
  const [cabinetName, setCabinetName] = useState("Кабинет");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinSetupLoading, setPinSetupLoading] = useState(false);
  const [pendingUnlock, setPendingUnlock] = useState<{
    doctor: TabletDoctor;
    cabinet: TabletCabinetBrief;
    auth: { token: string; user: Parameters<typeof bootstrapTabletSessionAuth>[1]; clinic: Parameters<typeof bootstrapTabletSessionAuth>[2] };
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unlockedRef = useRef(false);
  const bootstrappingRef = useRef(false);

  const handleUnlock = useCallback(
    (
      doctor: TabletDoctor,
      cabinet: TabletCabinetBrief,
      auth?: { token: string; user: Parameters<typeof bootstrapTabletSessionAuth>[1]; clinic: Parameters<typeof bootstrapTabletSessionAuth>[2] } | null,
      viaPin = false,
    ) => {
      if (!auth?.token || !auth.user || !auth.clinic) {
        setBootError("Не удалось авторизовать планшет. Обновите QR-код.");
        return;
      }
      unlockedRef.current = true;
      applyCabinetIdToUrl(cabinet.id);
      setCabinetId(cabinet.id);
      bootstrapTabletSessionAuth(auth.token, auth.user, auth.clinic);
      const payload = { doctor, cabinet };
      if (viaPin) {
        onPinUnlock(payload);
      } else {
        onQrUnlock(payload);
      }
    },
    [onQrUnlock, onPinUnlock],
  );

  const completePendingUnlock = useCallback(() => {
    if (!pendingUnlock) return;
    handleUnlock(pendingUnlock.doctor, pendingUnlock.cabinet, pendingUnlock.auth);
    setPendingUnlock(null);
    setPinSetupOpen(false);
  }, [pendingUnlock, handleUnlock]);

  const offerPinSetupAfterPairing = useCallback(
    (
      doctor: TabletDoctor,
      cabinet: TabletCabinetBrief,
      auth: { token: string; user: Parameters<typeof bootstrapTabletSessionAuth>[1]; clinic: Parameters<typeof bootstrapTabletSessionAuth>[2] },
    ) => {
      setPendingUnlock({ doctor, cabinet, auth });
      setPinSetupOpen(true);
    },
    [],
  );

  const submitPinSetup = useCallback(async (pin: string) => {
    if (!pendingUnlock) return;
    setPinSetupLoading(true);
    try {
      await setTabletPin(pin);
      completePendingUnlock();
    } catch {
      setBootError("Не удалось сохранить PIN. Попробуйте ещё раз или пропустите.");
      setPinSetupOpen(false);
      completePendingUnlock();
    } finally {
      setPinSetupLoading(false);
    }
  }, [pendingUnlock, completePendingUnlock]);

  const drawQr = useCallback(async (url: string) => {
    if (!canvasRef.current || !url) return false;
    try {
      await QRCode.toCanvas(canvasRef.current, url, {
        width: 236,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      return true;
    } catch {
      setBootError("Не удалось отобразить QR-код");
      return false;
    }
  }, []);

  const bootstrapSession = useCallback(async (forcedCabinetId?: string) => {
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;

    const id = forcedCabinetId ?? resolveCabinetIdFromUrl();
    setMode("qr");
    setLinkUrl("");
    setLoading(true);
    setBootError(null);
    unlockedRef.current = false;

    try {
      const res = await createTabletSession(id ?? undefined);
      setSessionId(res.data.sessionId);
      if (res.data.cabinet) {
        setCabinetId(res.data.cabinet.id);
        setCabinetName(res.data.cabinet.name);
      } else {
        setCabinetName("Подключение планшета");
      }
      setLinkUrl(res.data.linkUrl);
    } catch {
      setBootError("Не удалось создать сессию планшета. Проверьте подключение.");
    } finally {
      setLoading(false);
      bootstrappingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!linkUrl || loading) return;
    void drawQr(linkUrl);
  }, [linkUrl, loading, drawQr]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    if (!sessionId || mode === "pin") return;

    const poll = window.setInterval(async () => {
      if (unlockedRef.current) return;
      try {
        const res = await getTabletSessionStatus(sessionId);
        const { status, doctor, cabinet, auth, pairingCode: remotePairingCode } = res.data;

        if (status === "awaiting_pairing" && cabinet) {
          setAwaitingPairing(true);
          setMode("pairing");
          setCabinetName(cabinet.name);
          setCabinetId(cabinet.id);
          if (remotePairingCode) {
            setCabinetPairingCode(remotePairingCode);
          }
          return;
        }

        if (status === "unlocked" && doctor && cabinet) {
          handleUnlock(
            {
              id: doctor.id,
              name: doctor.name,
              specialty: doctor.specialty ?? "Врач",
              avatarColor: doctor.avatarColor,
            },
            cabinet,
            auth,
          );
        } else if (status === "expired") {
          void bootstrapSession(cabinetId ?? undefined);
        }
      } catch {
        /* ignore transient poll errors */
      }
    }, 2000);

    return () => window.clearInterval(poll);
  }, [sessionId, mode, handleUnlock, bootstrapSession, cabinetId]);

  const submitPairingCode = useCallback(async (code: string) => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setPairingError("Введите 6-значный код с телефона");
      return;
    }

    setPairingLoading(true);
    setPairingError("");
    try {
      if (awaitingPairing && sessionId) {
        const res = await confirmTabletPairing(sessionId, digits);
        const { cabinet, doctor, auth } = res.data;
        if (!doctor) {
          setPairingError("Не удалось определить врача. Отсканируйте QR снова.");
          return;
        }
        if (!auth?.token || !auth.user || !auth.clinic) {
          setPairingError("Не удалось авторизовать планшет. Отсканируйте QR снова.");
          return;
        }
        const doctorPayload = {
          id: doctor.id,
          name: doctor.name,
          specialty: doctor.specialty ?? "Врач",
          avatarColor: doctor.avatarColor,
        };
        offerPinSetupAfterPairing(doctorPayload, cabinet, auth);
        return;
      }

      const res = await resolveCabinetByPairingCode(digits);
      const cabinet = res.data.cabinet;
      setCabinetName(cabinet.name);
      applyCabinetIdToUrl(cabinet.id);
      setCabinetId(cabinet.id);
      setAwaitingPairing(false);
      setPairingCode("");
      await bootstrapSession(cabinet.id);
    } catch {
      setPairingError(awaitingPairing
        ? "Код не найден. Проверьте код на телефоне."
        : "Код не найден. Запросите новый код у врача или владельца.");
    } finally {
      setPairingLoading(false);
    }
  }, [sessionId, awaitingPairing, offerPinSetupAfterPairing, bootstrapSession]);

  const pressPairing = (d: string) => {
    setPairingError("");
    setPairingCode((p) => {
      const next = (p + d).slice(0, 6);
      if (next.length === 6) {
        setTimeout(() => void submitPairingCode(next), 150);
      }
      return next;
    });
  };

  const press = (d: string) => {
    setError(false);
    setPinError("");
    setPin((p) => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4) {
        const id = cabinetId ?? resolveCabinetIdFromUrl();
        if (!id) {
          setPinError("Сначала подключите планшет через QR-код");
          setPin("");
          return next;
        }
        setTimeout(() => {
          void unlockTabletByUserPin(id, next)
            .then((res) => {
              const { doctor, cabinet, auth } = res.data;
              handleUnlock(
                {
                  id: doctor.id,
                  name: doctor.name,
                  specialty: doctor.specialty ?? "Врач",
                  avatarColor: doctor.avatarColor,
                },
                cabinet,
                auth,
                true,
              );
            })
            .catch(() => {
              setError(true);
              setPinError("Неверный PIN. Настройте PIN в CRM, если ещё не сделали.");
              setPin("");
            });
        }, 150);
      }
      return next;
    });
  };

  const back = () => { setError(false); setPinError(""); setPin((p) => p.slice(0, -1)); };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <OneDentLogo className="absolute left-5 top-5 h-10" />

      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="text-2xl font-extrabold text-[#0f172a]">{cabinetName}</h1>
          <p className="mt-1 text-sm text-[#64748b]">SlashTablet · 1Dent</p>
        </div>

        {mode === "pairing" ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex w-full max-w-sm flex-col items-center rounded-3xl border border-[#e8e3d9] bg-white p-8 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2 text-[#0f172a]">
              <KeyRound className="h-5 w-5 text-[#1f75fe]" />
              <span className="text-base font-bold">Подключение кабинета</span>
            </div>
            <p className="mb-4 text-center text-sm text-[#64748b]">
              {awaitingPairing
                ? "Код отправлен с телефона. Введите его ниже или дождитесь обновления на экране."
                : "Введите 6-значный код с телефона или из CRM."}
            </p>

            {cabinetPairingCode && awaitingPairing && (
              <div className="mb-5 rounded-2xl border border-[#1f75fe]/20 bg-[#eff6ff] px-5 py-4 text-center">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#1f75fe]">Код в кабинете</p>
                <p className="font-mono text-3xl font-extrabold tracking-[0.35em] text-[#0f172a]">
                  {cabinetPairingCode}
                </p>
              </div>
            )}

            <div className={cn("mb-4 flex gap-2", pairingError && "animate-shake")}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border-2 text-lg font-bold transition-all",
                    pairingError ? "border-[#dc2626]" : "border-[#d4cfc6]",
                    pairingCode.length > i && (pairingError ? "border-[#dc2626] bg-[#fef2f2]" : "border-[#1f75fe] bg-[#eff6ff]"),
                  )}
                >
                  {pairingCode[i] ?? ""}
                </span>
              ))}
            </div>
            {pairingError && <p className="mb-4 text-sm font-medium text-[#dc2626]">{pairingError}</p>}

            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <PinKey key={d} onClick={() => pressPairing(d)} disabled={pairingLoading}>{d}</PinKey>
              ))}
              <div />
              <PinKey onClick={() => pressPairing("0")} disabled={pairingLoading}>0</PinKey>
              <PinKey onClick={() => setPairingCode((p) => p.slice(0, -1))} muted disabled={pairingLoading} aria-label="Стереть">
                <Delete className="h-6 w-6" />
              </PinKey>
            </div>

            <button
              type="button"
              onClick={() => { setMode("qr"); setPairingCode(""); setPairingError(""); }}
              className="mt-6 text-sm font-semibold text-[#1f75fe] hover:underline"
            >
              ← Вернуться к QR-коду
            </button>
          </motion.div>
        ) : bootError ? (
          <div className="rounded-3xl border border-[#fecaca] bg-[#fef2f2] p-8 text-center">
            <p className="text-sm text-[#dc2626]">{bootError}</p>
            <button
              type="button"
              onClick={() => void bootstrapSession(cabinetId ?? undefined)}
              className="mt-4 rounded-xl bg-[#1f75fe] px-4 py-2 text-sm font-semibold text-white"
            >
              Повторить
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
            <AnimatePresence mode="wait">
              {mode === "qr" ? (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  className="col-span-full flex flex-col items-center rounded-3xl border border-[#e8e3d9] bg-white p-8 shadow-sm md:col-span-3"
                >
                  <div className="mb-5 flex items-center gap-2 text-[#0f172a]">
                    <Smartphone className="h-5 w-5 text-[#1f75fe]" />
                    <span className="text-base font-bold">Отсканируйте QR-код смартфоном</span>
                  </div>

                  <div className="relative rounded-2xl border border-[#e8e3d9] bg-white p-4">
                    <canvas
                      ref={canvasRef}
                      className={cn("rounded-lg", loading && "opacity-0")}
                      width={236}
                      height={236}
                    />
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
                      </div>
                    )}
                  </div>

                  <p className="mt-5 max-w-md text-center text-sm leading-relaxed text-[#64748b]">
                    {cabinetId
                      ? "Откройте CRM на телефоне → нажмите сканер рядом с поиском → наведите на код."
                      : "При первом подключении отсканируйте QR с телефона. На телефоне появится код для привязки кабинета."}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setMode("pin"); setPin(""); setError(false); }}
                      className="rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b]"
                    >
                      Войти по PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMode("pairing"); setPairingCode(""); setPairingError(""); setAwaitingPairing(false); }}
                      className="rounded-xl border border-[#e8e3d9] bg-white px-4 py-3 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
                    >
                      У меня есть код
                    </button>
                    <button
                      type="button"
                      onClick={() => void bootstrapSession(cabinetId ?? undefined)}
                      className="flex items-center gap-2 rounded-xl border border-[#e8e3d9] bg-white px-4 py-3 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
                    >
                      <RefreshCw className="h-4 w-4" /> Обновить код
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pin"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  className="col-span-full mx-auto flex w-full max-w-sm flex-col items-center rounded-3xl border border-[#e8e3d9] bg-white p-8 shadow-sm md:col-span-3"
                >
                  <div className="mb-2 flex items-center gap-2 text-[#0f172a]">
                    <ShieldCheck className="h-5 w-5 text-[#1f75fe]" />
                    <span className="text-base font-bold">Вход по PIN</span>
                  </div>
                  <p className="mb-6 text-xs text-[#94a3b8]">4 цифры · альтернатива сканированию QR</p>

                  <div className={cn("mb-6 flex gap-4", error && "animate-shake")}>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-4 w-4 rounded-full border-2 transition-all",
                          error ? "border-[#dc2626]" : "border-[#d4cfc6]",
                          pin.length > i && (error ? "bg-[#dc2626]" : "border-[#1f75fe] bg-[#1f75fe]"),
                        )}
                      />
                    ))}
                  </div>
                  {pinError && <p className="mb-4 -mt-2 text-sm font-medium text-[#dc2626]">{pinError}</p>}

                  <div className="grid grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                      <PinKey key={d} onClick={() => press(d)}>{d}</PinKey>
                    ))}
                    <div />
                    <PinKey onClick={() => press("0")}>0</PinKey>
                    <PinKey onClick={back} muted aria-label="Стереть"><Delete className="h-6 w-6" /></PinKey>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setMode("qr"); setPin(""); setError(false); }}
                    className="mt-6 text-sm font-semibold text-[#1f75fe] hover:underline"
                  >
                    ← Вернуться к QR-коду
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <TabletPinSetupModal
        open={pinSetupOpen}
        onClose={completePendingUnlock}
        onSubmit={(pin) => void submitPinSetup(pin)}
        loading={pinSetupLoading}
        skipLabel="Пропустить"
      />
    </div>
  );
}

function PinKey({
  children, onClick, muted, disabled, ...rest
}: { children: React.ReactNode; onClick: () => void; muted?: boolean; disabled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-semibold transition-all active:scale-90 disabled:opacity-50",
        muted
          ? "text-[#64748b] hover:bg-[#f1ede4]"
          : "bg-[#faf8f4] text-[#0f172a] hover:bg-[#f1ede4] active:bg-[#e8e3d9]",
      )}
    >
      {children}
    </button>
  );
}
