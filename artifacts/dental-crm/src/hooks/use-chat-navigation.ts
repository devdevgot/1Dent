import { create } from "zustand";

interface ChatNavigationStore {
  pendingPatientId: string | null;
  selectPatient: (id: string) => void;
  consumePendingPatient: () => string | null;
}

export const useChatNavigationStore = create<ChatNavigationStore>((set, get) => ({
  pendingPatientId: null,
  selectPatient: (id) => set({ pendingPatientId: id }),
  consumePendingPatient: () => {
    const id = get().pendingPatientId;
    if (id) set({ pendingPatientId: null });
    return id;
  },
}));
