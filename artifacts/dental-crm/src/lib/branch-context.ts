import { setBranchIdGetter } from "@workspace/api-client-react";

const BRANCH_STORAGE_KEY = "selected_branch_id";

export function restoreBranchContext() {
  setBranchIdGetter(() => localStorage.getItem(BRANCH_STORAGE_KEY));
}

export function syncBranchContext(branchId: string | null) {
  if (branchId) {
    localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
  } else {
    localStorage.removeItem(BRANCH_STORAGE_KEY);
  }
  setBranchIdGetter(() => localStorage.getItem(BRANCH_STORAGE_KEY));
}

export function getBranchRequestHeaders(): Record<string, string> {
  const branchId = localStorage.getItem(BRANCH_STORAGE_KEY);
  return branchId ? { "X-Clinic-Branch-Id": branchId } : {};
}
