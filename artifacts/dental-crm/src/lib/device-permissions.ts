export type DevicePermissionName = "geolocation" | "camera" | "microphone";

export type DevicePermissionState = PermissionState | "unknown";

export type DevicePermissionPhase = "granted" | "denied" | "prompt";

const GRANT_KEY_PREFIX = "1dent:perm-granted:";
const DISMISS_KEY_PREFIX = "1dent:perm-prompt-dismissed:";

function permissionStorageKey(name: DevicePermissionName): string {
  return `${GRANT_KEY_PREFIX}${name}`;
}

function promptDismissStorageKey(userId: string): string {
  return `${DISMISS_KEY_PREFIX}${userId}`;
}

/** Best-effort read of browser permission state (Safari may return unknown). */
export async function queryDevicePermission(
  name: DevicePermissionName,
): Promise<DevicePermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

export function markPermissionGranted(name: DevicePermissionName): void {
  try {
    localStorage.setItem(permissionStorageKey(name), String(Date.now()));
  } catch {
    // non-critical
  }
}

export function wasPermissionGrantedBefore(name: DevicePermissionName): boolean {
  try {
    return localStorage.getItem(permissionStorageKey(name)) !== null;
  } catch {
    return false;
  }
}

export function markPermissionPromptDismissed(userId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(promptDismissStorageKey(userId), String(Date.now()));
  } catch {
    // non-critical
  }
}

export function wasPermissionPromptDismissed(userId: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(promptDismissStorageKey(userId)) !== null;
  } catch {
    return false;
  }
}

export function clearPermissionPromptDismissed(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(promptDismissStorageKey(userId));
  } catch {
    // non-critical
  }
}

export async function isDevicePermissionGranted(
  name: DevicePermissionName,
): Promise<boolean> {
  const state = await queryDevicePermission(name);
  if (state === "granted") return true;
  if (state === "denied") return false;
  return wasPermissionGrantedBefore(name);
}

/**
 * Resolve whether we should treat a permission as granted, denied, or still need
 * the in-app prompt. Safari often returns "prompt" even after the user allowed
 * access — we trust local one-time consent in that case.
 */
export async function resolveDevicePermissionPhase(
  name: DevicePermissionName,
): Promise<DevicePermissionPhase> {
  const state = await queryDevicePermission(name);
  if (state === "denied") return "denied";
  if (state === "granted" || wasPermissionGrantedBefore(name)) return "granted";
  return "prompt";
}

/** One-shot geolocation request — must be called from a user gesture on iOS PWA. */
export function requestGeolocationAccess(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 20_000,
    });
  });
}

/** Silent refresh when consent was already granted — never shows our in-app prompt. */
export function refreshGeolocationSilently(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation || !wasPermissionGrantedBefore("geolocation")) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        markPermissionGranted("geolocation");
        resolve(position);
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 120_000,
        timeout: 12_000,
      },
    );
  });
}

/** Acquire camera stream; stops tracks immediately if `keepStream` is false. */
export async function requestCameraAccess(options?: {
  facingMode?: "user" | "environment";
  keepStream?: boolean;
}): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: options?.facingMode ? { facingMode: options.facingMode } : true,
    audio: false,
  });

  markPermissionGranted("camera");

  if (!options?.keepStream) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  return stream;
}

/** Acquire microphone stream; stops tracks immediately if `keepStream` is false. */
export async function requestMicrophoneAccess(options?: {
  keepStream?: boolean;
}): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: false,
  });

  markPermissionGranted("microphone");

  if (!options?.keepStream) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  return stream;
}

/**
 * Pre-warm camera + microphone in PWA after geolocation (optional, user gesture).
 * Skips permissions that were already granted so iOS does not re-prompt.
 */
export async function warmMediaPermissions(): Promise<void> {
  if (!(await isDevicePermissionGranted("camera"))) {
    await requestCameraAccess().catch(() => {});
  }

  if (!(await isDevicePermissionGranted("microphone"))) {
    await requestMicrophoneAccess().catch(() => {});
  }
}
