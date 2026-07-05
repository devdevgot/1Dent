import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function TabletPairingCodeModal({
  open,
  onClose,
  code,
  cabinetName,
}: {
  open: boolean;
  onClose: () => void;
  code: string | null;
  cabinetName?: string | null;
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
          <p className="mb-4 text-sm text-[#64748b]">{cabinetName}</p>
        )}

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
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-[#64748b]">
              Введите этот 6-значный код на экране планшета, чтобы привязать кабинет к клинике.
            </p>
          </>
        )}

        <Button type="button" className="w-full" onClick={onClose}>
          Готово
        </Button>
      </div>
    </AppDialog>
  );
}
