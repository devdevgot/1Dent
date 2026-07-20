/*
 * 1Dent service worker.
 *
 * Goal: make the CRM installable ("Add to Home Screen") and behave like a native
 * app across devices, WITHOUT introducing stale-deploy bugs.
 *
 * Strategy:
 *  - Navigations: network-first, fall back to the cached app shell only when
 *    offline. This keeps deploys fresh (new index.html is always fetched online).
 *  - Hashed build assets (/assets/*): cache-first. Filenames are content-hashed
 *    and immutable, so cached copies are always correct and enable offline reloads.
 *  - App 3D icons (/icons/*): cache-first (small, immutable-enough assets).
 *  - Other same-origin static files (images, manifest, fonts): stale-while-revalidate.
 *  - API requests (/api/*) and cross-origin requests: never handled by the SW.
 *  - On activate after a version bump, tell open clients to reload once so lazy
 *    chunks match the fresh shell (avoids blank Schedule / other lazy routes).
 */

const VERSION = "1dent-pwa-v12";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const STATIC_CACHE = `${VERSION}-static`;

const OFFLINE_URL = "/index.html";
const SYNC_TAG = "1dent-outbox-sync";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // Offline during install — shell will be cached on first successful navigation.
      }
      // Take over ASAP after deploy so clients don't keep an old module graph.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({ type: "SW_UPDATED", version: VERSION });
      }
    })(),
  );
});

// Allow the page to trigger an immediate SW takeover after an update,
// or ask clients to flush the offline outbox after Background Sync.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "REQUEST_OUTBOX_SYNC") {
    event.waitUntil(
      (async () => {
        try {
          if ("sync" in self.registration) {
            await self.registration.sync.register(SYNC_TAG);
          }
        } catch {
          // Background Sync may be unsupported / permission denied.
        }
      })(),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({ type: "FLUSH_OUTBOX" });
      }
    })(),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isAppIcon(url) {
  return url.pathname.startsWith("/icons/");
}

function isCacheableStatic(url) {
  if (isAppIcon(url)) return false;
  return (
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname)
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // Keep the freshest shell around for offline reloads.
    cache.put(OFFLINE_URL, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached =
      (await cache.match(request)) || (await cache.match(OFFLINE_URL));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Офлайн</title><body style=\"font-family:system-ui;padding:2rem;text-align:center;color:#0f172a\"><h1>Нет подключения</h1><p>Откройте установленное приложение 1Dent — клинические данные и несинхронизированные изменения доступны офлайн и отправятся при появлении сети.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch API, webhook or server-rendered public routes.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/p/") ||
    url.pathname.startsWith("/wa") ||
    url.pathname.startsWith("/r/") ||
    url.pathname.startsWith("/ref") ||
    url.pathname.startsWith("/tg-admin")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Profile/Services 3D icons: serve instantly from cache to avoid blank
  // circles when the network is slow or the SW race aborts a large PNG.
  if (isAppIcon(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

async function updateAppBadgeFromPush(payload) {
  const nav = self.navigator;
  if (!nav || typeof nav.setAppBadge !== "function") return;

  try {
    if (typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount)) {
      const n = Math.max(0, Math.floor(payload.unreadCount));
      if (n <= 0) {
        if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
        else await nav.setAppBadge(0);
      } else {
        await nav.setAppBadge(n);
      }
      return;
    }

    // Tracking / broadcast pushes without an unread count: badge = open notifications.
    const notes = await self.registration.getNotifications();
    const count = Math.max(1, notes.length);
    await nav.setAppBadge(count);
  } catch {
    // Badging unsupported or permission revoked — ignore.
  }
}

function askClientsToSyncAppBadge() {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
    for (const client of windowClients) {
      client.postMessage({ type: "1DENT_SYNC_APP_BADGE" });
    }
  });
}

self.addEventListener("push", (event) => {
  let payload = {
    title: "Уведомление",
    body: "",
    url: "/",
    tag: "1dent",
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/pwa/icon-192.png",
        badge: "/icons/pwa/icon-192.png",
        tag: payload.tag || "1dent",
        data: { url: payload.url || "/" },
      });
      // Home-screen badge (iOS PWA Badging API; Android often auto-badges from notifications).
      await updateAppBadgeFromPush(payload);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      await askClientsToSyncAppBadge();
      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const urlToOpen = new URL(targetUrl, self.location.origin).href;
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
      return undefined;
    })(),
  );
});
