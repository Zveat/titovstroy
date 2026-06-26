// TitovStroy Service Worker — offline shell cache
const CACHE = "ts-shell-v2";
const SHELL = ["/", "/index.html", "/icon192.png", "/icon512.png", "/appletouchicon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Firebase и CDN — только сеть, без кэша
  if (url.hostname.includes("firebase") || url.hostname.includes("googleapis") ||
      url.hostname.includes("unpkg") || url.hostname.includes("fonts")) {
    return;
  }
  // Навигационные запросы — сначала сеть, fallback на кэш (shell)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
    return;
  }
  // Статика — network-first: всегда берём свежую версию из сети (чтобы после
  // деплоя не показывалась старая сборка), кэш только как offline-fallback.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type !== "opaque") {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
