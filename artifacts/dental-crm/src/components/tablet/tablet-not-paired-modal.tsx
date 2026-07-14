import { ShieldAlert } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";

export function TabletNotPairedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Планшет не подключён"
      size="sm"
    >
      <div className="flex flex-col items-center font-manrope text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fef2f2]">
          <ShieldAlert className="h-8 w-8 text-[#dc2626]" />
        </div>

        <p className="text-base font-bold text-[#0f172a]">
          Владелец еще не подключил этот планшет
        </p>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#64748b]">
          Попросите владельца клиники отсканировать QR-код на планшете и подтвердить подключение.
          После этого вы сможете входить в кабинет.
        </p>

        <Button type="button" className="mt-6 w-full" onClick={onClose}>
          Понятно
        </Button>
      </div>
    </AppDialog>
  );
}
