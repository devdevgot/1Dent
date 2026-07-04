import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Copy, Check, ExternalLink } from "lucide-react";
import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletPinSetupModal } from "./tablet-pin-setup-modal";
import { TabletPinEntryModal } from "./tablet-pin-entry-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";
import { listTabletCabinets } from "@/lib/tablet-api";
import { AppDialog } from "@/components/layout/app-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function TabletScannerSlot() {
  const { toast } = useToast();
  const [tabletOpen, setTabletOpen] = useState(false);
  const [loadingCabinets, setLoadingCabinets] = useState(false);
  const [cabinets, setCabinets] = useState<
    { id: string; name: string; tabletUrl: string; pairingCode?: string | null }[]
  >([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const {
    pinSetupOpen,
    pinEntryOpen,
    submitting,
    processToken,
    submitPinSetup,
    submitPinEntry,
    closeModals,
  } = useTabletLinkFlow();

  const loadCabinets = useCallback(async () => {
    setLoadingCabinets(true);
    try {
      const res = await listTabletCabinets();
      setCabinets(res.data.cabinets);
    } catch {
      toast({
        title: "Не удалось загрузить кабинеты",
        variant: "destructive",
      });
    } finally {
      setLoadingCabinets(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tabletOpen) void loadCabinets();
  }, [tabletOpen, loadCabinets]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast({ title: "Не удалось скопировать код", variant: "destructive" });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setTabletOpen(true)}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-3 text-sm font-semibold text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-border)]/60"
        title="Планшет в кабинете"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Планшет</span>
      </button>

      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-border)]/60"
      />

      <AppDialog
        open={tabletOpen}
        onOpenChange={setTabletOpen}
        title="Планшет в кабинете"
        size="md"
      >
        <div className="space-y-4 font-manrope text-sm text-[var(--text-secondary)]">
          <p>
            Откройте <strong className="text-[var(--text)]">/tablet</strong> на устройстве в кабинете
            и введите код подключения — или перейдите по прямой ссылке.
          </p>

          {loadingCabinets ? (
            <p className="text-center py-6">Загрузка кабинетов…</p>
          ) : cabinets.length === 0 ? (
            <p className="text-center py-6 text-[var(--text-secondary)]">Кабинеты не найдены</p>
          ) : (
            <ul className="space-y-3">
              {cabinets.map((cabinet) => (
                <li
                  key={cabinet.id}
                  className="rounded-2xl border border-[var(--ds-border)] bg-[var(--surface-2)] p-4"
                >
                  <p className="font-semibold text-[var(--text)]">{cabinet.name}</p>
                  {cabinet.pairingCode && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">Код:</span>
                      <span className="font-mono text-lg font-bold tracking-widest text-[var(--ds-primary)]">
                        {cabinet.pairingCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyCode(cabinet.pairingCode!)}
                        className="rounded-lg p-1.5 hover:bg-[var(--ds-border)]/40"
                        aria-label="Скопировать код"
                      >
                        {copiedCode === cabinet.pairingCode ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => window.open(cabinet.tabletUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Открыть планшет
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AppDialog>

      <TabletPinSetupModal
        open={pinSetupOpen}
        onClose={closeModals}
        onSubmit={submitPinSetup}
        loading={submitting}
      />
      <TabletPinEntryModal
        open={pinEntryOpen}
        onClose={closeModals}
        onSubmit={submitPinEntry}
        loading={submitting}
      />
    </>
  );
}
