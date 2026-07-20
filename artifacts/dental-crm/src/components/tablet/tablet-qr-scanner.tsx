import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine, X } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { parseTabletLinkToken } from "@/lib/tablet-api";
import { hapticNotify } from "@/lib/haptics";

export function TabletQrScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (token: string) => void;
}) {
  const reactId = useId();
  const scannerRegionId = `tablet-qr-scanner-${reactId.replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    setError(null);

    const startScanner = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      if (cancelled) return;

      const region = document.getElementById(scannerRegionId);
      if (!region) {
        setError("Не удалось инициализировать область сканера");
        return;
      }

      try {
        scanner = new Html5Qrcode(scannerRegionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            const token = parseTabletLinkToken(decoded);
            if (!token) return;
            hapticNotify("success");
            void scanner?.stop().catch(() => {});
            scannerRef.current = null;
            onScanRef.current(token);
            onCloseRef.current();
          },
          () => {},
        );
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Не удалось открыть камеру";
          setError(
            message.includes("NotAllowed")
              ? "Разрешите доступ к камере в настройках браузера"
              : message,
          );
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, scannerRegionId]);

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Сканер планшета"
      size="md"
    >
      <div className="font-manrope">
        <p className="mb-4 text-sm text-[#64748b]">
          Наведите камеру на QR-код на экране планшета в кабинете
        </p>
        <div className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-black">
          <div id={scannerRegionId} className="min-h-[280px] w-full" />
        </div>
        {error && (
          <p className="mt-3 text-sm text-[#dc2626]">{error}</p>
        )}
        <Button type="button" variant="outline" className="mt-4 w-full" onClick={onClose}>
          <X className="mr-2 h-4 w-4" /> Закрыть
        </Button>
      </div>
    </AppDialog>
  );
}

export function TabletQrScannerButton({
  onScan,
  className,
}: {
  onScan: (token: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title="Сканировать QR планшета"
        aria-label="Сканировать QR планшета"
      >
        <ScanLine className="h-5 w-5" />
      </button>
      <TabletQrScanner
        open={open}
        onClose={() => setOpen(false)}
        onScan={onScan}
      />
    </>
  );
}
