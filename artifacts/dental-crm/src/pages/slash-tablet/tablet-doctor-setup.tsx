import { useCallback, useState } from "react";
import { Copy, Check, RefreshCw, TabletSmartphone } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { issueTabletPairingCode } from "@/lib/tablet-api";
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
              Введите этот код на планшете в кабинете. Код действует ограниченное время.
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

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1f75fe]/10">
          <TabletSmartphone className="h-10 w-10 text-[#1f75fe]" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">SlashTablet</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#64748b]">
          Откройте <strong className="text-[#0f172a]">/tablet?setup=1</strong> в CRM, нажмите кнопку ниже,
          получите код и введите его на экране планшета в кабинете.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-8 rounded-2xl bg-[#1f75fe] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#1f75fe]/25 transition-colors hover:bg-[#1a66e0]"
        >
          Подключить планшет
        </button>
      </div>

      <TabletConnectModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
