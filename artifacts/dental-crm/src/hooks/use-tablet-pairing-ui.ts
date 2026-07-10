import { create } from "zustand";

interface TabletPairingUiStore {
  isOpen: boolean;
  sessionId: string | null;
  pairingCode: string | null;
  cabinetName: string | null;
  open: (sessionId: string, pairingCode: string, cabinetName?: string | null) => void;
  close: () => void;
}

export const useTabletPairingUiStore = create<TabletPairingUiStore>((set) => ({
  isOpen: false,
  sessionId: null,
  pairingCode: null,
  cabinetName: null,
  open: (sessionId, pairingCode, cabinetName = null) =>
    set({ isOpen: true, sessionId, pairingCode, cabinetName }),
  close: () =>
    set({ isOpen: false, sessionId: null, pairingCode: null, cabinetName: null }),
}));
