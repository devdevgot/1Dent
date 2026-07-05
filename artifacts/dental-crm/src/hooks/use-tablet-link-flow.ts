import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { redeemTabletLink } from "@/lib/tablet-api";

type LinkFlowStatus = "idle" | "processing" | "success" | "error";

export function useTabletLinkFlow() {
  const { toast } = useToast();
  const [pairingCodeOpen, setPairingCodeOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [cabinetName, setCabinetName] = useState<string | null>(null);
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

  const closeModals = useCallback(() => {
    setPairingCodeOpen(false);
    setPairingCode(null);
    setCabinetName(null);
    if (status !== "success") {
      setStatus("idle");
    }
  }, [status]);

  return {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    submitting,
    status,
    errorMessage,
    processToken,
    closeModals,
  };
}
