import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletPairingConfirmModal } from "./tablet-pairing-confirm-modal";
import { TabletNotPairedModal } from "./tablet-not-paired-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";

export function TabletScannerSlot() {
  const {
    pairingModalOpen,
    cabinetName,
    confirmingPairing,
    notPairedModalOpen,
    closeNotPairedModal,
    processToken,
    confirmPairing,
    closePairingModal,
  } = useTabletLinkFlow();

  return (
    <>
      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ede4] text-[#1f75fe] transition-colors hover:bg-[var(--ds-border)]/60"
      />
      <TabletPairingConfirmModal
        open={pairingModalOpen}
        onClose={closePairingModal}
        cabinetName={cabinetName}
        onConfirm={() => void confirmPairing()}
        confirming={confirmingPairing}
      />
      <TabletNotPairedModal
        open={notPairedModalOpen}
        onClose={closeNotPairedModal}
      />
    </>
  );
}
