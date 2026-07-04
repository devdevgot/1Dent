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
  verifyTabletCabinetPin,
  resolveCabinetIdFromUrl,
  resolveCabinetByPairingCode,
  applyCabinetIdToUrl,
  type TabletCabinetBrief,
} from "@/lib/tablet-api";
import { bootstrapTabletSessionAuth } from "@/lib/tablet-auth";

type Mode = "qr" | "pin" | "pairing";

export function LockScreen({
  onQrUnlock,
  onPinUnlock,
}: {
  onQrUnlock: (payload: { doctor: TabletDoctor; cabinet: TabletCabinetBrief }) => void;
  onPinUnlock: () => void;
}) {
  const [mode, setMode] = useState<Mode>("qr");
  const [pin, setPin] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [cabinetId, setCabinetId] = useState<string | null>(() => resolveCabinetIdFromUrl());
  const [cabinetName, setCabinetName] = useState("Кабинет");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unlockedRef = useRef(false);

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
    const id = forcedCabinetId ?? resolveCabinetIdFromUrl() ?? cabinetId;
    if (!id) {
      setMode("pairing");
      setBootError(null);
      setLoading(false);
      return;
    }
    setCabinetId(id);
    applyCabinetIdToUrl(id);
    setMode("qr");
    setLinkUrl("");
    setLoading(true);
    setBootError(null);
    try {
      const res = await createTabletSession(id);
      setSessionId(res.data.sessionId);
      setCabinetName(res.data.cabinet.name);
      setLinkUrl(res.data.linkUrl);
    } catch {
      setBootError("Не удалось создать сессию планшета. Проверьте подключение.");
    } finally {
      setLoading(false);
    }
  }, [cabinetId]);

  useEffect(() => {
    if (!linkUrl || loading) return;
    void drawQr(linkUrl);
  }, [linkUrl, loading, drawQr]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    if (!sessionId || mode !== "qr") return;

    const poll = window.setInterval(async () => {
      if (unlockedRef.current) return;
      try {
        const res = await getTabletSessionStatus(sessionId);
        const { status, doctor, cabinet, auth } = res.data;
        if (status === "unlocked" && doctor) {
          if (!auth?.token || !auth.user || !auth.clinic) {
            setBootError("Не удалось авторизовать планшет. Обновите QR-код.");
            void bootstrapSession();
            return;
          }
          unlockedRef.current = true;
          bootstrapTabletSessionAuth(auth.token, auth.user, auth.clinic);
          onQrUnlock({
            cabinet,
            doctor: {
              id: doctor.id,
              name: doctor.name,
              specialty: doctor.specialty ?? "Врач",
              avatarColor: doctor.avatarColor,
            },
          });
        } else if (status === "expired") {
          void bootstrapSession();
        }
      } catch {
        /* ignore transient poll errors */
      }
    }, 2000);

    return () => window.clearInterval(poll);
  }, [sessionId, mode, onQrUnlock, bootstrapSession]);

  const submitPairingCode = useCallback(async (code: string) => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setPairingError("Введите 6-значный код из CRM");
      return;
    }
    setPairingLoading(true);
    setPairingError("");
    try {
      const res = await resolveCabinetByPairingCode(digits);
      const cabinet = res.data.cabinet;
      setCabinetName(cabinet.name);
      await bootstrapSession(cabinet.id);
    } catch {
      setPairingError("Код не найден. Запросите новый код у врача или владельца.");
    } finally {
      setPairingLoading(false);
    }
  }, [bootstrapSession]);

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
      if (next.length === 4 && cabinetId) {
        setTimeout(() => {
          void verifyTabletCabinetPin(cabinetId, next)
            .then(() => {
              setPinError("Аварийный PIN подтверждён. Для работы с пациентами отсканируйте QR-код.");
              setPin("");
            })
            .catch(() => {
              setError(true);
              setPinError("Неверный PIN кабинета");
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
            <p className="mb-6 text-center text-sm text-[#64748b]">
              Врач или владелец открывает <strong>/tablet?setup=1</strong> в CRM → «Подключить планшет» → введите 6-значный код здесь.
            </p>

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
          </motion.div>
        ) : bootError ? (
          <div className="rounded-3xl border border-[#fecaca] bg-[#fef2f2] p-8 text-center">
            <p className="text-sm text-[#dc2626]">{bootError}</p>
            <button
              type="button"
              onClick={() => void bootstrapSession()}
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
                    Откройте CRM на телефоне → нажмите сканер рядом с поиском → наведите на код.
                    При первом входе нужно будет задать PIN.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setMode("pin"); setPin(""); setError(false); }}
                      className="rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b]"
                    >
                      Войти по PIN кабинета
                    </button>
                    <button
                      type="button"
                      onClick={() => void bootstrapSession()}
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
                    <span className="text-base font-bold">PIN кабинета</span>
                  </div>
                  <p className="mb-6 text-xs text-[#94a3b8]">4 цифры · для экстренного входа на планшете</p>

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
