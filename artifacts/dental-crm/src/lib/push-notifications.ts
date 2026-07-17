import { getBaseUrl } from "@/lib/base-url";

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

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function fetchPushStatus(): Promise<{ enabled: boolean; publicKey: string | null }> {
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
}

export async function subscribeToPushNotifications(): Promise<"granted" | "denied" | "unsupported" | "server_disabled"> {
  if (!isPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const status = await fetchPushStatus();
  if (!status.enabled || !status.publicKey) return "server_disabled";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    }));

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
    throw new Error(`Subscribe failed: ${res.status}`);
  }

  return "granted";
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch(`${getBaseUrl()}/api/push/subscribe`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});

  await subscription.unsubscribe().catch(() => {});
}

export async function syncPushSubscriptionIfGranted(): Promise<boolean> {
  if (!isPushSupported()) return false;
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
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
}
