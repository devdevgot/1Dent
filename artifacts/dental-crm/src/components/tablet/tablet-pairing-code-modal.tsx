import { Copy, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function TabletPairingCodeModal({
  open,
  onClose,
  code,
  cabinetName,
  onResend,
  resending = false,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  cabinetName?: string | null;
  onResend?: () => void;
  resending?: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

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
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Код подключения планшета"
      size="sm"
    >
      <div className="flex flex-col items-center font-manrope text-center">
        {cabinetName && (
          <p className="mb-1 text-sm font-semibold text-[#0f172a]">{cabinetName}</p>
        )}
        <p className="mb-4 text-xs text-[#64748b]">Код отправляется в этот кабинет</p>

        {code && (
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
            <p className="mb-4 max-w-xs text-sm leading-relaxed text-[#64748b]">
              Введите этот 6-значный код на экране планшета. После этого можно настроить PIN для входа без QR.
            </p>
          </>
        )}

        {onResend && (
          <Button
            type="button"
            variant="outline"
            className="mb-3 w-full"
            disabled={resending}
            onClick={onResend}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${resending ? "animate-spin" : ""}`} />
            Отправить код снова в кабинет
          </Button>
        )}

        <Button type="button" className="w-full" onClick={onClose}>
          Готово
        </Button>
      </div>
    </AppDialog>
  );
}
