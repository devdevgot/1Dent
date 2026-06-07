import { create } from "zustand";
import { getBaseUrl } from "@/lib/base-url";

export interface Branch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface BranchState {
  branches: Branch[];
  selectedBranchId: string | null;
  isLoading: boolean;
  hasFetched: boolean;
  setSelectedBranchId: (id: string | null) => void;
  fetchBranches: () => Promise<void>;
}

const STORAGE_KEY = "selected_branch_id";

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  selectedBranchId: localStorage.getItem(STORAGE_KEY),
  isLoading: false,
  hasFetched: false,

  setSelectedBranchId: (id) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ selectedBranchId: id });
  },

  fetchBranches: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${getBaseUrl()}/api/branches`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
      });
      if (!res.ok) {
        set({ branches: [], isLoading: false, hasFetched: true });
        return;
      }
      const json = (await res.json()) as { success: boolean; data: { branches: Branch[] } };
      const branches = json.data?.branches ?? [];
      set({ branches, isLoading: false, hasFetched: true });

      const currentId = get().selectedBranchId;
      if (currentId && !branches.find((b) => b.id === currentId)) {
        localStorage.removeItem(STORAGE_KEY);
        set({ selectedBranchId: null });
      }
    } catch {
      set({ branches: [], isLoading: false, hasFetched: true });
    }
  },
}));
