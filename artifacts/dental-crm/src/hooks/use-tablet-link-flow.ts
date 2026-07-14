import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletPairingUiStore } from "@/hooks/use-tablet-pairing-ui";
import {
  enterTabletSession,
  getPendingTabletPairing,
  redeemTabletLink,
  releaseTabletSession,
  getTabletLinkErrorMessage,
  isTabletNotPairedByOwnerError,
} from "@/lib/tablet-api";

type LinkFlowStatus = "idle" | "processing" | "success" | "error";

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const ownerModalOpen = useTabletPairingUiStore((s) => s.isOpen);
  const ownerSessionId = useTabletPairingUiStore((s) => s.sessionId);
  const cabinetName = useTabletPairingUiStore((s) => s.cabinetName);
  const ownerModalMode = useTabletPairingUiStore((s) => s.mode);
  const openOwnerModal = useTabletPairingUiStore((s) => s.open);
  const closeOwnerModal = useTabletPairingUiStore((s) => s.close);
  const [enteringTablet, setEnteringTablet] = useState(false);
  const [removingTablet, setRemovingTablet] = useState(false);
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

      if (result.data.pairingRequired || result.data.ownerActionRequired) {
        if (user?.role !== "owner") {
          setNotPairedModalOpen(true);
          setStatus("idle");
          return false;
        }

        openOwnerModal(
          result.data.sessionId,
          result.data.cabinet?.name ?? null,
          result.data.pairingRequired ? "pairing" : "enter",
        );
        setStatus("success");
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
  }, [toast, openOwnerModal, user?.role]);

  const enterTablet = useCallback(async () => {
    if (!ownerSessionId) return false;
    setEnteringTablet(true);
    try {
      await enterTabletSession(ownerSessionId);
      closeOwnerModal();
      shownPendingRef.current = null;
      setStatus("success");
      toast({
        title: ownerModalMode === "pairing" ? "Планшет подключён" : "Планшет разблокирован",
        description:
          ownerModalMode === "pairing"
            ? "Кабинет привязан к клинике"
            : "Можно принимать пациентов на планшете",
      });
      return true;
    } catch (err) {
      toast({
        title: "Не удалось войти",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
      return false;
    } finally {
      setEnteringTablet(false);
    }
  }, [ownerSessionId, ownerModalMode, toast, closeOwnerModal]);

  const removeTablet = useCallback(async () => {
    if (!ownerSessionId) return false;
    setRemovingTablet(true);
    try {
      await releaseTabletSession(ownerSessionId);
      closeOwnerModal();
      shownPendingRef.current = null;
      setStatus("idle");
      toast({
        title: "Планшет отвязан",
        description: "Устройство свободно — другой владелец может подключить его к своей клинике",
      });
      return true;
    } catch (err) {
      toast({
        title: "Не удалось отвязать",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
      return false;
    } finally {
      setRemovingTablet(false);
    }
  }, [ownerSessionId, toast, closeOwnerModal]);

  useEffect(() => {
    if (user?.role !== "owner" || ownerModalOpen) return;

    const poll = window.setInterval(() => {
      void getPendingTabletPairing()
        .then((res) => {
          const pending = res.data;
          if (!pending || shownPendingRef.current === pending.sessionId) return;
          shownPendingRef.current = pending.sessionId;
          openOwnerModal(pending.sessionId, pending.cabinet.name, "pairing");
        })
        .catch(() => {
          /* ignore */
        });
    }, 5000);

    return () => window.clearInterval(poll);
  }, [user?.role, ownerModalOpen, openOwnerModal]);

  return {
    ownerModalOpen,
    ownerModalMode,
    cabinetName,
    enteringTablet,
    removingTablet,
    submitting,
    status,
    errorMessage,
    notPairedModalOpen,
    closeNotPairedModal: () => setNotPairedModalOpen(false),
    processToken,
    enterTablet,
    removeTablet,
    closeOwnerModal,
  };
}
