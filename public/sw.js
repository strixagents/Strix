// Strix service worker — makes the installed app open even without a connection.
// Live data is never cached: pages and APIs always come from the network, and only
// when the network is unreachable does a page request fall back to the offline screen.
const CACHE = "strix-shell-v2";
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});

// push notifications (price alerts, Rug Radar) — shown even when Strix is closed
self.addEventListener("push", (event) => {
  let n = { title: "Strix", body: "", url: "/agent" };
  try { n = { ...n, ...event.data.json() }; } catch { if (event.data) n.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, renotify: !!n.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: n.url || "/agent" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/agent", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = wins.find((w) => w.url.startsWith(self.location.origin));
    if (same) { await same.focus(); return same.navigate(url).catch(() => self.clients.openWindow(url)); }
    return self.clients.openWindow(url);
  })());
});
