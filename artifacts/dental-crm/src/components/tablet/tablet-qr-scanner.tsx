import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine, X } from "lucide-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { parseTabletLinkToken } from "@/lib/tablet-api";

const SCANNER_ID = "tablet-qr-scanner-region";

export function TabletQrScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (token: string) => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;
    setError(null);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => {
          const token = parseTabletLinkToken(decoded);
          if (!token) return;
          void scanner.stop().catch(() => {});
          scannerRef.current = null;
          onScan(token);
          onClose();
        },
        () => {},
      )
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось открыть камеру");
        }
      });

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        void scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, onClose, onScan]);

  return (
    <AppDialog open={open} onClose={onClose} title="Сканер планшета" size="md">
      <div className="font-manrope">
        <p className="mb-4 text-sm text-[#64748b]">
          Наведите камеру на QR-код на экране планшета в кабинете
        </p>
        <div className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-black">
          <div id={SCANNER_ID} className="min-h-[280px] w-full" />
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
