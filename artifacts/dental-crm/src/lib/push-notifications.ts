import { getBaseUrl } from "@/lib/base-url";
import { clearAppBadge } from "@/lib/app-badge";
import { isPwaStandalone } from "@/lib/pwa";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Push is gated to the installed PWA (not a regular browser tab). */
export function isPwaPushAvailable(): boolean {
  return isPushSupported() && isPwaStandalone();
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js");
    }

    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Service worker timeout")), 20_000);
      }),
    ]);

    return registration;
  } catch {
    return null;
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

export async function fetchPushStatus(): Promise<{ enabled: boolean; publicKey: string | null }> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/push/status`, {
      headers: getAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { enabled: false, publicKey: null };
    const json = (await res.json()) as { data?: { enabled?: boolean; publicKey?: string | null } };
    return {
      enabled: Boolean(json.data?.enabled),
      publicKey: json.data?.publicKey ?? null,
    };
  } catch {
    return { enabled: false, publicKey: null };
  }
}

async function registerSubscriptionOnServer(subscription: PushSubscription): Promise<void> {
  const body = subscription.toJSON();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    throw new Error("Invalid push subscription");
  }

  const res = await fetch(`${getBaseUrl()}/api/push/subscribe`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    }),
  });

  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
}

export async function subscribeToPushNotifications(): Promise<
  "granted" | "denied" | "unsupported" | "server_disabled" | "sw_unavailable" | "pwa_required"
> {
  if (!isPushSupported()) return "unsupported";
  if (!isPwaStandalone()) return "pwa_required";

  const registration = await getServiceWorkerRegistration();
  if (!registration) return "sw_unavailable";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const status = await fetchPushStatus();
  if (!status.publicKey) return "server_disabled";

  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    try {
      await registerSubscriptionOnServer(subscription);
      return "granted";
    } catch {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });
  } catch {
    await registration.pushManager.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => {});
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });
  }

  await registerSubscriptionOnServer(subscription);
  return "granted";
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await getServiceWorkerRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;

  if (subscription) {
    await fetch(`${getBaseUrl()}/api/push/subscribe`, {
      method: "DELETE",
      headers: getAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});

    await subscription.unsubscribe().catch(() => {});
  }

  await clearAppBadge();
}

export async function syncPushSubscriptionIfGranted(): Promise<boolean> {
  if (!isPwaPushAvailable()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const result = await subscribeToPushNotifications();
    return result === "granted";
  } catch {
    return false;
  }
}

export async function sendTestPush(kind: "tracking" | "notification" = "tracking"): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/push/test`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ kind }),
  });

  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
}

export async function getPushSettingsState(): Promise<{
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  serverEnabled: boolean;
}> {
  const supported = isPushSupported();
  const permission = getNotificationPermission();
  const status = supported ? await fetchPushStatus() : { enabled: false, publicKey: null };
  const subscribed = supported && permission === "granted" ? await hasActivePushSubscription() : false;

  return {
    supported,
    permission,
    subscribed,
    serverEnabled: Boolean(status.enabled && status.publicKey),
  };
}
