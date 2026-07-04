import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Delete, ShieldCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { OneDentLogo } from "./onedent-logo";
import type { TabletDoctor } from "./mock-data";
import {
  createTabletSession,
  getTabletSessionStatus,
  verifyTabletCabinetPin,
  resolveCabinetIdFromUrl,
  type TabletCabinetBrief,
} from "@/lib/tablet-api";

type Mode = "qr" | "pin";

export function LockScreen({
  onQrUnlock,
  onPinUnlock,
}: {
  onQrUnlock: (payload: { doctor: TabletDoctor; cabinet: TabletCabinetBrief }) => void;
  onPinUnlock: () => void;
}) {
  const [mode, setMode] = useState<Mode>("qr");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [pinError, setPinError] = useState("");
  const [cabinetId, setCabinetId] = useState<string | null>(() => resolveCabinetIdFromUrl());
  const [cabinetName, setCabinetName] = useState("Кабинет");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unlockedRef = useRef(false);

  const drawQr = useCallback(async (url: string) => {
    if (!canvasRef.current || !url) return;
    await QRCode.toCanvas(canvasRef.current, url, {
      width: 236,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, []);

  const bootstrapSession = useCallback(async () => {
    const id = resolveCabinetIdFromUrl() ?? cabinetId;
    if (!id) {
      setBootError("Откройте планшет по ссылке из CRM: /tablet?cabinet=...");
      setLoading(false);
      return;
    }
    setCabinetId(id);
    setLoading(true);
    setBootError(null);
    try {
      const res = await createTabletSession(id);
      setSessionId(res.data.sessionId);
      setLinkUrl(res.data.linkUrl);
      setCabinetName(res.data.cabinet.name);
      await drawQr(res.data.linkUrl);
    } catch {
      setBootError("Не удалось создать сессию планшета. Проверьте подключение.");
    } finally {
      setLoading(false);
    }
  }, [cabinetId, drawQr]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    if (!sessionId || mode !== "qr") return;

    const poll = window.setInterval(async () => {
      if (unlockedRef.current) return;
      try {
        const res = await getTabletSessionStatus(sessionId);
        const { status, doctor, cabinet } = res.data;
        if (status === "unlocked" && doctor) {
          unlockedRef.current = true;
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

  const press = (d: string) => {
    setError(false);
    setPinError("");
    setPin((p) => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4 && cabinetId) {
        setTimeout(() => {
          void verifyTabletCabinetPin(cabinetId, next)
            .then(() => onPinUnlock())
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

        {bootError ? (
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

                  <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
                    {loading ? (
                      <div className="flex h-[236px] w-[236px] items-center justify-center">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
                      </div>
                    ) : (
                      <canvas ref={canvasRef} className="rounded-lg" />
                    )}
                  </div>

                  <p className="mt-5 max-w-md text-center text-sm leading-relaxed text-[#64748b]">
                    Откройте CRM на телефоне → нажмите сканер рядом с поиском → наведите на код.
                    При первом входе нужно будет задать PIN.
                  </p>

                  <div className="mt-6 flex items-center gap-3">
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
  children, onClick, muted, ...rest
}: { children: React.ReactNode; onClick: () => void; muted?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-semibold transition-all active:scale-90",
        muted
          ? "text-[#64748b] hover:bg-[#f1ede4]"
          : "bg-[#faf8f4] text-[#0f172a] hover:bg-[#f1ede4] active:bg-[#e8e3d9]",
      )}
    >
      {children}
    </button>
  );
}
