import { useState, useEffect, useCallback } from "react";

export type InventoryAccessLevel = "full_access" | "read_only" | "denied";

const STORAGE_KEY = "dental_crm_inventory_access_v1";

function readRaw(): Record<string, InventoryAccessLevel> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Roles that always retain full access regardless of settings */
const ALWAYS_FULL_ACCESS = ["owner", "warehouse"];

/**
 * Hook for the current user — reads their access level from localStorage.
 * Listens to storage events so changes by the owner propagate in real-time.
 */
export function useMyInventoryAccess(userId: string | undefined, role: string | undefined): InventoryAccessLevel {
  const getLevel = useCallback((): InventoryAccessLevel => {
    if (!userId || !role) return "denied";
    if (ALWAYS_FULL_ACCESS.includes(role)) return "full_access";
    const raw = readRaw();
    return raw[userId] ?? "full_access";
  }, [userId, role]);

  const [level, setLevel] = useState<InventoryAccessLevel>(getLevel);

  useEffect(() => {
    setLevel(getLevel());
  }, [getLevel]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY || e.key === null) {
        setLevel(getLevel());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [getLevel]);

  return level;
}

/**
 * Hook for owner's management panel — reads and writes all users' access levels.
 */
export function useInventoryAccessManager() {
  const [permissions, setPermissions] = useState<Record<string, InventoryAccessLevel>>(readRaw);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY || e.key === null) {
        setPermissions(readRaw());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setUserAccess = useCallback((userId: string, level: InventoryAccessLevel) => {
    const updated = { ...readRaw(), [userId]: level };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setPermissions(updated);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(updated) }));
  }, []);

  const getAccess = useCallback((userId: string, role: string): InventoryAccessLevel => {
    if (ALWAYS_FULL_ACCESS.includes(role)) return "full_access";
    return permissions[userId] ?? "full_access";
  }, [permissions]);

  return { permissions, setUserAccess, getAccess };
}
