import { useEffect, useState } from "react";
import { ShieldCheck, Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";

export function TabletPinEntryModal({
  open,
  onClose,
  onSubmit,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  loading?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setError(false);
    }
  }, [open]);

  const press = (d: string) => {
    setError(false);
    setPin((p) => {
      const next = (p + d).slice(0, 4);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 150);
      }
      return next;
    });
  };

  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="PIN планшета" size="sm">
      <div className="flex flex-col items-center px-2 pb-2 font-manrope">
        <ShieldCheck className="mb-3 h-8 w-8 text-[#1f75fe]" />
        <p className="mb-6 text-center text-sm text-[#64748b]">Введите ваш PIN для входа в кабинет</p>
        <div className={cn("mb-6 flex gap-3", error && "animate-shake")}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full border-2",
                error ? "border-[#dc2626]" : "border-[#d4cfc6]",
                pin.length > i && (error ? "bg-[#dc2626]" : "border-[#1f75fe] bg-[#1f75fe]"),
              )}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={loading}
              onClick={() => press(d)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faf8f4] text-xl font-semibold"
            >
              {d}
            </button>
          ))}
          <div />
          <button type="button" disabled={loading} onClick={() => press("0")} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#faf8f4] text-xl font-semibold">0</button>
          <button type="button" disabled={loading} onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-14 w-14 items-center justify-center rounded-2xl text-[#64748b]">
            <Delete className="h-5 w-5" />
          </button>
        </div>
        <Button type="button" variant="ghost" className="mt-5" onClick={onClose}>Отмена</Button>
      </div>
    </AppDialog>
  );
}
