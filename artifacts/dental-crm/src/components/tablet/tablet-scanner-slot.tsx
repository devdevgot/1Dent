import { TabletQrScannerButton } from "./tablet-qr-scanner";
import { TabletPinSetupModal } from "./tablet-pin-setup-modal";
import { TabletPinEntryModal } from "./tablet-pin-entry-modal";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";

export function TabletScannerSlot() {
  const {
    pinSetupOpen,
    pinEntryOpen,
    submitting,
    processToken,
    submitPinSetup,
    submitPinEntry,
    closeModals,
  } = useTabletLinkFlow();

  return (
    <>
      <TabletQrScannerButton
        onScan={(token) => void processToken(token)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-border)]/60"
      />
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
