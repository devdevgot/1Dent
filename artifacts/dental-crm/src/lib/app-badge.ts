import { isPwaStandalone } from "@/lib/pwa";

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function badgeNavigator(): BadgeNavigator | null {
  if (typeof navigator === "undefined") return null;
  return navigator as BadgeNavigator;
}

function notificationPermissionGranted(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** True when the installed PWA may show a home-screen badge. */
export function canUseAppBadge(): boolean {
  if (!isPwaStandalone()) return false;
  if (!notificationPermissionGranted()) return false;
  return true;
}

function supportsBadgingApi(): boolean {
  const nav = badgeNavigator();
  return typeof nav?.setAppBadge === "function";
}

/** Close open system notifications so Android can drop the icon badge/dot. */
async function dismissOpenNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.getNotifications) return;
    const notes = await registration.getNotifications();
    for (const note of notes) note.close();
  } catch {
    // ignore
  }
}

/** Sync the home-screen icon badge with unread CRM notifications. */
export async function syncAppBadge(unreadCount: number): Promise<void> {
  if (!canUseAppBadge()) return;

  const n = Math.max(0, Math.floor(Number.isFinite(unreadCount) ? unreadCount : 0));
  const nav = badgeNavigator();

  try {
    if (supportsBadgingApi() && nav?.setAppBadge) {
      if (n <= 0) {
        if (typeof nav.clearAppBadge === "function") {
          await nav.clearAppBadge();
        } else {
          await nav.setAppBadge(0);
        }
      } else {
        await nav.setAppBadge(n);
      }
    }

    // Android often badges from the notification shade rather than Badging API.
    if (n <= 0) {
      await dismissOpenNotifications();
    }
  } catch {
    // Badging can throw if permission was revoked mid-session — ignore.
  }
}

export async function clearAppBadge(): Promise<void> {
  if (!isPwaStandalone()) return;
  const nav = badgeNavigator();

  try {
    if (typeof nav?.clearAppBadge === "function") {
      await nav.clearAppBadge();
    } else if (typeof nav?.setAppBadge === "function") {
      await nav.setAppBadge(0);
    }
    await dismissOpenNotifications();
  } catch {
    // ignore
  }
}
