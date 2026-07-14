import { TabletSmartphone } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";

export function TabletPairingConfirmModal({
  open,
  onClose,
  cabinetName,
  onConfirm,
  confirming = false,
}: {
  open: boolean;
  onClose: () => void;
  cabinetName?: string | null;
  onConfirm?: () => void;
  confirming?: boolean;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Подключение планшета"
      size="sm"
    >
      <div className="flex flex-col items-center font-manrope text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1f75fe]/10">
          <TabletSmartphone className="h-8 w-8 text-[#1f75fe]" />
        </div>

        {cabinetName && (
          <p className="mb-1 text-sm font-semibold text-[#0f172a]">{cabinetName}</p>
        )}
        <p className="mb-6 max-w-xs text-sm leading-relaxed text-[#64748b]">
          Подтвердите подключение планшета к клинике. После этого сотрудники смогут входить по QR-коду.
        </p>

        {onConfirm && (
          <Button
            type="button"
            className="mb-3 w-full"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "Подтверждаем…" : "Подтвердить подключение"}
          </Button>
        )}

        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </AppDialog>
  );
}
