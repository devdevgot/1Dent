export type DevicePermissionName = "geolocation" | "camera" | "microphone";

export type DevicePermissionState = PermissionState | "unknown";

const GRANT_KEY_PREFIX = "1dent:perm-granted:";

function permissionStorageKey(name: DevicePermissionName): string {
  return `${GRANT_KEY_PREFIX}${name}`;
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

export async function isDevicePermissionGranted(
  name: DevicePermissionName,
): Promise<boolean> {
  const state = await queryDevicePermission(name);
  if (state === "granted") return true;
  if (state === "denied") return false;
  return wasPermissionGrantedBefore(name);
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
 * Ignores individual failures so one denial doesn't block the rest.
 */
export async function warmMediaPermissions(): Promise<void> {
  await requestCameraAccess().catch(() => {});
  await requestMicrophoneAccess().catch(() => {});
}
