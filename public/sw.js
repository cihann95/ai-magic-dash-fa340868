// Lumen Trade Service Worker
// - Network-first for ALL requests (static + HTML) so new deploys always work
// - Cache used only as offline fallback
// - Web Push: tickle alındığında en güncel bildirimi DB'den çekip gösterir
//
// FIX 2026-06-16: Bumped to v2 — old v1 caches were serving stale hashed
// assets (e.g. /assets/index-OLDHASH.js) that no longer exist on the
// origin after a new Vite build. The previous cache-first strategy for
// /assets/*.js caused a hard MIME-type mismatch loop on the next deploy.
// Strategy is now network-first for everything; cache is offline-only.
const CACHE = "lumen-v2";
const SHELL = ["/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Always go to network first. Cache only as offline fallback.
  // This guarantees new hashed assets from fresh Vite builds are picked up
  // immediately, instead of serving stale /assets/* files that no longer
  // exist on the origin (which used to cause text/html MIME errors).
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful same-origin responses for offline support.
        // Skip API/Supabase endpoints — those are always live.
        if (
          res &&
          res.ok &&
          !url.pathname.startsWith("/functions/") &&
          !url.pathname.startsWith("/rest/") &&
          !url.pathname.startsWith("/auth/")
        ) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Lumen Trade";
  const options = {
    body: data.body || "Yeni bir bildiriminiz var.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link: data.link || "/" },
    tag: data.tag || "lumen-notification",
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = e.notification.data?.link || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) { c.navigate(link); return c.focus(); }
      }
      return self.clients.openWindow(link);
    })
  );
});
