import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletPairingCodeModal } from "./tablet-pairing-code-modal";
import { TabletPinSetupModal } from "./tablet-pin-setup-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";

export function TabletScannerSlot() {
  const {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    pinSetupOpen,
    pinSaving,
    processToken,
    closePairingModal,
    submitPinSetup,
    closePinSetup,
  } = useTabletLinkFlow();

  return (
    <>
      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-border)]/60"
      />
      <TabletPairingCodeModal
        open={pairingCodeOpen}
        onClose={() => void closePairingModal()}
        code={pairingCode}
        cabinetName={cabinetName}
      />
      <TabletPinSetupModal
        open={pinSetupOpen}
        onClose={closePinSetup}
        onSubmit={(pin) => void submitPinSetup(pin)}
        loading={pinSaving}
        skipLabel="Пропустить"
      />
    </>
  );
}
