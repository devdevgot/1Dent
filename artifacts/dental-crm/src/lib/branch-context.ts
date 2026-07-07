import { setBranchIdGetter } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";

const BRANCH_STORAGE_KEY = "selected_branch_id";

function resolveBranchIdForRequest(): string | null {
  const branchId = localStorage.getItem(BRANCH_STORAGE_KEY);
  if (!branchId) return null;
  const role = useAuthStore.getState().user?.role;
  // Never attach branch scope until we know the user is the clinic owner.
  if (role !== "owner") return null;
  return branchId;
}

export function restoreBranchContext() {
  setBranchIdGetter(() => resolveBranchIdForRequest());
}

export function syncBranchContext(branchId: string | null) {
  if (branchId) {
    localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
  } else {
    localStorage.removeItem(BRANCH_STORAGE_KEY);
  }
  setBranchIdGetter(() => resolveBranchIdForRequest());
}

export function clearBranchContext() {
  localStorage.removeItem(BRANCH_STORAGE_KEY);
  setBranchIdGetter(() => null);
}

export function getBranchRequestHeaders(): Record<string, string> {
  const branchId = resolveBranchIdForRequest();
  return branchId ? { "x-clinic-branch-id": branchId } : {};
}
