// Lumen Trade Service Worker
// - PWA cache-first shell
// - Web Push: tickle alındığında en güncel bildirimi DB'den çekip gösterir
const CACHE = "lumen-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Network-first for API/Supabase calls
  if (url.pathname.startsWith("/functions/") || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;
  // Cache-first for static
  if (/\.(js|css|woff2?|png|jpg|svg|webp|ico)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        return res;
      }).catch(() => hit))
    );
  }
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
