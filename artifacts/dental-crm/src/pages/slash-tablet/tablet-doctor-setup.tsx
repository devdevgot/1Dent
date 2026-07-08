import { useCallback, useState } from "react";
import { Copy, Check, RefreshCw, TabletSmartphone, Smartphone, KeyRound } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { issueTabletPairingCode, setTabletPin } from "@/lib/tablet-api";
import { TabletPinSetupModal } from "@/components/tablet/tablet-pin-setup-modal";
import { useToast } from "@/hooks/use-toast";

export function TabletConnectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [cabinetName, setCabinetName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issueTabletPairingCode();
      setCode(res.data.pairingCode);
      setCabinetName(res.data.name);
    } catch {
      toast({
        title: "Не удалось получить код",
        description: "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setCopied(false);
      void fetchCode();
    } else {
      setCode(null);
      setCabinetName(null);
    }
    onOpenChange(next);
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Код подключения планшета"
      size="sm"
    >
      <div className="flex flex-col items-center font-manrope text-center">
        {cabinetName && (
          <p className="mb-4 text-sm text-[#64748b]">{cabinetName}</p>
        )}

        {loading && !code ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
          </div>
        ) : code ? (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="font-mono text-4xl font-extrabold tracking-[0.35em] text-[#0f172a]">
                {code}
              </span>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="rounded-xl p-2 text-[#64748b] hover:bg-[#f1ede4]"
                aria-label="Скопировать код"
              >
                {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-[#64748b]">
              Подтвердите подключение на телефоне. Код не отображается на планшете.
            </p>
          </>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void fetchCode()}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Отправить код снова
        </Button>
      </div>
    </AppDialog>
  );
}

export function TabletDoctorSetup() {
  const [modalOpen, setModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const { toast } = useToast();

  const savePin = useCallback(async (pin: string) => {
    setPinSaving(true);
    try {
      await setTabletPin(pin);
      setPinModalOpen(false);
      toast({ title: "PIN сохранён", description: "Можно входить на планшет по PIN без QR" });
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

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1f75fe]/10">
          <TabletSmartphone className="h-10 w-10 text-[#1f75fe]" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">SlashTablet</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#64748b]">
          Откройте <strong className="text-[#0f172a]">/tablet</strong> на планшете в кабинете.
          На экране появится QR-код — отсканируйте его с телефона через сканер в CRM.
          При первом подключении на телефоне появится 6-значный код для ввода на планшете.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left text-sm text-[#64748b]">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#1f75fe]" />
          <p>
            В следующий раз достаточно просто отсканировать QR-код.
            Если не хотите сканировать — настройте 4-значный PIN в CRM и входите по нему на планшете.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPinModalOpen(true)}
          className="mt-6 flex items-center gap-2 rounded-2xl border border-[#e8e3d9] bg-white px-6 py-3 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf8f4]"
        >
          <KeyRound className="h-4 w-4 text-[#1f75fe]" />
          Настроить PIN для входа без QR
        </button>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-4 text-sm font-semibold text-[#1f75fe] hover:underline"
        >
          Получить код вручную (резервный способ)
        </button>
      </div>

      <TabletConnectModal open={modalOpen} onOpenChange={setModalOpen} />
      <TabletPinSetupModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={(pin) => void savePin(pin)}
        loading={pinSaving}
      />
    </div>
  );
}
