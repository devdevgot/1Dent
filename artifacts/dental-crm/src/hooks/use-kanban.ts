import { create } from "zustand";

interface KanbanStore {
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
  isCreateOpen: boolean;
  setIsCreateOpen: (open: boolean) => void;
  activeTab: "info" | "dental" | "plan" | "ai_analysis";
  setActiveTab: (tab: "info" | "dental" | "plan" | "ai_analysis") => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  selectedPatientId: null,
  setSelectedPatientId: (id) => set({ selectedPatientId: id }),
  isCreateOpen: false,
  setIsCreateOpen: (open) => set({ isCreateOpen: open }),
  activeTab: "info",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
