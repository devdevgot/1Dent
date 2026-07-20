import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let online = typeof navigator !== "undefined" ? navigator.onLine : true;
let listening = false;

function emit(): void {
  listeners.forEach((l) => l());
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("online", () => {
    online = true;
    emit();
  });
  window.addEventListener("offline", () => {
    online = false;
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  ensureListening();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  ensureListening();
  return online;
}

function getServerSnapshot(): boolean {
  return true;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function subscribeOnlineStatus(listener: () => void): () => void {
  return subscribe(listener);
}
