import type { User, Clinic } from "@workspace/api-client-react";
import { saveAuthToken, clearAuthToken } from "@/lib/auth-token";
import { useAuthStore } from "@/hooks/use-auth";

export function bootstrapTabletSessionAuth(token: string, user: User, clinic: Clinic) {
  saveAuthToken(token);
  useAuthStore.getState().setAuth(user, clinic);
}

export function clearTabletSessionAuth() {
  clearAuthToken();
  useAuthStore.getState().clearAuth();
}
