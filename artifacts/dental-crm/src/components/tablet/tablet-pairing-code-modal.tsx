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
  onConfirm,
  resending = false,
  confirming = false,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  cabinetName?: string | null;
  onResend?: () => void;
  onConfirm?: () => void;
  resending?: boolean;
  confirming?: boolean;
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
      title="Подключение планшета"
      size="sm"
    >
      <div className="flex flex-col items-center font-manrope text-center">
        {cabinetName && (
          <p className="mb-1 text-body font-semibold text-[var(--text)]">{cabinetName}</p>
        )}
        <p className="mb-4 text-caption text-[var(--text-secondary)]">
          Код виден только на вашем телефоне. Подтвердите подключение планшета к клинике.
        </p>

        {code && (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="font-mono text-4xl font-extrabold tracking-[0.35em] text-[var(--text)]">
                {code}
              </span>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                aria-label="Скопировать код"
              >
                {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <p className="mb-4 max-w-xs text-body leading-relaxed text-[var(--text-secondary)]">
              Этот код не отображается на планшете. Нажмите «Подтвердить», чтобы привязать кабинет.
            </p>
          </>
        )}

        {onConfirm && (
          <Button
            type="button"
            className="mb-3 w-full"
            disabled={!code || confirming}
            onClick={onConfirm}
          >
            {confirming ? "Подтверждаем…" : "Подтвердить подключение"}
          </Button>
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
            Получить новый код
          </Button>
        )}

        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </AppDialog>
  );
}
