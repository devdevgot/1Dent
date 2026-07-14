import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletOwnerActionModal } from "./tablet-owner-action-modal";
import { TabletNotPairedModal } from "./tablet-not-paired-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";

export function TabletScannerSlot() {
  const {
    ownerModalOpen,
    ownerModalMode,
    cabinetName,
    enteringTablet,
    removingTablet,
    notPairedModalOpen,
    closeNotPairedModal,
    processToken,
    enterTablet,
    removeTablet,
    closeOwnerModal,
  } = useTabletLinkFlow();

  return (
    <>
      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ede4] text-[#1f75fe] transition-colors hover:bg-[var(--ds-border)]/60"
      />
      <TabletOwnerActionModal
        open={ownerModalOpen}
        onClose={closeOwnerModal}
        cabinetName={cabinetName}
        isFirstPairing={ownerModalMode === "pairing"}
        onEnter={() => void enterTablet()}
        onRemove={() => void removeTablet()}
        entering={enteringTablet}
        removing={removingTablet}
      />
      <TabletNotPairedModal
        open={notPairedModalOpen}
        onClose={closeNotPairedModal}
      />
    </>
  );
}
