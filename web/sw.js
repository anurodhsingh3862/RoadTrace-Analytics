// Minimal offline-capable service worker for the on-device page.
//
// Strategy: precache the small "app shell" (HTML/JS/manifest/icons) on
// install so the page loads offline after the first visit. Everything
// else — the ONNX model, the onnxruntime-web CDN bundle — is cached the
// first time it's actually fetched (runtime caching), since those are
// large/cross-origin and we don't want to force-download them just to
// install the app. Bump CACHE_VERSION when app-shell files change so
// old caches get cleaned up instead of serving stale code forever.
const CACHE_VERSION = "roadtrace-v12";
const APP_SHELL = [
  "./index.html",
  "./camera.html",
  "./dashboard.html",
  "./manifest.json",
  "./theme.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./src/home.js",
  "./src/camera-app.js",
  "./src/dashboard-app.js",
  "./src/detector.js",
  "./src/tracker.js",
  "./src/speed.js",
  "./src/motion.js",
  "./src/calibration.js",
  "./src/postprocess.js",
  "./src/context.js",
  "./src/i18n.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Only cache successful, same-origin-or-CORS-ok responses; a
          // failed/opaque response cached here would permanently hide a
          // real error behind "it looked like it worked".
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline and not cached: let the request fail naturally
    })
  );
});
