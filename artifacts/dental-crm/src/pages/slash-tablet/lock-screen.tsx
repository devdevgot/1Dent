import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Delete, ShieldCheck, RefreshCw, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { CABINET } from "./mock-data";
import { OneDentLogo } from "./onedent-logo";
import { canAccessTablet } from "./tablet-session";

type Mode = "qr" | "pin";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<Mode>("qr");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user } = useAuthStore();
  const [, navigate] = useLocation();
  const crmTabletUser = user && canAccessTablet(user.role) ? user : null;

  // Токен для входа зашит в QR (в реале — одноразовый токен сессии кабинета)
  const qrPayload = `https://app.1dent.kz/tablet/link?cabinet=${CABINET.id}&t=${Date.now()}`;

  useEffect(() => {
    if (mode !== "qr" || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, qrPayload, {
      width: 236,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, [mode, qrPayload]);

  const press = (d: string) => {
    setError(false);
    setPin((p) => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4) {
        setTimeout(() => {
          if (next === CABINET.pin) onUnlock();
          else { setError(true); setPin(""); }
        }, 150);
      }
      return next;
    });
  };
  const back = () => { setError(false); setPin((p) => p.slice(0, -1)); };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <OneDentLogo className="absolute left-5 top-5 h-10" />

      {/* Декоративный фон */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl">
        {/* Кабинет */}
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="text-2xl font-extrabold text-[#0f172a]">{CABINET.name}</h1>
          <p className="mt-1 text-sm text-[#64748b]">{CABINET.clinicName} · {CABINET.address}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
          {/* QR панель */}
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
                  <canvas ref={canvasRef} className="rounded-lg" />
                </div>

                <p className="mt-5 max-w-md text-center text-sm leading-relaxed text-[#64748b]">
                  Наведите камеру телефона на код — вы войдёте в кабинет под своей учётной записью,
                  а планшет откроет список пациентов.
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => { setMode("pin"); setPin(""); setError(false); }}
                    className="rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b]"
                  >
                    Войти по PIN-коду
                  </button>
                  <button
                    onClick={() => { if (canvasRef.current) QRCode.toCanvas(canvasRef.current, `${qrPayload}&r=${Date.now()}`, { width: 236, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } }); }}
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
                  <span className="text-base font-bold">Введите PIN-код кабинета</span>
                </div>
                <p className="mb-6 text-xs text-[#94a3b8]">Демо-PIN: 1234</p>

                {/* Точки PIN */}
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
                {error && <p className="mb-4 -mt-2 text-sm font-medium text-[#dc2626]">Неверный PIN. Попробуйте снова.</p>}

                {/* Клавиатура */}
                <div className="grid grid-cols-3 gap-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <PinKey key={d} onClick={() => press(d)}>{d}</PinKey>
                  ))}
                  <div />
                  <PinKey onClick={() => press("0")}>0</PinKey>
                  <PinKey onClick={back} muted aria-label="Стереть"><Delete className="h-6 w-6" /></PinKey>
                </div>

                <button
                  onClick={() => { setMode("qr"); setPin(""); setError(false); }}
                  className="mt-6 text-sm font-semibold text-[#1f75fe] hover:underline"
                >
                  ← Вернуться к QR-коду
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {crmTabletUser && (
        <button
          type="button"
          onClick={() => navigate("/tablet/workspace/patients")}
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#e8e3d9] bg-white px-5 py-3 text-sm font-semibold text-[#0f172a] shadow-sm transition-colors hover:bg-[#faf8f4]"
        >
          <LogIn className="h-4 w-4 text-[#1f75fe]" />
          Войти как {crmTabletUser.name}
        </button>
      )}
    </div>
  );
}

function PinKey({
  children, onClick, muted, ...rest
}: { children: React.ReactNode; onClick: () => void; muted?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
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
