import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Delete, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";

export function TabletPinSetupModal({
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
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setPin("");
      setConfirm("");
      setStep("enter");
      setError("");
    }
  }, [open]);

  const press = (d: string) => {
    setError("");
    const target = step === "enter" ? pin : confirm;
    const next = (target + d).slice(0, 4);
    if (step === "enter") {
      setPin(next);
      if (next.length === 4) setTimeout(() => setStep("confirm"), 150);
    } else {
      setConfirm(next);
      if (next.length === 4) {
        setTimeout(() => {
          if (next !== pin) {
            setError("PIN-коды не совпадают");
            setConfirm("");
            setStep("enter");
            setPin("");
          } else {
            onSubmit(next);
          }
        }, 150);
      }
    }
  };

  const back = () => {
    setError("");
    if (step === "confirm") {
      setConfirm("");
      setStep("enter");
    } else {
      setPin((p) => p.slice(0, -1));
    }
  };

  const current = step === "enter" ? pin : confirm;

  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="PIN для планшета" size="sm">
      <div className="flex flex-col items-center px-2 pb-2 font-manrope">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f75fe]/10">
          <ShieldCheck className="h-6 w-6 text-[#1f75fe]" />
        </div>
        <p className="mb-1 text-center text-base font-bold text-[#0f172a]">
          {step === "enter" ? "Придумайте PIN-код" : "Повторите PIN-код"}
        </p>
        <p className="mb-6 max-w-xs text-center text-sm text-[#64748b]">
          Он понадобится при каждом входе в планшетный кабинет через QR. Запомните 4 цифры.
        </p>

        <div className={cn("mb-4 flex gap-3", error && "animate-shake")}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full border-2 transition-all",
                error ? "border-[#dc2626]" : "border-[#d4cfc6]",
                current.length > i && (error ? "bg-[#dc2626] border-[#dc2626]" : "border-[#1f75fe] bg-[#1f75fe]"),
              )}
            />
          ))}
        </div>
        {error && <p className="mb-3 text-sm font-medium text-[#dc2626]">{error}</p>}

        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <PinKey key={d} onClick={() => press(d)} disabled={loading}>{d}</PinKey>
          ))}
          <div />
          <PinKey onClick={() => press("0")} disabled={loading}>0</PinKey>
          <PinKey onClick={back} muted disabled={loading} aria-label="Стереть">
            <Delete className="h-5 w-5" />
          </PinKey>
        </div>

        <Button type="button" variant="ghost" className="mt-5" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
      </div>
    </AppDialog>
  );
}

function PinKey({
  children, onClick, muted, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-semibold transition-all active:scale-90 disabled:opacity-50",
        muted
          ? "text-[#64748b] hover:bg-[#f1ede4]"
          : "bg-[#faf8f4] text-[#0f172a] hover:bg-[#f1ede4]",
      )}
    >
      {children}
    </button>
  );
}
