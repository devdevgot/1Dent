import { create } from "zustand";
import type { User, Clinic } from "@workspace/api-client-react";

interface AuthState {
  user: User | null;
  clinic: Clinic | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, clinic: Clinic) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  clinic: null,
  isAuthenticated: false,
  isLoading: true,
  setAuth: (user, clinic) => set({ user, clinic, isAuthenticated: true, isLoading: false }),
  clearAuth: () => set({ user: null, clinic: null, isAuthenticated: false, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
