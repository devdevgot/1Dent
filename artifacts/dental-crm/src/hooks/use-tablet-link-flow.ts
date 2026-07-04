import { useCallback, useState } from "react";
import { ApiError } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  getTabletMe,
  redeemTabletLink,
  setTabletPin,
} from "@/lib/tablet-api";

type PinSetupError = Error & { code?: string; linkToken?: string };

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinEntryOpen, setPinEntryOpen] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const completeLink = useCallback(async (token: string, pin?: string) => {
    const result = await redeemTabletLink(token, pin);
    toast({
      title: "Планшет разблокирован",
      description: result.data.doctor
        ? `Кабинет открыт для ${result.data.doctor.name}`
        : "Можно продолжать работу на планшете",
    });
    return result;
  }, [toast]);

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
      toast({ title: "Неверный QR-код", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const me = await getTabletMe();
      if (!me.data?.hasTabletPin) {
        setPendingToken(token);
        setPinSetupOpen(true);
        return;
      }

      try {
        await completeLink(token);
      } catch (linkErr) {
        if (linkErr instanceof ApiError && linkErr.status === 401) {
          setPendingToken(token);
          setPinEntryOpen(true);
          return;
        }
        throw linkErr;
      }
    } catch (err) {
      const e = err as PinSetupError;
      if (e.code === "TABLET_PIN_SETUP_REQUIRED") {
        setPendingToken(e.linkToken ?? token);
        setPinSetupOpen(true);
        return;
      }
      toast({
        title: "Ошибка",
        description: e.message || "Не удалось подключиться к планшету",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [completeLink, toast]);

  const submitPinSetup = useCallback(async (pin: string) => {
    if (!pendingToken) return;
    setSubmitting(true);
    try {
      await setTabletPin(pin, pendingToken);
      setPinSetupOpen(false);
      setPendingToken(null);
      toast({ title: "PIN установлен", description: "Планшет разблокирован" });
    } catch (err) {
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось сохранить PIN",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [pendingToken, toast]);

  const submitPinEntry = useCallback(async (pin: string) => {
    if (!pendingToken) return;
    setSubmitting(true);
    try {
      await completeLink(pendingToken, pin);
      setPinEntryOpen(false);
      setPendingToken(null);
    } catch (err) {
      toast({
        title: "Неверный PIN",
        description: err instanceof Error ? err.message : "Попробуйте снова",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [pendingToken, completeLink, toast]);

  const closeModals = useCallback(() => {
    setPinSetupOpen(false);
    setPinEntryOpen(false);
    setPendingToken(null);
  }, []);

  return {
    pinSetupOpen,
    pinEntryOpen,
    submitting,
    processToken,
    submitPinSetup,
    submitPinEntry,
    closeModals,
    /** @deprecated use pinSetupOpen */
    pinModalOpen: pinSetupOpen,
    closePinModal: closeModals,
  };
}
