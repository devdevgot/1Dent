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
 *  - Same-origin static files (icons, images, manifest): stale-while-revalidate.
 *  - API requests (/api/*) and cross-origin requests: never handled by the SW.
 */

const VERSION = "1dent-pwa-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const STATIC_CACHE = `${VERSION}-static`;

const OFFLINE_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // Offline during install — shell will be cached on first successful navigation.
      }
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
    })(),
  );
});

// Allow the page to trigger an immediate SW takeover after an update.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isCacheableStatic(url) {
  return (
    url.pathname.startsWith("/icons/") ||
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
      "<!doctype html><meta charset=utf-8><title>Офлайн</title><body style=\"font-family:system-ui;padding:2rem;text-align:center;color:#0f172a\"><h1>Нет подключения</h1><p>1Dent недоступен без интернета. Проверьте соединение и попробуйте снова.</p></body>",
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

  if (isCacheableStatic(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
