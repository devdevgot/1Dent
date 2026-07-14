import { LogIn, TabletSmartphone, Trash2 } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TabletOwnerActionModal({
  open,
  onClose,
  cabinetName,
  isFirstPairing = false,
  onEnter,
  onRemove,
  entering = false,
  removing = false,
}: {
  open: boolean;
  onClose: () => void;
  cabinetName?: string | null;
  isFirstPairing?: boolean;
  onEnter?: () => void;
  onRemove?: () => void;
  entering?: boolean;
  removing?: boolean;
}) {
  const busy = entering || removing;

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      title="SlashTablet"
      description={cabinetName ?? "Планшет в кабинете"}
      size="sm"
      bodyClassName="py-5"
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-3xl bg-[#1f75fe]/10 blur-xl" aria-hidden />
          <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-3xl border border-[#e8e3d9] bg-gradient-to-br from-white to-[#f8fafc] shadow-sm">
            <TabletSmartphone className="h-9 w-9 text-[#1f75fe]" strokeWidth={1.75} />
          </div>
        </div>

        <p className="max-w-xs text-sm leading-relaxed text-[#64748b]">
          {isFirstPairing
            ? "Подключите планшет к клинике или оставьте его свободным для другого владельца."
            : "Выберите действие: войти в планшетный кабинет или отвязать устройство от клиники."}
        </p>

        <div className="mt-6 flex w-full flex-col gap-3">
          {onEnter && (
            <Button
              type="button"
              className={cn(
                "h-12 w-full rounded-2xl text-sm font-semibold shadow-sm",
                "bg-[#1f75fe] hover:bg-[#1a65e8]",
              )}
              disabled={busy}
              onClick={onEnter}
            >
              <LogIn className="mr-1 h-4 w-4" />
              {entering ? "Входим…" : "Войти в планшет"}
            </Button>
          )}

          {onRemove && (
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-12 w-full rounded-2xl border-[#fecaca] text-sm font-semibold",
                "text-[#dc2626] hover:bg-[#fef2f2] hover:text-[#b91c1c]",
              )}
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {removing ? "Отвязываем…" : "Удалить планшет"}
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
