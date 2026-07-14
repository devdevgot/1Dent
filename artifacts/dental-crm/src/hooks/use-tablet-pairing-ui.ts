import { create } from "zustand";

interface TabletPairingUiStore {
  isOpen: boolean;
  sessionId: string | null;
  cabinetName: string | null;
  open: (sessionId: string, cabinetName?: string | null) => void;
  close: () => void;
}

export const useTabletPairingUiStore = create<TabletPairingUiStore>((set) => ({
  isOpen: false,
  sessionId: null,
  cabinetName: null,
  open: (sessionId, cabinetName = null) =>
    set({ isOpen: true, sessionId, cabinetName }),
  close: () =>
    set({ isOpen: false, sessionId: null, cabinetName: null }),
}));
