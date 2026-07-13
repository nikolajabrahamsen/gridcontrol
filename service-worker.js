// GridControl service worker – håndterer push-notifikationer OG offline-adgang til app-shellen.
// Denne fil SKAL ligge som selvstændig fil ved siden af appen (samme mappe) på GitHub.
//
// Caching-strategi (bevidst valgt for at undgå at admin/officials sidder fast på en gammel version):
//   - Navigation (index.html / scan.html) og alt fra samme domæne: NETWORK-FIRST.
//     Er der internet, hentes altid den nyeste version fra serveren (og caches til senere offline-brug).
//     Er der IKKE internet, falder den tilbage til den sidst hentede version fra cachen.
//   - Faste CDN-filer (React/Babel/Supabase-bibliotek, Google Fonts): CACHE-FIRST, med baggrunds-opdatering.
//     Disse skifter sjældent, så vi undgår at være afhængige af at CDN'et kan nås ved hver eneste indlæsning.
//   - Supabase API/data-kald og alt andet (fx push-relaterede kald): rørt IKKE af service workeren.
//     De skal altid gå direkte på nettet – ellers risikerer man at se forældede data uden at vide det.
//
// VIGTIGT ved fremtidige opdateringer: hvis du tilføjer nye filer der skal virke offline (fx en ny side),
// tilføj dem til PRECACHE_URLS herunder. CACHE_VERSION behøver IKKE bumpes manuelt ved almindelige
// indholdsopdateringer – network-first sørger for at online brugere altid får det nyeste.

const CACHE_VERSION = "v2";
const CACHE_NAME = `gridcontrol-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "index.html",
  "scan.html",
  "gridcontrol-icon-192.png",
  "gridcontrol-icon-512.png",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&family=Barlow+Condensed:wght@700;900&display=swap",
];

// CDN-domæner der cache-first'es (statiske biblioteker/fonte). Alt andet cross-origin
// (fx Supabase) rører service workeren ikke ved – det skal altid ramme nettet direkte.
const STATIC_CDN_HOSTS = ["unpkg.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Hver URL caches enkeltvis (ikke cache.addAll) så én manglende/fejlende fil
      // (fx hvis et ikon-filnavn ikke findes) ikke vælter hele precache-trinnet.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] Kunne ikke precache", url, err);
          })
        )
      );
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // Ryd gamle cache-versioner op, hvis CACHE_VERSION nogensinde bumpes.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Clone IMMEDIATELY (no await in between) – cloning after any async gap risks the original
    // response's body already having been read elsewhere, which throws "Response body is already used".
    const copy = fresh.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Sidste udvej for navigation: prøv index.html fra cache, ellers en simpel offline-besked.
    if (request.mode === "navigate") {
      const fallback = await caches.match("index.html");
      if (fallback) return fallback;
      return new Response(
        "<html><body style='background:#0D0D0D;color:#F5F5F5;font-family:sans-serif;text-align:center;padding:60px 20px;'>" +
          "<h2>Ingen forbindelse</h2><p>Denne side er ikke gemt til offline-brug endnu. Prøv igen når du har internet.</p>" +
          "</body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Serve the cached copy immediately, and refresh it in the background — failures here must
    // never affect what's already been returned.
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
      })
      .catch(() => {});
    return cached;
  }
  const fresh = await fetch(request);
  const copy = fresh.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // aldrig røre skrivninger (fx Supabase-gem)

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = req.mode === "navigate";
  const isStaticCDN = STATIC_CDN_HOSTS.includes(url.hostname);

  if (isSameOrigin || isNavigation) {
    event.respondWith(networkFirst(req));
  } else if (isStaticCDN) {
    event.respondWith(cacheFirst(req));
  }
  // Alt andet (Supabase API/storage, m.m.): lad browseren håndtere det normalt, uden indblanding.
});

// Modtag en push fra serveren og vis en notifikation
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "GridControl", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "GridControl";
  const options = {
    body: data.body || "",
    icon: data.icon || "gridcontrol-icon-192.png",
    badge: data.badge || "gridcontrol-icon-192.png",
    tag: data.tag || "gridcontrol-notif",
    data: { url: data.url || "." },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Åbn/fokusér appen når man trykker på notifikationen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || ".";
  const isDoc = /^https?:\/\//.test(targetUrl) && !targetUrl.endsWith("/");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Er det et dokument-link (fx en PDF)? Åbn det direkte i en ny fane.
      if (isDoc && self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      // Ellers: fokusér appen hvis den er åben, og bed den navigere til rette sted.
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "notif-click", url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
