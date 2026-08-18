const CACHE_NAME = "food-compass-v4";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/assets/canteen-reference.jpg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch("/", { cache: "reload" });
  const html = await indexResponse.clone().text();
  const builtAssets = [...html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map((match) => match[1]);

  await cache.put("/", indexResponse);
  await cache.addAll([...new Set([...APP_SHELL, ...builtAssets])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/", { ignoreVary: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
