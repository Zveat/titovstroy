// TitovStroy Service Worker — offline shell cache
//
// ВЕРСИЮ НИЖЕ НУЖНО МЕНЯТЬ, КОГДА НАДО РАЗБУДИТЬ УЖЕ ЗАВИСШИЕ УСТРОЙСТВА.
// Браузер считает, что вышло обновление, только если файл sw.js изменился хоть
// на байт. Пока он не менялся, телефон мог неделями крутить старый код: 16
// сентября владелец удалил сметы в 12:52, а уведомления пришли в 18:34 — в его
// вкладке просто не было кода быстрой отправки, и за сутки браузер не сделал ни
// одного запроса. Смена версии здесь заставляет старый код увидеть новый SW,
// активировать его и один раз перезагрузить страницу.
//
// На будущее этого делать не придётся: приложение регистрирует SW по адресу с
// отпечатком сборки (main.jsx), поэтому каждая выкатка сама выглядит как новый
// файл. Эта строка — разовое спасение тех, кто завис на коде БЕЗ той правки.
const CACHE = "ts-shell-v4";
const SHELL = ["/", "/index.html", "/icon192.png", "/icon512.png", "/appletouchicon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Позволяет странице попросить новый SW активироваться немедленно (авто-обновление кода)
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

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
