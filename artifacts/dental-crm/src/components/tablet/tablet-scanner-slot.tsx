import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletPairingCodeModal } from "./tablet-pairing-code-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";

export function TabletScannerSlot() {
  const {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    resendingPairing,
    confirmingPairing,
    processToken,
    resendPairingCode,
    confirmPairing,
    closePairingModal,
  } = useTabletLinkFlow();

  return (
    <>
      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-border)]/60"
      />
      <TabletPairingCodeModal
        open={pairingCodeOpen}
        onClose={closePairingModal}
        code={pairingCode}
        cabinetName={cabinetName}
        onResend={() => void resendPairingCode()}
        onConfirm={() => void confirmPairing()}
        resending={resendingPairing}
        confirming={confirmingPairing}
      />
    </>
  );
}
