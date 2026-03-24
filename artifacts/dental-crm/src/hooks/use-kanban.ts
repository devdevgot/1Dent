import { create } from "zustand";

interface KanbanStore {
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
  isCreateOpen: boolean;
  setIsCreateOpen: (open: boolean) => void;
  activeTab: "history" | "dental";
  setActiveTab: (tab: "history" | "dental") => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  selectedPatientId: null,
  setSelectedPatientId: (id) => set({ selectedPatientId: id }),
  isCreateOpen: false,
  setIsCreateOpen: (open) => set({ isCreateOpen: open }),
  activeTab: "history",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
