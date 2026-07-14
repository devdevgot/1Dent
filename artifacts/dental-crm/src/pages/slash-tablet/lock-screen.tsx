import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { OneDentLogo } from "./onedent-logo";
import type { TabletDoctor } from "./mock-data";
import {
  createTabletSession,
  getTabletSessionStatus,
  resolveCabinetIdFromUrl,
  applyCabinetIdToUrl,
  clearStoredCabinetId,
  shouldResetTabletCabinetBinding,
  type TabletCabinetBrief,
} from "@/lib/tablet-api";
import { bootstrapTabletSessionAuth } from "@/lib/tablet-auth";

export function LockScreen({
  onQrUnlock,
}: {
  onQrUnlock: (payload: { doctor: TabletDoctor; cabinet: TabletCabinetBrief }) => void;
}) {
  const [waitingForOwner, setWaitingForOwner] = useState(false);
  const [cabinetId, setCabinetId] = useState<string | null>(() => resolveCabinetIdFromUrl());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unlockedRef = useRef(false);
  const bootstrappingRef = useRef(false);

  const handleUnlock = useCallback(
    (
      doctor: TabletDoctor,
      cabinet: TabletCabinetBrief,
      auth?: { token: string; user: Parameters<typeof bootstrapTabletSessionAuth>[1]; clinic: Parameters<typeof bootstrapTabletSessionAuth>[2] } | null,
    ) => {
      if (!auth?.token || !auth.user || !auth.clinic) {
        setBootError("Не удалось авторизовать планшет. Обновите QR-код.");
        return;
      }
      unlockedRef.current = true;
      applyCabinetIdToUrl(cabinet.id);
      setCabinetId(cabinet.id);
      bootstrapTabletSessionAuth(auth.token, auth.user, auth.clinic);
      onQrUnlock({ doctor, cabinet });
    },
    [onQrUnlock],
  );

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

  const bootstrapSession = useCallback(async (forcedCabinetId?: string, retryWithoutCabinet = false) => {
    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;

    const id = retryWithoutCabinet ? null : (forcedCabinetId ?? resolveCabinetIdFromUrl());
    setLinkUrl("");
    setLoading(true);
    setBootError(null);
    setWaitingForOwner(false);
    unlockedRef.current = false;

    try {
      const res = await createTabletSession(id ?? undefined);
      setSessionId(res.data.sessionId);
      if (res.data.cabinet) {
        setCabinetId(res.data.cabinet.id);
      } else {
        setCabinetId(null);
      }
      setLinkUrl(res.data.linkUrl);
    } catch (err) {
      if (id && shouldResetTabletCabinetBinding(err)) {
        clearStoredCabinetId();
        setCabinetId(null);
        bootstrappingRef.current = false;
        void bootstrapSession(undefined, true);
        return;
      }
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
    if (!sessionId) return;

    const poll = window.setInterval(async () => {
      if (unlockedRef.current) return;
      try {
        const res = await getTabletSessionStatus(sessionId);
        const { status, doctor, cabinet, auth } = res.data;

        if (status === "awaiting_pairing" && cabinet) {
          setWaitingForOwner(true);
          setCabinetId(cabinet.id);
          return;
        }

        if (status === "released") {
          clearStoredCabinetId();
          setCabinetId(null);
          setWaitingForOwner(false);
          void bootstrapSession(undefined, true);
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
  }, [sessionId, handleUnlock, bootstrapSession, cabinetId]);

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <OneDentLogo className="absolute left-5 top-5 h-10" />

      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {bootError ? (
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
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center rounded-3xl border border-[#e8e3d9] bg-white p-8 shadow-sm"
          >
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

            <p className="mt-5 max-w-sm text-center text-sm leading-relaxed text-[#64748b]">
              {waitingForOwner
                ? "Ожидание подтверждения владельцем клиники…"
                : cabinetId
                  ? "Отсканируйте QR-код в CRM на телефоне"
                  : "Владелец клиники должен отсканировать QR и подтвердить подключение."}
            </p>

            <button
              type="button"
              onClick={() => void bootstrapSession(cabinetId ?? undefined)}
              className="mt-6 flex items-center gap-2 rounded-xl border border-[#e8e3d9] bg-white px-4 py-3 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
            >
              <RefreshCw className="h-4 w-4" /> Обновить код
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
