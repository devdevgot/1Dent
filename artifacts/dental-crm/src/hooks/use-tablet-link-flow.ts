import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getTabletMe, redeemTabletLink, resendTabletPairingCode, setTabletPin } from "@/lib/tablet-api";

type LinkFlowStatus = "idle" | "processing" | "success" | "error";

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const [pairingCodeOpen, setPairingCodeOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingSessionId, setPairingSessionId] = useState<string | null>(null);
  const [cabinetName, setCabinetName] = useState<string | null>(null);
  const [resendingPairing, setResendingPairing] = useState(false);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<LinkFlowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      if (result.data.pairingRequired && result.data.pairingCode) {
        setPairingCode(result.data.pairingCode);
        setPairingSessionId(result.data.sessionId);
        setCabinetName(result.data.cabinet?.name ?? null);
        setPairingCodeOpen(true);
        setStatus("success");
        toast({
          title: "Подключение планшета",
          description: "Введите 6-значный код на экране планшета",
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
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Не удалось подключиться к планшету");
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось подключиться к планшету",
        variant: "destructive",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [toast]);

  const resendPairingCode = useCallback(async () => {
    if (!pairingSessionId) return;
    setResendingPairing(true);
    try {
      const result = await resendTabletPairingCode(pairingSessionId);
      setPairingCode(result.data.pairingCode);
      setCabinetName(result.data.cabinet.name);
      toast({
        title: "Код отправлен",
        description: `Новый код отправлен в ${result.data.cabinet.name}`,
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
  }, [pairingSessionId, toast]);

  const closePairingModal = useCallback(async () => {
    setPairingCodeOpen(false);
    setPairingCode(null);
    setPairingSessionId(null);
    setCabinetName(null);

    try {
      const me = await getTabletMe();
      if (!me.data?.hasTabletPin) {
        setPinSetupOpen(true);
        return;
      }
    } catch {
      /* ignore */
    }
  }, []);

  const submitPinSetup = useCallback(async (pin: string) => {
    setPinSaving(true);
    try {
      await setTabletPin(pin);
      setPinSetupOpen(false);
      toast({
        title: "PIN сохранён",
        description: "Теперь можно входить на планшет по PIN без QR",
      });
    } catch (err) {
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось сохранить PIN",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  }, [toast]);

  const closePinSetup = useCallback(() => {
    setPinSetupOpen(false);
  }, []);

  return {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    pinSetupOpen,
    pinSaving,
    resendingPairing,
    submitting,
    status,
    errorMessage,
    processToken,
    resendPairingCode,
    closePairingModal,
    submitPinSetup,
    closePinSetup,
  };
}
