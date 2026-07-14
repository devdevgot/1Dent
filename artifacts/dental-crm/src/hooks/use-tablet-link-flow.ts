import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletPairingUiStore } from "@/hooks/use-tablet-pairing-ui";
import {
  confirmTabletPairing,
  getPendingTabletPairing,
  redeemTabletLink,
  getTabletLinkErrorMessage,
  isTabletNotPairedByOwnerError,
} from "@/lib/tablet-api";

type LinkFlowStatus = "idle" | "processing" | "success" | "error";

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const pairingModalOpen = useTabletPairingUiStore((s) => s.isOpen);
  const pairingSessionId = useTabletPairingUiStore((s) => s.sessionId);
  const cabinetName = useTabletPairingUiStore((s) => s.cabinetName);
  const openPairingModal = useTabletPairingUiStore((s) => s.open);
  const closePairingModal = useTabletPairingUiStore((s) => s.close);
  const [confirmingPairing, setConfirmingPairing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<LinkFlowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notPairedModalOpen, setNotPairedModalOpen] = useState(false);
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
    setNotPairedModalOpen(false);
    try {
      const result = await redeemTabletLink(token);

      if (result.data.pairingRequired) {
        openPairingModal(
          result.data.sessionId,
          result.data.cabinet?.name ?? null,
        );
        setStatus("success");
        toast({
          title: "Подключение планшета",
          description: "Подтвердите подключение на этом экране",
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
      if (isTabletNotPairedByOwnerError(err)) {
        setNotPairedModalOpen(true);
        setStatus("idle");
        return false;
      }

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

  const confirmPairing = useCallback(async () => {
    if (!pairingSessionId) return false;
    setConfirmingPairing(true);
    try {
      await confirmTabletPairing(pairingSessionId);
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
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
      return false;
    } finally {
      setConfirmingPairing(false);
    }
  }, [pairingSessionId, toast, closePairingModal]);

  useEffect(() => {
    if (user?.role !== "owner" || pairingModalOpen) return;

    const poll = window.setInterval(() => {
      void getPendingTabletPairing()
        .then((res) => {
          const pending = res.data;
          if (!pending || shownPendingRef.current === pending.sessionId) return;
          shownPendingRef.current = pending.sessionId;
          openPairingModal(pending.sessionId, pending.cabinet.name);
        })
        .catch(() => {
          /* ignore */
        });
    }, 5000);

    return () => window.clearInterval(poll);
  }, [user?.role, pairingModalOpen, openPairingModal]);

  return {
    pairingModalOpen,
    cabinetName,
    confirmingPairing,
    submitting,
    status,
    errorMessage,
    notPairedModalOpen,
    closeNotPairedModal: () => setNotPairedModalOpen(false),
    processToken,
    confirmPairing,
    closePairingModal,
  };
}
