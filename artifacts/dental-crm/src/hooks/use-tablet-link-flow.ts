import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletPairingUiStore } from "@/hooks/use-tablet-pairing-ui";
import {
  confirmTabletPairing,
  getPendingTabletPairing,
  redeemTabletLink,
  resendTabletPairingCode,
  getTabletLinkErrorMessage,
} from "@/lib/tablet-api";

type LinkFlowStatus = "idle" | "processing" | "success" | "pairing_pending" | "error";

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const pairingCodeOpen = useTabletPairingUiStore((s) => s.isOpen);
  const pairingCode = useTabletPairingUiStore((s) => s.pairingCode);
  const pairingSessionId = useTabletPairingUiStore((s) => s.sessionId);
  const cabinetName = useTabletPairingUiStore((s) => s.cabinetName);
  const openPairingModal = useTabletPairingUiStore((s) => s.open);
  const closePairingModal = useTabletPairingUiStore((s) => s.close);
  const [resendingPairing, setResendingPairing] = useState(false);
  const [confirmingPairing, setConfirmingPairing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<LinkFlowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const shownPendingRef = useRef<string | null>(null);

  const processToken = useCallback(async (raw: string) => {
    const token = raw.includes("token=")
      ? (() => {
          try {
            const u = raw.startsWith("http") ? new URL(raw) : new URL(raw, window.location.origin);
            return u.searchParams.get("token");
          } catch {
            return raw;
          }
        })()
      : raw;

    if (!token) {
      setStatus("error");
      setErrorMessage("Неверный QR-код");
      toast({ title: "Неверный QR-код", variant: "destructive" });
      return false;
    }

    setSubmitting(true);
    setStatus("processing");
    setErrorMessage(null);
    try {
      const result = await redeemTabletLink(token);

      if (result.data.pairingRequired) {
        if (result.data.pairingCode) {
          openPairingModal(
            result.data.sessionId,
            result.data.pairingCode,
            result.data.cabinet?.name ?? null,
          );
          setStatus("success");
          toast({
            title: "Подключение планшета",
            description: "Подтвердите подключение кодом ниже",
          });
          return true;
        }

        setStatus("pairing_pending");
        toast({
          title: "Запрос отправлен",
          description: "Код подключения отправлен владельцу клиники",
        });
        return true;
      }

      setStatus("success");
      toast({
        title: "Планшет разблокирован",
        description: result.data.doctor
          ? `Кабинет открыт для ${result.data.doctor.name}`
          : "Можно продолжать работу на планшете",
      });
      return true;
    } catch (err) {
      const message = getTabletLinkErrorMessage(err);
      setStatus("error");
      setErrorMessage(message);
      toast({
        title: "Ошибка",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [toast, openPairingModal]);

  const resendPairingCode = useCallback(async () => {
    if (!pairingSessionId) return;
    setResendingPairing(true);
    try {
      const result = await resendTabletPairingCode(pairingSessionId);
      openPairingModal(
        pairingSessionId,
        result.data.pairingCode,
        result.data.cabinet.name,
      );
      toast({
        title: "Новый код отправлен",
        description: `Код обновлён для ${result.data.cabinet.name}`,
      });
    } catch (err) {
      toast({
        title: "Не удалось отправить код",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setResendingPairing(false);
    }
  }, [pairingSessionId, toast, openPairingModal]);

  const confirmPairing = useCallback(async () => {
    if (!pairingSessionId || !pairingCode) return false;
    setConfirmingPairing(true);
    try {
      await confirmTabletPairing(pairingSessionId, pairingCode);
      closePairingModal();
      shownPendingRef.current = null;
      setStatus("success");
      toast({
        title: "Планшет подключён",
        description: "Кабинет привязан к клинике",
      });
      return true;
    } catch (err) {
      toast({
        title: "Не удалось подтвердить",
        description: err instanceof Error ? err.message : "Проверьте код и попробуйте снова",
        variant: "destructive",
      });
      return false;
    } finally {
      setConfirmingPairing(false);
    }
  }, [pairingSessionId, pairingCode, toast, closePairingModal]);

  useEffect(() => {
    if (user?.role !== "owner" || pairingCodeOpen) return;

    const poll = window.setInterval(() => {
      void getPendingTabletPairing()
        .then((res) => {
          const pending = res.data;
          if (!pending || shownPendingRef.current === pending.sessionId) return;
          shownPendingRef.current = pending.sessionId;
          openPairingModal(pending.sessionId, pending.pairingCode, pending.cabinet.name);
        })
        .catch(() => {
          /* ignore */
        });
    }, 5000);

    return () => window.clearInterval(poll);
  }, [user?.role, pairingCodeOpen, openPairingModal]);

  return {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    resendingPairing,
    confirmingPairing,
    submitting,
    status,
    errorMessage,
    processToken,
    resendPairingCode,
    confirmPairing,
    closePairingModal,
  };
}
