import { create } from "zustand";

export type TabletOwnerModalMode = "pairing" | "enter";

interface TabletPairingUiStore {
  isOpen: boolean;
  sessionId: string | null;
  cabinetName: string | null;
  mode: TabletOwnerModalMode;
  open: (sessionId: string, cabinetName?: string | null, mode?: TabletOwnerModalMode) => void;
  close: () => void;
}

export const useTabletPairingUiStore = create<TabletPairingUiStore>((set) => ({
  isOpen: false,
  sessionId: null,
  cabinetName: null,
  mode: "pairing",
  open: (sessionId, cabinetName = null, mode = "pairing") =>
    set({ isOpen: true, sessionId, cabinetName, mode }),
  close: () =>
    set({ isOpen: false, sessionId: null, cabinetName: null, mode: "pairing" }),
}));
