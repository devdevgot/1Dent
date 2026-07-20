import { useSyncExternalStore } from "react";
import {
  getOfflineSyncState,
  getSyncConflicts,
  subscribeOfflineSync,
  type OfflineSyncState,
  type SyncConflict,
} from "@/lib/offline";

export function useOfflineSyncState(): OfflineSyncState {
  return useSyncExternalStore(
    subscribeOfflineSync,
    getOfflineSyncState,
    getOfflineSyncState,
  );
}

export function useSyncConflicts(): SyncConflict[] {
  return useSyncExternalStore(
    subscribeOfflineSync,
    getSyncConflicts,
    () => [],
  );
}
